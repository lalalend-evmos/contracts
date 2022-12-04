pragma solidity ^0.5.16;

import "./NTokens/NToken.sol";
import "./Oracle/PriceOracle.sol";
import "./ErrorReporter.sol";
import "./Exponential.sol";
import "./SEBControllerStorage.sol";
import "./SEBUnitroller.sol";
import "./SEB/SEB.sol";

interface ComptrollerImplInterface {
    function protocolPaused() external view returns (bool);
    function mintedSEBs(address account) external view returns (uint);
    function sebMintRate() external view returns (uint);
    function miaAccrued(address account) external view returns(uint);
    function getAssetsIn(address account) external view returns (NToken[] memory);
    function oracle() external view returns (PriceOracle);
}

/**
 * @title Lalalend's SEB Comptroller Contract
 * @author Lalalend
 */
contract SEBController is SEBControllerStorageG2, SEBControllerErrorReporter, Exponential {

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    /**
     * @notice Event emitted when SEB is minted
     */
    event MintSEB(address minter, uint mintSEBAmount);

    /**
     * @notice Event emitted when SEB is repaid
     */
    event RepaySEB(address payer, address borrower, uint repaySEBAmount);

    /// @notice The initial Mia index for a market
    uint224 public constant miaInitialIndex = 1e36;

    /**
     * @notice Event emitted when a borrow is liquidated
     */
    event LiquidateSEB(address liquidator, address borrower, uint repayAmount, address nTokenCollateral, uint seizeTokens);

    /**
     * @notice Emitted when treasury guardian is changed
     */
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /**
     * @notice Emitted when treasury address is changed
     */
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /**
     * @notice Emitted when treasury percent is changed
     */
    event NewTreasuryPercent(uint oldTreasuryPercent, uint newTreasuryPercent);

    /**
     * @notice Event emitted when SEBs are minted and fee are transferred
     */
    event MintFee(address minter, uint feeAmount);

    /*** Main Actions ***/
    struct MintLocalVars {
        uint oErr;
        MathError mathErr;
        uint mintAmount;
        uint accountMintSEBNew;
        uint accountMintableSEB;
    }

    function mintSEB(uint mintSEBAmount) external nonReentrant returns (uint) {
        if(address(comptroller) != address(0)) {
            require(mintSEBAmount > 0, "mintSEBAmount cannt be zero");

            require(!ComptrollerImplInterface(address(comptroller)).protocolPaused(), "protocol is paused");

            MintLocalVars memory vars;

            address minter = msg.sender;

            (vars.oErr, vars.accountMintableSEB) = getMintableSEB(minter);
            if (vars.oErr != uint(Error.NO_ERROR)) {
                return uint(Error.REJECTION);
            }

            // check that user have sufficient mintableSEB balance
            if (mintSEBAmount > vars.accountMintableSEB) {
                return fail(Error.REJECTION, FailureInfo.SEB_MINT_REJECTION);
            }

            (vars.mathErr, vars.accountMintSEBNew) = addUInt(ComptrollerImplInterface(address(comptroller)).mintedSEBs(minter), mintSEBAmount);
            require(vars.mathErr == MathError.NO_ERROR, "SEB_MINT_AMOUNT_CALCULATION_FAILED");
            uint error = comptroller.setMintedSEBOf(minter, vars.accountMintSEBNew);
            if (error != 0 ) {
                return error;
            }

            uint feeAmount;
            uint remainedAmount;
            vars.mintAmount = mintSEBAmount;
            if (treasuryPercent != 0) {
                (vars.mathErr, feeAmount) = mulUInt(vars.mintAmount, treasuryPercent);
                if (vars.mathErr != MathError.NO_ERROR) {
                    return failOpaque(Error.MATH_ERROR, FailureInfo.MINT_FEE_CALCULATION_FAILED, uint(vars.mathErr));
                }

                (vars.mathErr, feeAmount) = divUInt(feeAmount, 1e18);
                if (vars.mathErr != MathError.NO_ERROR) {
                    return failOpaque(Error.MATH_ERROR, FailureInfo.MINT_FEE_CALCULATION_FAILED, uint(vars.mathErr));
                }

                (vars.mathErr, remainedAmount) = subUInt(vars.mintAmount, feeAmount);
                if (vars.mathErr != MathError.NO_ERROR) {
                    return failOpaque(Error.MATH_ERROR, FailureInfo.MINT_FEE_CALCULATION_FAILED, uint(vars.mathErr));
                }

                SEB(getSEBAddress()).mint(treasuryAddress, feeAmount);

                emit MintFee(minter, feeAmount);
            } else {
                remainedAmount = vars.mintAmount;
            }

            SEB(getSEBAddress()).mint(minter, remainedAmount);

            emit MintSEB(minter, remainedAmount);

            return uint(Error.NO_ERROR);
        }
    }

    /**
     * @notice Repay SEB
     */
    function repaySEB(uint repaySEBAmount) external nonReentrant returns (uint, uint) {
        if(address(comptroller) != address(0)) {
            require(repaySEBAmount > 0, "repaySEBAmount cannt be zero");

            require(!ComptrollerImplInterface(address(comptroller)).protocolPaused(), "protocol is paused");

            address payer = msg.sender;

            return repaySEBFresh(msg.sender, msg.sender, repaySEBAmount);
        }
    }

    /**
     * @notice Repay SEB Internal
     * @notice Borrowed SEBs are repaid by another user (possibly the borrower).
     * @param payer the account paying off the SEB
     * @param borrower the account with the debt being payed off
     * @param repayAmount the amount of SEB being returned
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment amount.
     */
    function repaySEBFresh(address payer, address borrower, uint repayAmount) internal returns (uint, uint) {
        uint actualBurnAmount;

        uint sebBalanceBorrower = ComptrollerImplInterface(address(comptroller)).mintedSEBs(borrower);

        if(sebBalanceBorrower > repayAmount) {
            actualBurnAmount = repayAmount;
        } else {
            actualBurnAmount = sebBalanceBorrower;
        }

        MathError mErr;
        uint accountSEBNew;

        SEB(getSEBAddress()).burn(payer, actualBurnAmount);

        (mErr, accountSEBNew) = subUInt(sebBalanceBorrower, actualBurnAmount);
        require(mErr == MathError.NO_ERROR, "SEB_BURN_AMOUNT_CALCULATION_FAILED");

        uint error = comptroller.setMintedSEBOf(borrower, accountSEBNew);
        if (error != 0) {
            return (error, 0);
        }
        emit RepaySEB(payer, borrower, actualBurnAmount);

        return (uint(Error.NO_ERROR), actualBurnAmount);
    }

    /**
     * @notice The sender liquidates the seb minters collateral.
     *  The collateral seized is transferred to the liquidator.
     * @param borrower The borrower of seb to be liquidated
     * @param nTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment amount.
     */
    function liquidateSEB(address borrower, uint repayAmount, NTokenInterface nTokenCollateral) external nonReentrant returns (uint, uint) {
        require(!ComptrollerImplInterface(address(comptroller)).protocolPaused(), "protocol is paused");

        uint error = nTokenCollateral.accrueInterest();
        if (error != uint(Error.NO_ERROR)) {
            // accrueInterest emits logs on errors, but we still want to log the fact that an attempted liquidation failed
            return (fail(Error(error), FailureInfo.SEB_LIQUIDATE_ACCRUE_COLLATERAL_INTEREST_FAILED), 0);
        }

        // liquidateSEBFresh emits borrow-specific logs on errors, so we don't need to
        return liquidateSEBFresh(msg.sender, borrower, repayAmount, nTokenCollateral);
    }

    /**
     * @notice The liquidator liquidates the borrowers collateral by repay borrowers SEB.
     *  The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the SEB and seizing collateral
     * @param borrower The borrower of this SEB to be liquidated
     * @param nTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the SEB to repay
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment SEB.
     */
    function liquidateSEBFresh(address liquidator, address borrower, uint repayAmount, NTokenInterface nTokenCollateral) internal returns (uint, uint) {
        if(address(comptroller) != address(0)) {
            /* Fail if liquidate not allowed */
            uint allowed = comptroller.liquidateBorrowAllowed(address(this), address(nTokenCollateral), liquidator, borrower, repayAmount);
            if (allowed != 0) {
                return (failOpaque(Error.REJECTION, FailureInfo.SEB_LIQUIDATE_COMPTROLLER_REJECTION, allowed), 0);
            }

            /* Verify nTokenCollateral market's block number equals current block number */
            //if (nCollateral.accrualBlockNumber() != accrualBlockNumber) {
            if (nTokenCollateral.accrualBlockNumber() != getBlockNumber()) {
                return (fail(Error.REJECTION, FailureInfo.SEB_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK), 0);
            }

            /* Fail if borrower = liquidator */
            if (borrower == liquidator) {
                return (fail(Error.REJECTION, FailureInfo.SEB_LIQUIDATE_LIQUIDATOR_IS_BORROWER), 0);
            }

            /* Fail if repayAmount = 0 */
            if (repayAmount == 0) {
                return (fail(Error.REJECTION, FailureInfo.SEB_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO), 0);
            }

            /* Fail if repayAmount = -1 */
            if (repayAmount == uint(-1)) {
                return (fail(Error.REJECTION, FailureInfo.SEB_LIQUIDATE_CLOSE_AMOUNT_IS_UINT_MAX), 0);
            }


            /* Fail if repaySEB fails */
            (uint repayBorrowError, uint actualRepayAmount) = repaySEBFresh(liquidator, borrower, repayAmount);
            if (repayBorrowError != uint(Error.NO_ERROR)) {
                return (fail(Error(repayBorrowError), FailureInfo.SEB_LIQUIDATE_REPAY_BORROW_FRESH_FAILED), 0);
            }

            /////////////////////////
            // EFFECTS & INTERACTIONS
            // (No safe failures beyond this point)

            /* We calculate the number of collateral tokens that will be seized */
            (uint amountSeizeError, uint seizeTokens) = comptroller.liquidateSEBCalculateSeizeTokens(address(nTokenCollateral), actualRepayAmount);
            require(amountSeizeError == uint(Error.NO_ERROR), "SEB_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED");

            /* Revert if borrower collateral token balance < seizeTokens */
            require(nTokenCollateral.balanceOf(borrower) >= seizeTokens, "SEB_LIQUIDATE_SEIZE_TOO_MUCH");

            uint seizeError;
            seizeError = nTokenCollateral.seize(liquidator, borrower, seizeTokens);

            /* Revert if seize tokens fails (since we cannot be sure of side effects) */
            require(seizeError == uint(Error.NO_ERROR), "token seizure failed");

            /* We emit a LiquidateBorrow event */
            emit LiquidateSEB(liquidator, borrower, actualRepayAmount, address(nTokenCollateral), seizeTokens);

            /* We call the defense hook */
            comptroller.liquidateBorrowVerify(address(this), address(nTokenCollateral), liquidator, borrower, actualRepayAmount, seizeTokens);

            return (uint(Error.NO_ERROR), actualRepayAmount);
        }
    }

    /*** Admin Functions ***/

    /**
      * @notice Sets a new comptroller
      * @dev Admin function to set a new comptroller
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setComptroller(ComptrollerInterface comptroller_) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        ComptrollerInterface oldComptroller = comptroller;
        comptroller = comptroller_;
        emit NewComptroller(oldComptroller, comptroller_);

        return uint(Error.NO_ERROR);
    }

    function _become(SEBUnitroller unitroller) external {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        require(unitroller._acceptImplementation() == 0, "change not authorized");
    }

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account total supply balance.
     *  Note that `nTokenBalance` is the number of nTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountAmountLocalVars {
        uint oErr;
        MathError mErr;
        uint sumSupply;
        uint sumBorrowPlusEffects;
        uint nTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    function getMintableSEB(address minter) public view returns (uint, uint) {
        PriceOracle oracle = ComptrollerImplInterface(address(comptroller)).oracle();
        NToken[] memory enteredMarkets = ComptrollerImplInterface(address(comptroller)).getAssetsIn(minter);

        AccountAmountLocalVars memory vars; // Holds all our calculation results

        uint accountMintableSEB;
        uint i;

        /**
         * We use this formula to calculate mintable SEB amount.
         * totalSupplyAmount * SEBMintRate - (totalBorrowAmount + mintedSEBOf)
         */
        for (i = 0; i < enteredMarkets.length; i++) {
            (vars.oErr, vars.nTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = enteredMarkets[i].getAccountSnapshot(minter);
            if (vars.oErr != 0) { // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (uint(Error.SNAPSHOT_ERROR), 0);
            }
            vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(enteredMarkets[i]);
            if (vars.oraclePriceMantissa == 0) {
                return (uint(Error.PRICE_ERROR), 0);
            }
            vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

            (vars.mErr, vars.tokensToDenom) = mulExp(vars.exchangeRate, vars.oraclePrice);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            // sumSupply += tokensToDenom * nTokenBalance
            (vars.mErr, vars.sumSupply) = mulScalarTruncateAddUInt(vars.tokensToDenom, vars.nTokenBalance, vars.sumSupply);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            (vars.mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(vars.oraclePrice, vars.borrowBalance, vars.sumBorrowPlusEffects);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }
        }

        (vars.mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, ComptrollerImplInterface(address(comptroller)).mintedSEBs(minter));
        if (vars.mErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (vars.mErr, accountMintableSEB) = mulUInt(vars.sumSupply, ComptrollerImplInterface(address(comptroller)).sebMintRate());
        require(vars.mErr == MathError.NO_ERROR, "SEB_MINT_AMOUNT_CALCULATION_FAILED");

        (vars.mErr, accountMintableSEB) = divUInt(accountMintableSEB, 10000);
        require(vars.mErr == MathError.NO_ERROR, "SEB_MINT_AMOUNT_CALCULATION_FAILED");


        (vars.mErr, accountMintableSEB) = subUInt(accountMintableSEB, vars.sumBorrowPlusEffects);
        if (vars.mErr != MathError.NO_ERROR) {
            return (uint(Error.REJECTION), 0);
        }

        return (uint(Error.NO_ERROR), accountMintableSEB);
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

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }

    /**
     * @notice Return the address of the SEB token
     * @return The address of SEB
     */
    // TODO :shoudl be done
    function getSEBAddress() public pure returns (address) {
        return 0xD0BdEb1c59B4Bb0fF53681fcE5b9d6E1cB9Cc1eF;
    }

    function initialize() onlyAdmin public {
        // The counter starts true to prevent changing it from zero to non-zero (i.e. smaller cost/refund)
        _notEntered = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /*** Reentrancy Guard ***/

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }
}