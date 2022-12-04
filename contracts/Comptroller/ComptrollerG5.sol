pragma solidity ^0.5.16;

import "./../NTokens/NToken.sol";
import "./../ErrorReporter.sol";
import "./../Oracle/PriceOracle.sol";
import "./ComptrollerInterface.sol";
import "./ComptrollerStorage.sol";
import "./Unitroller.sol";
import "./../Governance/MIA.sol";
import "./../SEB/SEB.sol";


/**
 * @title Lalalend's Comptroller Contract
 * @author Lalalend
 */
contract ComptrollerG5 is ComptrollerV5Storage, ComptrollerInterfaceG2, ComptrollerErrorReporter, ExponentialNoError {
    /// @notice Emitted when an admin supports a market
    event MarketListed(NToken nToken);

    /// @notice Emitted when an account enters a market
    event MarketEntered(NToken nToken, address account);

    /// @notice Emitted when an account exits a market
    event MarketExited(NToken nToken, address account);

    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(uint oldCloseFactorMantissa, uint newCloseFactorMantissa);

    /// @notice Emitted when a collateral factor is changed by admin
    event NewCollateralFactor(NToken nToken, uint oldCollateralFactorMantissa, uint newCollateralFactorMantissa);

    /// @notice Emitted when liquidation incentive is changed by admin
    event NewLiquidationIncentive(uint oldLiquidationIncentiveMantissa, uint newLiquidationIncentiveMantissa);

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(PriceOracle oldPriceOracle, PriceOracle newPriceOracle);

    /// @notice Emitted when SEB Vault info is changed
    event NewSEBVaultInfo(address vault_, uint releaseStartBlock_, uint releaseInterval_);

    /// @notice Emitted when pause guardian is changed
    event NewPauseGuardian(address oldPauseGuardian, address newPauseGuardian);

    /// @notice Emitted when an action is paused globally
    event ActionPaused(string action, bool pauseState);

    /// @notice Emitted when an action is paused on a market
    event ActionPaused(NToken nToken, string action, bool pauseState);

    /// @notice Emitted when Mia SEB Vault rate is changed
    event NewMiaSEBVaultRate(uint oldMiaSEBVaultRate, uint newMiaSEBVaultRate);

    /// @notice Emitted when a new Mia speed is calculated for a market
    event MiaSpeedUpdated(NToken indexed nToken, uint newSpeed);

    /// @notice Emitted when MIA is distributed to a supplier
    event DistributedSupplierMia(NToken indexed nToken, address indexed supplier, uint miaDelta, uint miaSupplyIndex);

    /// @notice Emitted when MIA is distributed to a borrower
    event DistributedBorrowerMia(NToken indexed nToken, address indexed borrower, uint miaDelta, uint miaBorrowIndex);

    /// @notice Emitted when MIA is distributed to a SEB minter
    event DistributedSEBMinterMia(address indexed sebMinter, uint miaDelta, uint miaSEBMintIndex);

    /// @notice Emitted when MIA is distributed to SEB Vault
    event DistributedSEBVaultMia(uint amount);

    /// @notice Emitted when SEBController is changed
    event NewSEBController(SEBControllerInterface oldSEBController, SEBControllerInterface newSEBController);

    /// @notice Emitted when SEB mint rate is changed by admin
    event NewSEBMintRate(uint oldSEBMintRate, uint newSEBMintRate);

    /// @notice Emitted when protocol state is changed by admin
    event ActionProtocolPaused(bool state);

    /// @notice Emitted when borrow cap for a nToken is changed
    event NewBorrowCap(NToken indexed nToken, uint newBorrowCap);

    /// @notice Emitted when borrow cap guardian is changed
    event NewBorrowCapGuardian(address oldBorrowCapGuardian, address newBorrowCapGuardian);

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint oldTreasuryPercent, uint newTreasuryPercent);

    /// @notice Emitted when Mia is granted by admin
    event MiaGranted(address recipient, uint amount);

    /// @notice The initial Mia index for a market
    uint224 public constant miaInitialIndex = 1e36;

    // closeFactorMantissa must be strictly greater than this value
    uint internal constant closeFactorMinMantissa = 0.05e18; // 0.05

    // closeFactorMantissa must not exceed this value
    uint internal constant closeFactorMaxMantissa = 0.9e18; // 0.9

    // No collateralFactorMantissa may exceed this value
    uint internal constant collateralFactorMaxMantissa = 0.9e18; // 0.9

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyProtocolAllowed {
        require(!protocolPaused, "protocol is paused");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier onlyListedMarket(NToken nToken) {
        require(markets[address(nToken)].isListed, "mia market is not listed");
        _;
    }

    modifier validPauseState(bool state) {
        require(msg.sender == pauseGuardian || msg.sender == admin, "only pause guardian and admin can");
        require(msg.sender == admin || state == true, "only admin can unpause");
        _;
    }

    /*** Assets You Are In ***/

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account) external view returns (NToken[] memory) {
        return accountAssets[account];
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param nToken The nToken to check
     * @return True if the account is in the asset, otherwise false.
     */
    function checkMembership(address account, NToken nToken) external view returns (bool) {
        return markets[address(nToken)].accountMembership[account];
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param nTokens The list of addresses of the nToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] calldata nTokens) external returns (uint[] memory) {
        uint len = nTokens.length;

        uint[] memory results = new uint[](len);
        for (uint i = 0; i < len; i++) {
            results[i] = uint(addToMarketInternal(NToken(nTokens[i]), msg.sender));
        }

        return results;
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param nToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(NToken nToken, address borrower) internal returns (Error) {
        Market storage marketToJoin = markets[address(nToken)];

        if (!marketToJoin.isListed) {
            // market is not listed, cannot join
            return Error.MARKET_NOT_LISTED;
        }

        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return Error.NO_ERROR;
        }

        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(nToken);

        emit MarketEntered(nToken, borrower);

        return Error.NO_ERROR;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow.
     * @param nTokenAddress The address of the asset to be removed
     * @return Whether or not the account successfully exited the market
     */
    function exitMarket(address nTokenAddress) external returns (uint) {
        NToken nToken = NToken(nTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the nToken */
        (uint oErr, uint tokensHeld, uint amountOwed, ) = nToken.getAccountSnapshot(msg.sender);
        require(oErr == 0, "getAccountSnapshot failed"); // semi-opaque error code

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            return fail(Error.NONZERO_BORROW_BALANCE, FailureInfo.EXIT_MARKET_BALANCE_OWED);
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint allowed = redeemAllowedInternal(nTokenAddress, msg.sender, tokensHeld);
        if (allowed != 0) {
            return failOpaque(Error.REJECTION, FailureInfo.EXIT_MARKET_REJECTION, allowed);
        }

        Market storage marketToExit = markets[address(nToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return uint(Error.NO_ERROR);
        }

        /* Set nToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete nToken from the account’s list of assets */
        // In order to delete nToken, copy last item in list to location of item to be removed, reduce length by 1
        NToken[] storage userAssetList = accountAssets[msg.sender];
        uint len = userAssetList.length;
        uint i;
        for (; i < len; i++) {
            if (userAssetList[i] == nToken) {
                userAssetList[i] = userAssetList[len - 1];
                userAssetList.length--;
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(i < len);

        emit MarketExited(nToken, msg.sender);

        return uint(Error.NO_ERROR);
    }

    /*** Policy Hooks ***/

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param nToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @return 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function mintAllowed(address nToken, address minter, uint mintAmount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintGuardianPaused[nToken], "mint is paused");

        // Shh - currently unused
        mintAmount;

        if (!markets[nToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        // Keep the flywheel moving
        updateMiaSupplyIndex(nToken);
        distributeSupplierMia(nToken, minter);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates mint and reverts on rejection. May emit logs.
     * @param nToken Asset being minted
     * @param minter The address minting the tokens
     * @param actualMintAmount The amount of the underlying asset being minted
     * @param mintTokens The number of tokens being minted
     */
    function mintVerify(address nToken, address minter, uint actualMintAmount, uint mintTokens) external {
        // Shh - currently unused
        nToken;
        minter;
        actualMintAmount;
        mintTokens;
    }

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param nToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of nTokens to exchange for the underlying asset in the market
     * @return 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function redeemAllowed(address nToken, address redeemer, uint redeemTokens) external onlyProtocolAllowed returns (uint) {
        uint allowed = redeemAllowedInternal(nToken, redeemer, redeemTokens);
        if (allowed != uint(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateMiaSupplyIndex(nToken);
        distributeSupplierMia(nToken, redeemer);

        return uint(Error.NO_ERROR);
    }

    function redeemAllowedInternal(address nToken, address redeemer, uint redeemTokens) internal view returns (uint) {
        if (!markets[nToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!markets[nToken].accountMembership[redeemer]) {
            return uint(Error.NO_ERROR);
        }

        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(redeemer, NToken(nToken), redeemTokens, 0);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(Error.INSUFFICIENT_LIQUIDITY);
        }

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates redeem and reverts on rejection. May emit logs.
     * @param nToken Asset being redeemed
     * @param redeemer The address redeeming the tokens
     * @param redeemAmount The amount of the underlying asset being redeemed
     * @param redeemTokens The number of tokens being redeemed
     */
    function redeemVerify(address nToken, address redeemer, uint redeemAmount, uint redeemTokens) external {
        // Shh - currently unused
        nToken;
        redeemer;

        // Require tokens is zero or amount is also zero
        require(redeemTokens != 0 || redeemAmount == 0, "redeemTokens zero");
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param nToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @return 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function borrowAllowed(address nToken, address borrower, uint borrowAmount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!borrowGuardianPaused[nToken], "borrow is paused");

        if (!markets[nToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        if (!markets[nToken].accountMembership[borrower]) {
            // only nTokens may call borrowAllowed if borrower not in market
            require(msg.sender == nToken, "sender must be nToken");

            // attempt to add borrower to the market
            Error err = addToMarketInternal(NToken(nToken), borrower);
            if (err != Error.NO_ERROR) {
                return uint(err);
            }
        }

        if (oracle.getUnderlyingPrice(NToken(nToken)) == 0) {
            return uint(Error.PRICE_ERROR);
        }

        uint borrowCap = borrowCaps[nToken];
        // Borrow cap of 0 corresponds to unlimited borrowing
        if (borrowCap != 0) {
            uint totalBorrows = NToken(nToken).totalBorrows();
            uint nextTotalBorrows = add_(totalBorrows, borrowAmount);
            require(nextTotalBorrows < borrowCap, "market borrow cap reached");
        }

        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(borrower, NToken(nToken), 0, borrowAmount);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(Error.INSUFFICIENT_LIQUIDITY);
        }

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({mantissa: NToken(nToken).borrowIndex()});
        updateMiaBorrowIndex(nToken, borrowIndex);
        distributeBorrowerMia(nToken, borrower, borrowIndex);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates borrow and reverts on rejection. May emit logs.
     * @param nToken Asset whose underlying is being borrowed
     * @param borrower The address borrowing the underlying
     * @param borrowAmount The amount of the underlying asset requested to borrow
     */
    function borrowVerify(address nToken, address borrower, uint borrowAmount) external {
        // Shh - currently unused
        nToken;
        borrower;
        borrowAmount;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to repay a borrow in the given market
     * @param nToken The market to verify the repay against
     * @param payer The account which would repay the asset
     * @param borrower The account which would repay the asset
     * @param repayAmount The amount of the underlying asset the account would repay
     * @return 0 if the repay is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function repayBorrowAllowed(
        address nToken,
        address payer,
        address borrower,
        uint repayAmount) external onlyProtocolAllowed returns (uint) {
        // Shh - currently unused
        payer;
        borrower;
        repayAmount;

        if (!markets[nToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({mantissa: NToken(nToken).borrowIndex()});
        updateMiaBorrowIndex(nToken, borrowIndex);
        distributeBorrowerMia(nToken, borrower, borrowIndex);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates repayBorrow and reverts on rejection. May emit logs.
     * @param nToken Asset being repaid
     * @param payer The address repaying the borrow
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function repayBorrowVerify(
        address nToken,
        address payer,
        address borrower,
        uint actualRepayAmount,
        uint borrowerIndex) external {
        // Shh - currently unused
        nToken;
        payer;
        borrower;
        actualRepayAmount;
        borrowerIndex;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the liquidation should be allowed to occur
     * @param nTokenBorrowed Asset which was borrowed by the borrower
     * @param nTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param repayAmount The amount of underlying being repaid
     */
    function liquidateBorrowAllowed(
        address nTokenBorrowed,
        address nTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount) external onlyProtocolAllowed returns (uint) {
        // Shh - currently unused
        liquidator;

        if (!(markets[nTokenBorrowed].isListed || address(nTokenBorrowed) == address(sebController)) || !markets[nTokenCollateral].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        /* The borrower must have shortfall in order to be liquidatable */
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(borrower, NToken(0), 0, 0);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall == 0) {
            return uint(Error.INSUFFICIENT_SHORTFALL);
        }

        /* The liquidator may not repay more than what is allowed by the closeFactor */
        uint borrowBalance;
        if (address(nTokenBorrowed) != address(sebController)) {
            borrowBalance = NToken(nTokenBorrowed).borrowBalanceStored(borrower);
        } else {
            borrowBalance = mintedSEBs[borrower];
        }

        uint maxClose = mul_ScalarTruncate(Exp({mantissa: closeFactorMantissa}), borrowBalance);
        if (repayAmount > maxClose) {
            return uint(Error.TOO_MUCH_REPAY);
        }

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates liquidateBorrow and reverts on rejection. May emit logs.
     * @param nTokenBorrowed Asset which was borrowed by the borrower
     * @param nTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function liquidateBorrowVerify(
        address nTokenBorrowed,
        address nTokenCollateral,
        address liquidator,
        address borrower,
        uint actualRepayAmount,
        uint seizeTokens) external {
        // Shh - currently unused
        nTokenBorrowed;
        nTokenCollateral;
        liquidator;
        borrower;
        actualRepayAmount;
        seizeTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the seizing of assets should be allowed to occur
     * @param nTokenCollateral Asset which was used as collateral and will be seized
     * @param nTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeAllowed(
        address nTokenCollateral,
        address nTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!seizeGuardianPaused, "seize is paused");

        // Shh - currently unused
        seizeTokens;

        // We've added SEBController as a borrowed token list check for seize
        if (!markets[nTokenCollateral].isListed || !(markets[nTokenBorrowed].isListed || address(nTokenBorrowed) == address(sebController))) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        if (NToken(nTokenCollateral).comptroller() != NToken(nTokenBorrowed).comptroller()) {
            return uint(Error.COMPTROLLER_MISMATCH);
        }

        // Keep the flywheel moving
        updateMiaSupplyIndex(nTokenCollateral);
        distributeSupplierMia(nTokenCollateral, borrower);
        distributeSupplierMia(nTokenCollateral, liquidator);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates seize and reverts on rejection. May emit logs.
     * @param nTokenCollateral Asset which was used as collateral and will be seized
     * @param nTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeVerify(
        address nTokenCollateral,
        address nTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) external {
        // Shh - currently unused
        nTokenCollateral;
        nTokenBorrowed;
        liquidator;
        borrower;
        seizeTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param nToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of nTokens to transfer
     * @return 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function transferAllowed(address nToken, address src, address dst, uint transferTokens) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!transferGuardianPaused, "transfer is paused");

        // Currently the only consideration is whether or not
        //  the src is allowed to redeem this many tokens
        uint allowed = redeemAllowedInternal(nToken, src, transferTokens);
        if (allowed != uint(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateMiaSupplyIndex(nToken);
        distributeSupplierMia(nToken, src);
        distributeSupplierMia(nToken, dst);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates transfer and reverts on rejection. May emit logs.
     * @param nToken Asset being transferred
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of nTokens to transfer
     */
    function transferVerify(address nToken, address src, address dst, uint transferTokens) external {
        // Shh - currently unused
        nToken;
        src;
        dst;
        transferTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /*** Liquidity/Liquidation Calculations ***/

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account liquidity.
     *  Note that `nTokenBalance` is the number of nTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountLiquidityLocalVars {
        uint sumCollateral;
        uint sumBorrowPlusEffects;
        uint nTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp collateralFactor;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @return (possible error code (semi-opaque),
                account liquidity in excess of collateral requirements,
     *          account shortfall below collateral requirements)
     */
    function getAccountLiquidity(address account) public view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(account, NToken(0), 0, 0);

        return (uint(err), liquidity, shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param nTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return (possible error code (semi-opaque),
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidity(
        address account,
        address nTokenModify,
        uint redeemTokens,
        uint borrowAmount) public view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(account, NToken(nTokenModify), redeemTokens, borrowAmount);
        return (uint(err), liquidity, shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param nTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @dev Note that we calculate the exchangeRateStored for each collateral nToken using stored data,
     *  without calculating accumulated interest.
     * @return (possible error code,
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidityInternal(
        address account,
        NToken nTokenModify,
        uint redeemTokens,
        uint borrowAmount) internal view returns (Error, uint, uint) {

        AccountLiquidityLocalVars memory vars; // Holds all our calculation results
        uint oErr;

        // For each asset the account is in
        NToken[] memory assets = accountAssets[account];
        for (uint i = 0; i < assets.length; i++) {
            NToken asset = assets[i];

            // Read the balances and exchange rate from the nToken
            (oErr, vars.nTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(account);
            if (oErr != 0) { // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (Error.SNAPSHOT_ERROR, 0, 0);
            }
            vars.collateralFactor = Exp({mantissa: markets[address(asset)].collateralFactorMantissa});
            vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(asset);
            if (vars.oraclePriceMantissa == 0) {
                return (Error.PRICE_ERROR, 0, 0);
            }
            vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

            // Pre-compute a conversion factor from tokens -> bnb (normalized price value)
            vars.tokensToDenom = mul_(mul_(vars.collateralFactor, vars.exchangeRate), vars.oraclePrice);

            // sumCollateral += tokensToDenom * nTokenBalance
            vars.sumCollateral = mul_ScalarTruncateAddUInt(vars.tokensToDenom, vars.nTokenBalance, vars.sumCollateral);

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(vars.oraclePrice, vars.borrowBalance, vars.sumBorrowPlusEffects);

            // Calculate effects of interacting with nTokenModify
            if (asset == nTokenModify) {
                // redeem effect
                // sumBorrowPlusEffects += tokensToDenom * redeemTokens
                vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(vars.tokensToDenom, redeemTokens, vars.sumBorrowPlusEffects);

                // borrow effect
                // sumBorrowPlusEffects += oraclePrice * borrowAmount
                vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(vars.oraclePrice, borrowAmount, vars.sumBorrowPlusEffects);
            }
        }

        vars.sumBorrowPlusEffects = add_(vars.sumBorrowPlusEffects, mintedSEBs[account]);

        // These are safe, as the underflow condition is checked first
        if (vars.sumCollateral > vars.sumBorrowPlusEffects) {
            return (Error.NO_ERROR, vars.sumCollateral - vars.sumBorrowPlusEffects, 0);
        } else {
            return (Error.NO_ERROR, 0, vars.sumBorrowPlusEffects - vars.sumCollateral);
        }
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in nToken.liquidateBorrowFresh)
     * @param nTokenBorrowed The address of the borrowed nToken
     * @param nTokenCollateral The address of the collateral nToken
     * @param actualRepayAmount The amount of nTokenBorrowed underlying to convert into nTokenCollateral tokens
     * @return (errorCode, number of nTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateCalculateSeizeTokens(address nTokenBorrowed, address nTokenCollateral, uint actualRepayAmount) external view returns (uint, uint) {
        /* Read oracle prices for borrowed and collateral markets */
        uint priceBorrowedMantissa = oracle.getUnderlyingPrice(NToken(nTokenBorrowed));
        uint priceCollateralMantissa = oracle.getUnderlyingPrice(NToken(nTokenCollateral));
        if (priceBorrowedMantissa == 0 || priceCollateralMantissa == 0) {
            return (uint(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint exchangeRateMantissa = NToken(nTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;

        numerator = mul_(Exp({mantissa: liquidationIncentiveMantissa}), Exp({mantissa: priceBorrowedMantissa}));
        denominator = mul_(Exp({mantissa: priceCollateralMantissa}), Exp({mantissa: exchangeRateMantissa}));
        ratio = div_(numerator, denominator);

        seizeTokens = mul_ScalarTruncate(ratio, actualRepayAmount);

        return (uint(Error.NO_ERROR), seizeTokens);
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in nToken.liquidateBorrowFresh)
     * @param nTokenCollateral The address of the collateral nToken
     * @param actualRepayAmount The amount of nTokenBorrowed underlying to convert into nTokenCollateral tokens
     * @return (errorCode, number of nTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateSEBCalculateSeizeTokens(address nTokenCollateral, uint actualRepayAmount) external view returns (uint, uint) {
        /* Read oracle prices for borrowed and collateral markets */
        uint priceBorrowedMantissa = 1e18;  // Note: this is SEB
        uint priceCollateralMantissa = oracle.getUnderlyingPrice(NToken(nTokenCollateral));
        if (priceCollateralMantissa == 0) {
            return (uint(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint exchangeRateMantissa = NToken(nTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;

        numerator = mul_(Exp({mantissa: liquidationIncentiveMantissa}), Exp({mantissa: priceBorrowedMantissa}));
        denominator = mul_(Exp({mantissa: priceCollateralMantissa}), Exp({mantissa: exchangeRateMantissa}));
        ratio = div_(numerator, denominator);

        seizeTokens = mul_ScalarTruncate(ratio, actualRepayAmount);

        return (uint(Error.NO_ERROR), seizeTokens);
    }

    /*** Admin Functions ***/

    /**
      * @notice Sets a new price oracle for the comptroller
      * @dev Admin function to set a new price oracle
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setPriceOracle(PriceOracle newOracle) public returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_PRICE_ORACLE_OWNER_CHECK);
        }

        // Track the old oracle for the comptroller
        PriceOracle oldOracle = oracle;

        // Set comptroller's oracle to newOracle
        oracle = newOracle;

        // Emit NewPriceOracle(oldOracle, newOracle)
        emit NewPriceOracle(oldOracle, newOracle);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets the closeFactor used when liquidating borrows
      * @dev Admin function to set closeFactor
      * @param newCloseFactorMantissa New close factor, scaled by 1e18
      * @return uint 0=success, otherwise a failure
      */
    function _setCloseFactor(uint newCloseFactorMantissa) external returns (uint) {
        // Check caller is admin
    	require(msg.sender == admin, "only admin can set close factor");

        uint oldCloseFactorMantissa = closeFactorMantissa;
        closeFactorMantissa = newCloseFactorMantissa;
        emit NewCloseFactor(oldCloseFactorMantissa, newCloseFactorMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets the collateralFactor for a market
      * @dev Admin function to set per-market collateralFactor
      * @param nToken The market to set the factor on
      * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
      * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
      */
    function _setCollateralFactor(NToken nToken, uint newCollateralFactorMantissa) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COLLATERAL_FACTOR_OWNER_CHECK);
        }

        // Verify market is listed
        Market storage market = markets[address(nToken)];
        if (!market.isListed) {
            return fail(Error.MARKET_NOT_LISTED, FailureInfo.SET_COLLATERAL_FACTOR_NO_EXISTS);
        }

        Exp memory newCollateralFactorExp = Exp({mantissa: newCollateralFactorMantissa});

        // Check collateral factor <= 0.9
        Exp memory highLimit = Exp({mantissa: collateralFactorMaxMantissa});
        if (lessThanExp(highLimit, newCollateralFactorExp)) {
            return fail(Error.INVALID_COLLATERAL_FACTOR, FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION);
        }

        // If collateral factor != 0, fail if price == 0
        if (newCollateralFactorMantissa != 0 && oracle.getUnderlyingPrice(nToken) == 0) {
            return fail(Error.PRICE_ERROR, FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE);
        }

        // Set market's collateral factor to new collateral factor, remember old value
        uint oldCollateralFactorMantissa = market.collateralFactorMantissa;
        market.collateralFactorMantissa = newCollateralFactorMantissa;

        // Emit event with asset, old collateral factor, and new collateral factor
        emit NewCollateralFactor(nToken, oldCollateralFactorMantissa, newCollateralFactorMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets liquidationIncentive
      * @dev Admin function to set liquidationIncentive
      * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
      * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
      */
    function _setLiquidationIncentive(uint newLiquidationIncentiveMantissa) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_LIQUIDATION_INCENTIVE_OWNER_CHECK);
        }

        // Save current value for use in log
        uint oldLiquidationIncentiveMantissa = liquidationIncentiveMantissa;

        // Set liquidation incentive to new incentive
        liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Add the market to the markets mapping and set it as listed
      * @dev Admin function to set isListed and add support for the market
      * @param nToken The address of the market (token) to list
      * @return uint 0=success, otherwise a failure. (See enum Error for details)
      */
    function _supportMarket(NToken nToken) external returns (uint) {
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SUPPORT_MARKET_OWNER_CHECK);
        }

        if (markets[address(nToken)].isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }

        nToken.isNToken(); // Sanity check to make sure its really a NToken

        // Note that isMia is not in active use anymore
        markets[address(nToken)] = Market({isListed: true, isMia: false, collateralFactorMantissa: 0});

        _addMarketInternal(nToken);

        emit MarketListed(nToken);

        return uint(Error.NO_ERROR);
    }

    function _addMarketInternal(NToken nToken) internal {
        for (uint i = 0; i < allMarkets.length; i ++) {
            require(allMarkets[i] != nToken, "market already added");
        }
        allMarkets.push(nToken);
    }

    /**
     * @notice Admin function to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(address newPauseGuardian) public returns (uint) {
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_PAUSE_GUARDIAN_OWNER_CHECK);
        }

        // Save current value for inclusion in log
        address oldPauseGuardian = pauseGuardian;

        // Store pauseGuardian with value newPauseGuardian
        pauseGuardian = newPauseGuardian;

        // Emit NewPauseGuardian(OldPauseGuardian, NewPauseGuardian)
        emit NewPauseGuardian(oldPauseGuardian, newPauseGuardian);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Set the given borrow caps for the given nToken markets. Borrowing that brings total borrows to or above borrow cap will revert.
      * @dev Admin or borrowCapGuardian function to set the borrow caps. A borrow cap of 0 corresponds to unlimited borrowing.
      * @param nTokens The addresses of the markets (tokens) to change the borrow caps for
      * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to unlimited borrowing.
      */
    function _setMarketBorrowCaps(NToken[] calldata nTokens, uint[] calldata newBorrowCaps) external {
        require(msg.sender == admin || msg.sender == borrowCapGuardian, "only admin or borrow cap guardian can set borrow caps");

        uint numMarkets = nTokens.length;
        uint numBorrowCaps = newBorrowCaps.length;

        require(numMarkets != 0 && numMarkets == numBorrowCaps, "invalid input");

        for(uint i = 0; i < numMarkets; i++) {
            borrowCaps[address(nTokens[i])] = newBorrowCaps[i];
            emit NewBorrowCap(nTokens[i], newBorrowCaps[i]);
        }
    }

    /**
     * @notice Admin function to change the Borrow Cap Guardian
     * @param newBorrowCapGuardian The address of the new Borrow Cap Guardian
     */
    function _setBorrowCapGuardian(address newBorrowCapGuardian) external onlyAdmin {
        // Save current value for inclusion in log
        address oldBorrowCapGuardian = borrowCapGuardian;

        // Store borrowCapGuardian with value newBorrowCapGuardian
        borrowCapGuardian = newBorrowCapGuardian;

        // Emit NewBorrowCapGuardian(OldBorrowCapGuardian, NewBorrowCapGuardian)
        emit NewBorrowCapGuardian(oldBorrowCapGuardian, newBorrowCapGuardian);
    }

    /**
     * @notice Set whole protocol pause/unpause state
     */
    function _setProtocolPaused(bool state) public validPauseState(state) returns(bool) {
        protocolPaused = state;
        emit ActionProtocolPaused(state);
        return state;
    }

    /**
      * @notice Sets a new SEB controller
      * @dev Admin function to set a new SEB controller
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setSEBController(SEBControllerInterface sebController_) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_SEBCONTROLLER_OWNER_CHECK);
        }

        SEBControllerInterface oldRate = sebController;
        sebController = sebController_;
        emit NewSEBController(oldRate, sebController_);
    }

    function _setSEBMintRate(uint newSEBMintRate) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_SEB_MINT_RATE_CHECK);
        }

        uint oldSEBMintRate = sebMintRate;
        sebMintRate = newSEBMintRate;
        emit NewSEBMintRate(oldSEBMintRate, newSEBMintRate);

        return uint(Error.NO_ERROR);
    }

    function _setTreasuryData(address newTreasuryGuardian, address newTreasuryAddress, uint newTreasuryPercent) external returns (uint) {
        // Check caller is admin
        if (!(msg.sender == admin || msg.sender == treasuryGuardian)) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_TREASURY_OWNER_CHECK);
        }

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");

        address oldTreasuryGuardian = treasuryGuardian;
        address oldTreasuryAddress = treasuryAddress;
        uint oldTreasuryPercent = treasuryPercent;

        treasuryGuardian = newTreasuryGuardian;
        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;

        emit NewTreasuryGuardian(oldTreasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);

        return uint(Error.NO_ERROR);
    }

    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    /**
     * @notice Checks caller is admin, or this contract is becoming the new implementation
     */
    function adminOrInitializing() internal view returns (bool) {
        return msg.sender == admin || msg.sender == comptrollerImplementation;
    }

    /*** Mia Distribution ***/

    function setMiaSpeedInternal(NToken nToken, uint miaSpeed) internal {
        uint currentMiaSpeed = miaSpeeds[address(nToken)];
        if (currentMiaSpeed != 0) {
            // note that MIA speed could be set to 0 to halt liquidity rewards for a market
            Exp memory borrowIndex = Exp({mantissa: nToken.borrowIndex()});
            updateMiaSupplyIndex(address(nToken));
            updateMiaBorrowIndex(address(nToken), borrowIndex);
        } else if (miaSpeed != 0) {
            // Add the MIA market
            Market storage market = markets[address(nToken)];
            require(market.isListed == true, "mia market is not listed");

            if (miaSupplyState[address(nToken)].index == 0 && miaSupplyState[address(nToken)].block == 0) {
                miaSupplyState[address(nToken)] = MiaMarketState({
                    index: miaInitialIndex,
                    block: safe32(getBlockNumber(), "block number exceeds 32 bits")
                });
            }


        if (miaBorrowState[address(nToken)].index == 0 && miaBorrowState[address(nToken)].block == 0) {
                miaBorrowState[address(nToken)] = MiaMarketState({
                    index: miaInitialIndex,
                    block: safe32(getBlockNumber(), "block number exceeds 32 bits")
                });
            }
        }

        if (currentMiaSpeed != miaSpeed) {
            miaSpeeds[address(nToken)] = miaSpeed;
            emit MiaSpeedUpdated(nToken, miaSpeed);
        }
    }

    /**
     * @notice Accrue MIA to the market by updating the supply index
     * @param nToken The market whose supply index to update
     */
    function updateMiaSupplyIndex(address nToken) internal {
        MiaMarketState storage supplyState = miaSupplyState[nToken];
        uint supplySpeed = miaSpeeds[nToken];
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = sub_(blockNumber, uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = NToken(nToken).totalSupply();
            uint miaAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(miaAccrued, supplyTokens) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
            miaSupplyState[nToken] = MiaMarketState({
                index: safe224(index.mantissa, "new index overflows"),
                block: safe32(blockNumber, "block number overflows")
            });
        } else if (deltaBlocks > 0) {
            supplyState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @notice Accrue MIA to the market by updating the borrow index
     * @param nToken The market whose borrow index to update
     */
    function updateMiaBorrowIndex(address nToken, Exp memory marketBorrowIndex) internal {
        MiaMarketState storage borrowState = miaBorrowState[nToken];
        uint borrowSpeed = miaSpeeds[nToken];
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = sub_(blockNumber, uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(NToken(nToken).totalBorrows(), marketBorrowIndex);
            uint miaAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(miaAccrued, borrowAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
            miaBorrowState[nToken] = MiaMarketState({
                index: safe224(index.mantissa, "new index overflows"),
                block: safe32(blockNumber, "block number overflows")
            });
        } else if (deltaBlocks > 0) {
            borrowState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @notice Calculate MIA accrued by a supplier and possibly transfer it to them
     * @param nToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MIA to
     */
    function distributeSupplierMia(address nToken, address supplier) internal {
        if (address(sebVaultAddress) != address(0)) {
            releaseToVault();
        }

        MiaMarketState storage supplyState = miaSupplyState[nToken];
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: miaSupplierIndex[nToken][supplier]});
        miaSupplierIndex[nToken][supplier] = supplyIndex.mantissa;

        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = miaInitialIndex;
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint supplierTokens = NToken(nToken).balanceOf(supplier);
        uint supplierDelta = mul_(supplierTokens, deltaIndex);
        uint supplierAccrued = add_(miaAccrued[supplier], supplierDelta);
        miaAccrued[supplier] = supplierAccrued;
        emit DistributedSupplierMia(NToken(nToken), supplier, supplierDelta, supplyIndex.mantissa);
    }

    /**
     * @notice Calculate MIA accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param nToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MIA to
     */
    function distributeBorrowerMia(address nToken, address borrower, Exp memory marketBorrowIndex) internal {
        if (address(sebVaultAddress) != address(0)) {
            releaseToVault();
        }

        MiaMarketState storage borrowState = miaBorrowState[nToken];
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: miaBorrowerIndex[nToken][borrower]});
        miaBorrowerIndex[nToken][borrower] = borrowIndex.mantissa;

        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(NToken(nToken).borrowBalanceStored(borrower), marketBorrowIndex);
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint borrowerAccrued = add_(miaAccrued[borrower], borrowerDelta);
            miaAccrued[borrower] = borrowerAccrued;
            emit DistributedBorrowerMia(NToken(nToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Calculate MIA accrued by a SEB minter and possibly transfer it to them
     * @dev SEB minters will not begin to accrue until after the first interaction with the protocol.
     * @param sebMinter The address of the SEB minter to distribute MIA to
     */
    function distributeSEBMinterMia(address sebMinter) public {
        if (address(sebVaultAddress) != address(0)) {
            releaseToVault();
        }

        if (address(sebController) != address(0)) {
            uint sebMinterAccrued;
            uint sebMinterDelta;
            uint sebMintIndexMantissa;
            uint err;
            (err, sebMinterAccrued, sebMinterDelta, sebMintIndexMantissa) = sebController.calcDistributeSEBMinterMia(sebMinter);
            if (err == uint(Error.NO_ERROR)) {
                miaAccrued[sebMinter] = sebMinterAccrued;
                emit DistributedSEBMinterMia(sebMinter, sebMinterDelta, sebMintIndexMantissa);
            }
        }
    }

    /**
     * @notice Claim all the mia accrued by holder in all markets and SEB
     * @param holder The address to claim MIA for
     */
    function claimMia(address holder) public {
        return claimMia(holder, allMarkets);
    }

    /**
     * @notice Claim all the mia accrued by holder in the specified markets
     * @param holder The address to claim MIA for
     * @param nTokens The list of markets to claim MIA in
     */
    function claimMia(address holder, NToken[] memory nTokens) public {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimMia(holders, nTokens, true, true);
    }

    /**
     * @notice Claim all mia accrued by the holders
     * @param holders The addresses to claim MIA for
     * @param nTokens The list of markets to claim MIA in
     * @param borrowers Whether or not to claim MIA earned by borrowing
     * @param suppliers Whether or not to claim MIA earned by supplying
     */
    function claimMia(address[] memory holders, NToken[] memory nTokens, bool borrowers, bool suppliers) public {
        uint j;
        if(address(sebController) != address(0)) {
            sebController.updateMiaSEBMintIndex();
        }
        for (j = 0; j < holders.length; j++) {
            distributeSEBMinterMia(holders[j]);
            miaAccrued[holders[j]] = grantMIAInternal(holders[j], miaAccrued[holders[j]]);
        }
        for (uint i = 0; i < nTokens.length; i++) {
            NToken nToken = nTokens[i];
            require(markets[address(nToken)].isListed, "not listed market");
            if (borrowers) {
                Exp memory borrowIndex = Exp({mantissa: nToken.borrowIndex()});
                updateMiaBorrowIndex(address(nToken), borrowIndex);
                for (j = 0; j < holders.length; j++) {
                    distributeBorrowerMia(address(nToken), holders[j], borrowIndex);
                    miaAccrued[holders[j]] = grantMIAInternal(holders[j], miaAccrued[holders[j]]);
                }
            }
            if (suppliers) {
                updateMiaSupplyIndex(address(nToken));
                for (j = 0; j < holders.length; j++) {
                    distributeSupplierMia(address(nToken), holders[j]);
                    miaAccrued[holders[j]] = grantMIAInternal(holders[j], miaAccrued[holders[j]]);
                }
            }
        }
    }

    /**
     * @notice Transfer MIA to the user
     * @dev Note: If there is not enough MIA, we do not perform the transfer all.
     * @param user The address of the user to transfer MIA to
     * @param amount The amount of MIA to (possibly) transfer
     * @return The amount of MIA which was NOT transferred to the user
     */
    function grantMIAInternal(address user, uint amount) internal returns (uint) {
        MIA mia = MIA(getMIAAddress());
        uint miaRemaining = mia.balanceOf(address(this));
        if (amount > 0 && amount <= miaRemaining) {
            mia.transfer(user, amount);
            return 0;
        }
        return amount;
    }

    /*** Mia Distribution Admin ***/

    /**
     * @notice Transfer MIA to the recipient
     * @dev Note: If there is not enough MIA, we do not perform the transfer all.
     * @param recipient The address of the recipient to transfer MIA to
     * @param amount The amount of MIA to (possibly) transfer
     */
    function _grantMIA(address recipient, uint amount) public {
        require(adminOrInitializing(), "only admin can grant mia");
        uint amountLeft = grantMIAInternal(recipient, amount);
        require(amountLeft == 0, "insufficient mia for grant");
        emit MiaGranted(recipient, amount);
    }

    /**
     * @notice Set the amount of MIA distributed per block to SEB Vault
     * @param miaSEBVaultRate_ The amount of MIA wei per block to distribute to SEB Vault
     */
    function _setMiaSEBVaultRate(uint miaSEBVaultRate_) public onlyAdmin {
        uint oldMiaSEBVaultRate = miaSEBVaultRate;
        miaSEBVaultRate = miaSEBVaultRate_;
        emit NewMiaSEBVaultRate(oldMiaSEBVaultRate, miaSEBVaultRate_);
    }

    /**
     * @notice Set the SEB Vault infos
     * @param vault_ The address of the SEB Vault
     * @param releaseStartBlock_ The start block of release to SEB Vault
     * @param minReleaseAmount_ The minimum release amount to SEB Vault
     */
    function _setSEBVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) public onlyAdmin {
        sebVaultAddress = vault_;
        releaseStartBlock = releaseStartBlock_;
        minReleaseAmount = minReleaseAmount_;
        emit NewSEBVaultInfo(vault_, releaseStartBlock_, minReleaseAmount_);
    }

    /**
     * @notice Set MIA speed for a single market
     * @param nToken The market whose MIA speed to update
     * @param miaSpeed New MIA speed for market
     */
    function _setMiaSpeed(NToken nToken, uint miaSpeed) public {
        require(adminOrInitializing(), "only admin can set mia speed");
        setMiaSpeedInternal(nToken, miaSpeed);
    }

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market.
     * @return The list of market addresses
     */
    function getAllMarkets() public view returns (NToken[] memory) {
        return allMarkets;
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }

    /**
     * @notice Return the address of the MIA token
     * @return The address of MIA
     */
    function getMIAAddress() public view returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }

    /*** SEB functions ***/

    /**
     * @notice Set the minted SEB amount of the `owner`
     * @param owner The address of the account to set
     * @param amount The amount of SEB to set to the account
     * @return The number of minted SEB by `owner`
     */
    function setMintedSEBOf(address owner, uint amount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintSEBGuardianPaused && !repaySEBGuardianPaused, "SEB is paused");
        // Check caller is sebController
        if (msg.sender != address(sebController)) {
            return fail(Error.REJECTION, FailureInfo.SET_MINTED_SEB_REJECTION);
        }
        mintedSEBs[owner] = amount;

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Transfer MIA to SEB Vault
     */
    function releaseToVault() public {
        if(releaseStartBlock == 0 || getBlockNumber() < releaseStartBlock) {
            return;
        }

        MIA mia = MIA(getMIAAddress());

        uint256 miaBalance = mia.balanceOf(address(this));
        if(miaBalance == 0) {
            return;
        }


        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), releaseStartBlock);
        // releaseAmount = miaSEBVaultRate * deltaBlocks
        uint256 _releaseAmount = mul_(miaSEBVaultRate, deltaBlocks);

        if (_releaseAmount < minReleaseAmount) {
            return;
        }

        if (miaBalance >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = miaBalance;
        }

        releaseStartBlock = getBlockNumber();

        mia.transfer(sebVaultAddress, actualAmount);
        emit DistributedSEBVaultMia(actualAmount);

        ISEBVault(sebVaultAddress).updatePendingRewards();
    }
}
