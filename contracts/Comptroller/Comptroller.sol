pragma solidity ^0.5.16;

import "./../NTokens/NToken.sol";
import "./../ErrorReporter.sol";
import "./../Oracle/PriceOracle.sol";
import "./ComptrollerStorage.sol";
import "./Unitroller.sol";
import "./../Governance/MIA.sol";
import "./../SEB/SEB.sol";
import "./../Lens/ComptrollerLensInterface.sol";
import "./ComptrollerInterface.sol";

/**
 * @title Lalalend's Comptroller Contract
 * @author Lalalend
 */
contract Comptroller is ComptrollerV8Storage, ComptrollerInterfaceG2, ComptrollerErrorReporter, ExponentialNoError {
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
    event ActionPausedMarket(NToken nToken, string action, bool pauseState);

    /// @notice Emitted when MIA SEB Vault rate is changed
    event NewMiaSEBVaultRate(uint oldMiaSEBVaultRate, uint newMiaSEBVaultRate);

    /// @notice Emitted when a new MIA speed is calculated for a market
    event MiaSpeedUpdated(NToken indexed nToken, uint newSpeed);

    /// @notice Emitted when MIA is distributed to a supplier
    event DistributedSupplierMia(NToken indexed nToken, address indexed supplier, uint miaDelta, uint miaSupplyIndex);

    /// @notice Emitted when MIA is distributed to a borrower
    event DistributedBorrowerMia(NToken indexed nToken, address indexed borrower, uint miaDelta, uint miaBorrowIndex);

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

    // @notice Emitted when liquidator adress is changed
    event NewLiquidatorContract(address oldLiquidatorContract, address newLiquidatorContract);

    /// @notice Emitted when MIA is granted by admin
    event MiaGranted(address recipient, uint amount);

    /// @notice Emitted whe ComptrollerLens address is changed
    event NewComptrollerLens(address oldComptrollerLens, address newComptrollerLens);

    /// @notice Emitted when supply cap for a nToken is changed
    event NewSupplyCap(NToken indexed nToken, uint newSupplyCap);

    /// @notice The initial MIA index for a market
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

    /// @notice Reverts if the caller is not admin
    function ensureAdmin() private view {
        require(msg.sender == admin, "only admin can");
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "can't be zero address");
    }

    /// @notice Reverts if the market is not listed
    function ensureListed(Market storage market) private view {
        require(market.isListed, "market not listed");
    }

    /// @notice Reverts if the caller is neither admin nor the passed address
    function ensureAdminOr(address privilegedAddress) private view {
        require(
            msg.sender == admin || msg.sender == privilegedAddress,
            "access denied"
        );
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
        ensureListed(marketToJoin);

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

        ensureListed(markets[nToken]);

        uint256 supplyCap = supplyCaps[nToken];

        // Supply cap of 0 corresponds to Minting notAllowed 
        require(supplyCap > 0, "market supply cap is 0");

        uint totalSupply = NToken(nToken).totalSupply();
        uint256 nextTotalSupply = add_(totalSupply, mintAmount);
        require(nextTotalSupply <= supplyCap, "market supply cap reached");

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
        ensureListed(markets[nToken]);

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

        // Pausing is a very serious situation - we revert to sound the alarms
        ensureListed(markets[nToken]);
 
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
     * @param borrower The account which borrowed the asset
     * @param repayAmount The amount of the underlying asset the account would repay
     * @return 0 if the repay is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function repayBorrowAllowed(
        address nToken,
        address payer,
        address borrower,
        uint repayAmount
    )
        external
        onlyProtocolAllowed
        returns (uint)
    {
        // Shh - currently unused
        payer;
        borrower;
        repayAmount;

        ensureListed(markets[nToken]);

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
        uint borrowerIndex
    )
        external
    {
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
        uint repayAmount
    )
        external
        onlyProtocolAllowed
        returns (uint)
    {
        if (liquidatorContract != address(0) && liquidator != liquidatorContract) {
            return uint(Error.UNAUTHORIZED);
        }

        ensureListed(markets[nTokenCollateral]);
        if (address(nTokenBorrowed) != address(sebController)) {
            ensureListed(markets[nTokenBorrowed]);
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
     * @param seizeTokens The amount of collateral token that will be seized
     */
    function liquidateBorrowVerify(
        address nTokenBorrowed,
        address nTokenCollateral,
        address liquidator,
        address borrower,
        uint actualRepayAmount,
        uint seizeTokens
    )
        external
    {
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
        uint seizeTokens
    )
        external
        onlyProtocolAllowed
        returns (uint)
    {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!seizeGuardianPaused, "seize is paused");

        // Shh - currently unused
        seizeTokens;

        // We've added SEBController as a borrowed token list check for seize
        ensureListed(markets[nTokenCollateral]);
        if (address(nTokenBorrowed) != address(sebController)) {
            ensureListed(markets[nTokenBorrowed]);
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
        uint seizeTokens
    )
        external
    {
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
        uint borrowAmount
    )
        public
        view
        returns (uint, uint, uint)
    {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(
            account,
            NToken(nTokenModify),
            redeemTokens,
            borrowAmount
        );
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
        uint borrowAmount
    )
        internal
        view
        returns (Error, uint, uint)
    {
        (uint err, uint liquidity, uint shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            nTokenModify,
            redeemTokens,
            borrowAmount
        );
        return (Error(err), liquidity, shortfall);
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in nToken.liquidateBorrowFresh)
     * @param nTokenBorrowed The address of the borrowed nToken
     * @param nTokenCollateral The address of the collateral nToken
     * @param actualRepayAmount The amount of nTokenBorrowed underlying to convert into nTokenCollateral tokens
     * @return (errorCode, number of nTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateCalculateSeizeTokens(
        address nTokenBorrowed,
        address nTokenCollateral,
        uint actualRepayAmount
    )
        external
        view
        returns (uint, uint)
    {
        (uint err, uint seizeTokens) = comptrollerLens.liquidateCalculateSeizeTokens(
            address(this), 
            nTokenBorrowed, 
            nTokenCollateral, 
            actualRepayAmount
        );
        return (err, seizeTokens);
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in nToken.liquidateBorrowFresh)
     * @param nTokenCollateral The address of the collateral nToken
     * @param actualRepayAmount The amount of nTokenBorrowed underlying to convert into nTokenCollateral tokens
     * @return (errorCode, number of nTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateSEBCalculateSeizeTokens(
        address nTokenCollateral,
        uint actualRepayAmount
    )
        external
        view
        returns (uint, uint)
    {
        (uint err, uint seizeTokens) = comptrollerLens.liquidateSEBCalculateSeizeTokens(
            address(this), 
            nTokenCollateral, 
            actualRepayAmount
        );
        return (err, seizeTokens);
    }


    /*** Admin Functions ***/

    /**
      * @notice Sets a new price oracle for the comptroller
      * @dev Admin function to set a new price oracle
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setPriceOracle(PriceOracle newOracle) external returns (uint) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(address(newOracle));

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
      * @return uint 0=success, otherwise will revert
      */
    function _setCloseFactor(uint newCloseFactorMantissa) external returns (uint) {
        // Check caller is admin
        ensureAdmin();

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
        ensureAdmin();
        ensureNonzeroAddress(address(nToken));

        // Verify market is listed
        Market storage market = markets[address(nToken)];
        ensureListed(market);

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
        ensureAdmin();

        require(newLiquidationIncentiveMantissa >= 1e18, "incentive must be over 1e18");

        // Save current value for use in log
        uint oldLiquidationIncentiveMantissa = liquidationIncentiveMantissa;

        // Set liquidation incentive to new incentive
        liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);

        return uint(Error.NO_ERROR);
    }

    function _setLiquidatorContract(address newLiquidatorContract_) external {
        // Check caller is admin
        ensureAdmin();
        address oldLiquidatorContract = liquidatorContract;
        liquidatorContract = newLiquidatorContract_;
        emit NewLiquidatorContract(oldLiquidatorContract, newLiquidatorContract_);
    }

    /**
      * @notice Add the market to the markets mapping and set it as listed
      * @dev Admin function to set isListed and add support for the market
      * @param nToken The address of the market (token) to list
      * @return uint 0=success, otherwise a failure. (See enum Error for details)
      */
    function _supportMarket(NToken nToken) external returns (uint) {
        // Check caller is admin
        ensureAdmin();

        if (markets[address(nToken)].isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }
 
        nToken.isNToken(); // Sanity check to make sure its really a nToken

        // Note that isMia is not in active use anymore
        markets[address(nToken)] = Market({isListed: true, isMia: false, collateralFactorMantissa: 0});

        _addMarketInternal(nToken);

        emit MarketListed(nToken);

        return uint(Error.NO_ERROR);
    }

    function _addMarketInternal(NToken nToken) internal {
        for (uint i = 0; i < allMarkets.length; i++) {
            require(allMarkets[i] != nToken, "market already added");
        }
        allMarkets.push(nToken);
    }

    /**
     * @notice Admin function to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(address newPauseGuardian) external returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(newPauseGuardian);

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
        ensureAdminOr(borrowCapGuardian);

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
    function _setBorrowCapGuardian(address newBorrowCapGuardian) external {
        ensureAdmin();
        ensureNonzeroAddress(newBorrowCapGuardian);

        // Save current value for inclusion in log
        address oldBorrowCapGuardian = borrowCapGuardian;

        // Store borrowCapGuardian with value newBorrowCapGuardian
        borrowCapGuardian = newBorrowCapGuardian;

        // Emit NewBorrowCapGuardian(OldBorrowCapGuardian, NewBorrowCapGuardian)
        emit NewBorrowCapGuardian(oldBorrowCapGuardian, newBorrowCapGuardian);
    }

    /**
      * @notice Set the given supply caps for the given nToken markets. Supply that brings total Supply to or above supply cap will revert.
      * @dev Admin function to set the supply caps. A supply cap of 0 corresponds to Minting NotAllowed.
      * @param nTokens The addresses of the markets (tokens) to change the supply caps for
      * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed.
      */
    function _setMarketSupplyCaps(NToken[] calldata nTokens, uint256[] calldata newSupplyCaps) external {
        require(msg.sender == admin , "only admin can set supply caps");

        uint numMarkets = nTokens.length;
        uint numSupplyCaps = newSupplyCaps.length;

        require(numMarkets != 0 && numMarkets == numSupplyCaps, "invalid input");

        for(uint i = 0; i < numMarkets; i++) {
            supplyCaps[address(nTokens[i])] = newSupplyCaps[i];
            emit NewSupplyCap(nTokens[i], newSupplyCaps[i]);
        }
    }

    /**
     * @notice Set whole protocol pause/unpause state
     */
    function _setProtocolPaused(bool state) external returns(bool) {
        ensureAdminOr(pauseGuardian);
        require(msg.sender == admin || state, "only admin can unpause");
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
        ensureAdmin();
        ensureNonzeroAddress(address(sebController_));

        SEBControllerInterface oldSebController = sebController;
        sebController = sebController_;
        emit NewSEBController(oldSebController, sebController_);

        return uint(Error.NO_ERROR);
    }

    function _setSEBMintRate(uint newSEBMintRate) external returns (uint) {
        // Check caller is admin
        ensureAdmin();
        uint oldSEBMintRate = sebMintRate;
        sebMintRate = newSEBMintRate;
        emit NewSEBMintRate(oldSEBMintRate, newSEBMintRate);

        return uint(Error.NO_ERROR);
    }

    function _setTreasuryData(address newTreasuryGuardian, address newTreasuryAddress, uint newTreasuryPercent) external returns (uint) {
        // Check caller is admin
        ensureAdminOr(treasuryGuardian);

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");
        ensureNonzeroAddress(newTreasuryGuardian);
        ensureNonzeroAddress(newTreasuryAddress);

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

    function _become(Unitroller unitroller) external {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    /*** MIA Distribution ***/

    function setMiaSpeedInternal(NToken nToken, uint miaSpeed) internal {
        uint currentMiaSpeed = miaSpeeds[address(nToken)];
        if (currentMiaSpeed != 0) {
            // note that MIA speed could be set to 0 to halt liquidity rewards for a market
            Exp memory borrowIndex = Exp({mantissa: nToken.borrowIndex()});
            updateMiaSupplyIndex(address(nToken));
            updateMiaBorrowIndex(address(nToken), borrowIndex);
        } else if (miaSpeed != 0) {
            // Add the MIA market
            ensureListed(markets[address(nToken)]);

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
     * @dev Set ComptrollerLens contract address
     */
    function _setComptrollerLens(ComptrollerLensInterface comptrollerLens_) external returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(address(comptrollerLens_));
        address oldComptrollerLens = address(comptrollerLens);
        comptrollerLens = comptrollerLens_;
        emit NewComptrollerLens(oldComptrollerLens, address(comptrollerLens));

        return uint(Error.NO_ERROR);
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

        MiaMarketState memory supplyState = miaSupplyState[nToken];
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

        MiaMarketState memory borrowState = miaBorrowState[nToken];
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
     * @notice Claim all the MIA accrued by holder in all markets and SEB
     * @param holder The address to claim MIA for
     */
    function claimMia(address holder) public {
        return claimMia(holder, allMarkets);
    }

    /**
     * @notice Claim all the MIA accrued by holder in the specified markets
     * @param holder The address to claim MIA for
     * @param nTokens The list of markets to claim MIA in
     */
    function claimMia(address holder, NToken[] memory nTokens) public {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimMia(holders, nTokens, true, true);
    }

    /**
     * @notice Claim all MIA accrued by the holders
     * @param holders The addresses to claim MIA for
     * @param nTokens The list of markets to claim MIA in
     * @param borrowers Whether or not to claim MIA earned by borrowing
     * @param suppliers Whether or not to claim MIA earned by supplying
     */
     function claimMia(address[] memory holders, NToken[] memory nTokens, bool borrowers, bool suppliers) public {
        claimMia(holders, nTokens, borrowers, suppliers, false);
    }


    /**
     * @notice Claim all MIA accrued by the holders
     * @param holders The addresses to claim MIA for
     * @param nTokens The list of markets to claim MIA in
     * @param borrowers Whether or not to claim MIA earned by borrowing
     * @param suppliers Whether or not to claim MIA earned by supplying
     * @param collateral Whether or not to use MIA earned as collateral, only takes effect when the holder has a shortfall
     */
    function claimMia(address[] memory holders, NToken[] memory nTokens, bool borrowers, bool suppliers, bool collateral) public {
        uint j;
        // Save shortfalls of all holders
        // if there is a positive shortfall, the MIA reward is accrued,
        // but won't be granted to this holder
        uint[] memory shortfalls = new uint[](holders.length);
        for (j = 0; j < holders.length; j++) {
            (, , uint shortfall) = getHypotheticalAccountLiquidityInternal(holders[j], NToken(0), 0, 0);
            shortfalls[j] = shortfall;
        }
        for (uint i = 0; i < nTokens.length; i++) {
            NToken nToken = nTokens[i];
            ensureListed(markets[address(nToken)]);
            if (borrowers) {
                Exp memory borrowIndex = Exp({mantissa: nToken.borrowIndex()});
                updateMiaBorrowIndex(address(nToken), borrowIndex);
                for (j = 0; j < holders.length; j++) {
                    distributeBorrowerMia(address(nToken), holders[j], borrowIndex);
                    miaAccrued[holders[j]] = grantMiaInternal(holders[j], miaAccrued[holders[j]], shortfalls[j], collateral);
                }
            }
            if (suppliers) {
                updateMiaSupplyIndex(address(nToken));
                for (j = 0; j < holders.length; j++) {
                    distributeSupplierMia(address(nToken), holders[j]);
                    miaAccrued[holders[j]] = grantMiaInternal(holders[j], miaAccrued[holders[j]], shortfalls[j], collateral);
                }
            }
        }
    }

    /**
     * @notice Claim all the MIA accrued by holder in all markets, a shorthand for `claimMia` with collateral set to `true`
     * @param holder The address to claim MIA for
     */
    function claimMiaAsCollateral(address holder) external {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimMia(holders, allMarkets, true, true, true);
    }

    /**
     * @notice Transfer MIA to the user with user's shortfall considered
     * @dev Note: If there is not enough MIA, we do not perform the transfer all.
     * @param user The address of the user to transfer MIA to
     * @param amount The amount of MIA to (possibly) transfer
     * @param shortfall The shortfall of the user
     * @param collateral Whether or not we will use user's MIA reward as collateral to pay off the debt
     * @return The amount of MIA which was NOT transferred to the user
     */
    function grantMiaInternal(address user, uint amount, uint shortfall, bool collateral) internal returns (uint) {
        MIA mia = MIA(getMiaAddress());
        uint miaRemaining = mia.balanceOf(address(this));
        bool bankrupt = shortfall > 0;

        if (amount == 0 || amount > miaRemaining) {
            return amount;
        }

        // If user's not bankrupt, user can get the reward,
        // so the liquidators will have chances to liquidate bankrupt accounts
        if (!bankrupt) {
            mia.transfer(user, amount);
            return 0;
        }
        // If user's bankrupt and doesn't use pending MIA as collateral, don't grant
        // anything, otherwise, we will transfer the pending MIA as collateral to 
        // nMIA token and mint nMIA for the user.
        // 
        // If mintBehalf failed, don't grant any MIA
        require(collateral, "bankrupt accounts can only collateralize their pending MIA rewards");

        mia.approve(getMiaOnTokenAddress(), amount);
        require(
            NErc20Interface(getMiaOnTokenAddress()).mintBehalf(user, amount) == uint(Error.NO_ERROR),
            "mint behalf error during collateralize MIA"
        );

        // set miaAccrue[user] to 0
        return 0;
    }

    /*** MIA Distribution Admin ***/

    /**
     * @notice Transfer MIA to the recipient
     * @dev Note: If there is not enough MIA, we do not perform the transfer all.
     * @param recipient The address of the recipient to transfer MIA to
     * @param amount The amount of MIA to (possibly) transfer
     */
    function _grantMIA(address recipient, uint amount) external {
        ensureAdminOr(comptrollerImplementation);
        uint amountLeft = grantMiaInternal(recipient, amount, 0, false);
        require(amountLeft == 0, "insufficient MIA for grant");
        emit MiaGranted(recipient, amount);
    }

    /**
     * @notice Set the amount of MIA distributed per block to SEB Vault
     * @param miaSEBVaultRate_ The amount of MIA wei per block to distribute to SEB Vault
     */
    function _setMiaSEBVaultRate(uint miaSEBVaultRate_) external {
        ensureAdmin();

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
    function _setSEBVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) external {
        ensureAdmin();
        ensureNonzeroAddress(vault_);

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
    function _setMiaSpeed(NToken nToken, uint miaSpeed) external {
        ensureAdminOr(comptrollerImplementation);
        ensureNonzeroAddress(address(nToken));
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
    // TODO 
    function getMiaAddress() public pure returns (address) {
        return 0x8333AfA22De158606E74E9904f281D73e0023ED9;
    }

    /**
     * @notice Return the address of the MIA nToken
     * @return The address of MIA nToken
     */
    
    // TODO 

    function getMiaOnTokenAddress() public pure returns (address) {
        return 0xd9edE9aDe6090987fB3eBE4750877C66b32c002E;
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
        // Check caller is SEBController
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

        MIA mia = MIA(getMiaAddress());

        uint256 miaBalance = mia.balanceOf(address(this));
        if(miaBalance == 0) {
            return;
        }

        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), releaseStartBlock);
        // releaseAmount = miaSEBVaultRate * deltaBlocks
        uint256 _releaseAmount = mul_(miaSEBVaultRate, deltaBlocks);

        if (miaBalance >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = miaBalance;
        }

        if (actualAmount < minReleaseAmount) {
            return;
        }

        releaseStartBlock = getBlockNumber();

        mia.transfer(sebVaultAddress, actualAmount);
        emit DistributedSEBVaultMia(actualAmount);

        ISEBVault(sebVaultAddress).updatePendingRewards();
    }
}