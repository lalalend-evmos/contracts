pragma solidity ^0.5.16;

import "./../Comptroller/Comptroller.sol";
import "./../Oracle/PriceOracle.sol";

/*contract ComptrollerKovan is Comptroller {
  function getMIAAddress() public view returns (address) {
    return 0x61460874a7196d6a22D1eE4922473664b3E95270;
  }
}

contract ComptrollerRopsten is Comptroller {
  function getMIAAddress() public view returns (address) {
    return 0x1Fe16De955718CFAb7A44605458AB023838C2793;
  }
}*/

contract ComptrollerHarness is Comptroller {
    address miaAddress;
    address nMIAAddress;
    uint public blockNumber;

    constructor() Comptroller() public {}

    function setMiaSupplyState(address nToken, uint224 index, uint32 blockNumber_) public {
        miaSupplyState[nToken].index = index;
        miaSupplyState[nToken].block = blockNumber_;
    }

    function setMiaBorrowState(address nToken, uint224 index, uint32 blockNumber_) public {
        miaBorrowState[nToken].index = index;
        miaBorrowState[nToken].block = blockNumber_;
    }

    function setMiaAccrued(address user, uint userAccrued) public {
        miaAccrued[user] = userAccrued;
    }

    function setMIAAddress(address miaAddress_) public {
        miaAddress = miaAddress_;
    }

    function getMIAAddress() public view returns (address) {
        return miaAddress;
    }

    function setMIANTokenAddress(address nMIAAddress_) public {
        nMIAAddress = nMIAAddress_;
    }

    function getMIANTokenAddress() public view returns (address) {
        return nMIAAddress;
    }

    /**
     * @notice Set the amount of MIA distributed per block
     * @param miaRate_ The amount of MIA wei per block to distribute
     */
    function harnessSetMiaRate(uint miaRate_) public {
        miaRate = miaRate_;
    }

    /**
     * @notice Recalculate and update MIA speeds for all MIA markets
     */
    function harnessRefreshMiaSpeeds() public {
        NToken[] memory allMarkets_ = allMarkets;

        for (uint i = 0; i < allMarkets_.length; i++) {
            NToken nToken = allMarkets_[i];
            Exp memory borrowIndex = Exp({mantissa: nToken.borrowIndex()});
            updateMiaSupplyIndex(address(nToken));
            updateMiaBorrowIndex(address(nToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({mantissa: 0});
        Exp[] memory utilities = new Exp[](allMarkets_.length);
        for (uint i = 0; i < allMarkets_.length; i++) {
            NToken nToken = allMarkets_[i];
            if (miaSpeeds[address(nToken)] > 0) {
                Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(nToken)});
                Exp memory utility = mul_(assetPrice, nToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (uint i = 0; i < allMarkets_.length; i++) {
            NToken nToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(miaRate, div_(utilities[i], totalUtility)) : 0;
            setMiaSpeedInternal(nToken, newSpeed);
        }
    }

    function setMiaBorrowerIndex(address nToken, address borrower, uint index) public {
        miaBorrowerIndex[nToken][borrower] = index;
    }

    function setMiaSupplierIndex(address nToken, address supplier, uint index) public {
        miaSupplierIndex[nToken][supplier] = index;
    }

    function harnessDistributeAllBorrowerMia(address nToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerMia(nToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
        miaAccrued[borrower] = grantMiaInternal(borrower, miaAccrued[borrower], 0, false);
    }

    function harnessDistributeAllSupplierMia(address nToken, address supplier) public {
        distributeSupplierMia(nToken, supplier);
        miaAccrued[supplier] = grantMiaInternal(supplier, miaAccrued[supplier], 0, false);
    }

    function harnessUpdateMiaBorrowIndex(address nToken, uint marketBorrowIndexMantissa) public {
        updateMiaBorrowIndex(nToken, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessUpdateMiaSupplyIndex(address nToken) public {
        updateMiaSupplyIndex(nToken);
    }

    function harnessDistributeBorrowerMia(address nToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerMia(nToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessDistributeSupplierMia(address nToken, address supplier) public {
        distributeSupplierMia(nToken, supplier);
    }

    function harnessTransferMia(address user, uint userAccrued, uint threshold) public returns (uint) {
        if (userAccrued > 0 && userAccrued >= threshold) {
            return grantMiaInternal(user, userAccrued, 0, false);
        }
        return userAccrued;
    }

    function harnessAddMiaMarkets(address[] memory nTokens) public {
        for (uint i = 0; i < nTokens.length; i++) {
            // temporarily set miaSpeed to 1 (will be fixed by `harnessRefreshMiaSpeeds`)
            setMiaSpeedInternal(NToken(nTokens[i]), 1);
        }
    }

    function harnessSetMintedSEBs(address user, uint amount) public {
        mintedSEBs[user] = amount;
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getMiaMarkets() public view returns (address[] memory) {
        uint m = allMarkets.length;
        uint n = 0;
        for (uint i = 0; i < m; i++) {
            if (miaSpeeds[address(allMarkets[i])] > 0) {
                n++;
            }
        }

        address[] memory miaMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (miaSpeeds[address(allMarkets[i])] > 0) {
                miaMarkets[k++] = address(allMarkets[i]);
            }
        }
        return miaMarkets;
    }

    function harnessSetReleaseStartBlock(uint startBlock) external {
        releaseStartBlock = startBlock;
    }
}

contract ComptrollerBorked {
    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        unitroller._acceptImplementation();
    }
}

contract BoolComptroller is ComptrollerInterface {
    bool allowMint = true;
    bool allowRedeem = true;
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;
    uint public liquidationIncentiveMantissa = 11e17;
    bool failCalculateSeizeTokens;
    uint calculatedSeizeTokens;

    bool public protocolPaused = false;

    mapping(address => uint) public mintedSEBs;
    bool sebFailCalculateSeizeTokens;
    uint sebCalculatedSeizeTokens;

    uint noError = 0;
    uint opaqueError = noError + 11; // an arbitrary, opaque error code

    address public treasuryGuardian;
    address public treasuryAddress;
    uint public treasuryPercent;
    address public liquidatorContract;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata _nTokens) external returns (uint[] memory) {
        _nTokens;
        uint[] memory ret;
        return ret;
    }

    function exitMarket(address _nToken) external returns (uint) {
        _nToken;
        return noError;
    }

    /*** Policy Hooks ***/

    function mintAllowed(address _nToken, address _minter, uint _mintAmount) external returns (uint) {
        _nToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(address _nToken, address _minter, uint _mintAmount, uint _mintTokens) external {
        _nToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(address _nToken, address _redeemer, uint _redeemTokens) external returns (uint) {
        _nToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(address _nToken, address _redeemer, uint _redeemAmount, uint _redeemTokens) external {
        _nToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function borrowAllowed(address _nToken, address _borrower, uint _borrowAmount) external returns (uint) {
        _nToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(address _nToken, address _borrower, uint _borrowAmount) external {
        _nToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _nToken,
        address _payer,
        address _borrower,
        uint _repayAmount) external returns (uint) {
        _nToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _nToken,
        address _payer,
        address _borrower,
        uint _repayAmount,
        uint _borrowerIndex) external {
        _nToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function _setLiquidatorContract(address liquidatorContract_) external {
        liquidatorContract = liquidatorContract_;
    }

    function liquidateBorrowAllowed(
        address _nTokenBorrowed,
        address _nTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount) external returns (uint) {
        _nTokenBorrowed;
        _nTokenCollateral;
        _borrower;
        _repayAmount;
        if (liquidatorContract != address(0) && liquidatorContract != _liquidator) {
            return opaqueError;
        }
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _nTokenBorrowed,
        address _nTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount,
        uint _seizeTokens) external {
        _nTokenBorrowed;
        _nTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _nTokenCollateral,
        address _nTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint _seizeTokens) external returns (uint) {
        _nTokenCollateral;
        _nTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _nTokenCollateral,
        address _nTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint _seizeTokens) external {
        _nTokenCollateral;
        _nTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _nToken,
        address _src,
        address _dst,
        uint _transferTokens) external returns (uint) {
        _nToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _nToken,
        address _src,
        address _dst,
        uint _transferTokens) external {
        _nToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    /*** Special Liquidation Calculation ***/

    function liquidateCalculateSeizeTokens(
        address _nTokenBorrowed,
        address _nTokenCollateral,
        uint _repayAmount) external view returns (uint, uint) {
        _nTokenBorrowed;
        _nTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    /*** Special Liquidation Calculation ***/

    function liquidateSEBCalculateSeizeTokens(
        address _nTokenCollateral,
        uint _repayAmount) external view returns (uint, uint) {
        _nTokenCollateral;
        _repayAmount;
        return sebFailCalculateSeizeTokens ? (opaqueError, 0) : (noError, sebCalculatedSeizeTokens);
    }

    /**** Mock Settors ****/

    /*** Policy Hooks ***/

    function setMintAllowed(bool allowMint_) public {
        allowMint = allowMint_;
    }

    function setMintVerify(bool verifyMint_) public {
        verifyMint = verifyMint_;
    }

    function setRedeemAllowed(bool allowRedeem_) public {
        allowRedeem = allowRedeem_;
    }

    function setRedeemVerify(bool verifyRedeem_) public {
        verifyRedeem = verifyRedeem_;
    }

    function setBorrowAllowed(bool allowBorrow_) public {
        allowBorrow = allowBorrow_;
    }

    function setBorrowVerify(bool verifyBorrow_) public {
        verifyBorrow = verifyBorrow_;
    }

    function setRepayBorrowAllowed(bool allowRepayBorrow_) public {
        allowRepayBorrow = allowRepayBorrow_;
    }

    function setRepayBorrowVerify(bool verifyRepayBorrow_) public {
        verifyRepayBorrow = verifyRepayBorrow_;
    }

    function setLiquidateBorrowAllowed(bool allowLiquidateBorrow_) public {
        allowLiquidateBorrow = allowLiquidateBorrow_;
    }

    function setLiquidateBorrowVerify(bool verifyLiquidateBorrow_) public {
        verifyLiquidateBorrow = verifyLiquidateBorrow_;
    }

    function setSeizeAllowed(bool allowSeize_) public {
        allowSeize = allowSeize_;
    }

    function setSeizeVerify(bool verifySeize_) public {
        verifySeize = verifySeize_;
    }

    function setTransferAllowed(bool allowTransfer_) public {
        allowTransfer = allowTransfer_;
    }

    function setTransferVerify(bool verifyTransfer_) public {
        verifyTransfer = verifyTransfer_;
    }

    /*** Liquidity/Liquidation Calculations ***/
    function setAnnouncedLiquidationIncentiveMantissa(uint mantissa_) external {
        liquidationIncentiveMantissa = mantissa_;
    }

    /*** Liquidity/Liquidation Calculations ***/

    function setCalculatedSeizeTokens(uint seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }

    function setSEBCalculatedSeizeTokens(uint sebSeizeTokens_) public {
        sebCalculatedSeizeTokens = sebSeizeTokens_;
    }

    function setSEBFailCalculateSeizeTokens(bool sebShouldFail) public {
        sebFailCalculateSeizeTokens = sebShouldFail;
    }

    function harnessSetMintedSEBOf(address owner, uint amount) external returns (uint) {
        mintedSEBs[owner] = amount;
        return noError;
    }

    // function mintedSEBs(address owner) external pure returns (uint) {
    //     owner;
    //     return 1e18;
    // }

    function setMintedSEBOf(address owner, uint amount) external returns (uint) {
        owner;
        amount;
        return noError;
    }

    function sebMintRate() external pure returns (uint) {
        return 1e18;
    }

    function setTreasuryData(address treasuryGuardian_, address treasuryAddress_, uint treasuryPercent_) external {
        treasuryGuardian = treasuryGuardian_;
        treasuryAddress = treasuryAddress_;
        treasuryPercent = treasuryPercent_;
    }

    function _setMarketSupplyCaps(NToken[] calldata nTokens, uint[] calldata newSupplyCaps) external {

    }

    /*** Functions from ComptrollerInterface not implemented by BoolComptroller ***/

    function markets(address) external view returns (bool, uint) { revert(); }
    function oracle() external view returns (PriceOracle) { revert(); }
    function getAccountLiquidity(address) external view returns (uint, uint, uint) { revert(); }
    function getAssetsIn(address) external view returns (NToken[] memory) { revert(); }
    function claimMia(address) external { revert(); }
    function miaAccrued(address) external view returns (uint) { revert(); }
    function miaSpeeds(address) external view returns (uint) { revert(); }
    function getAllMarkets() external view returns (NToken[] memory) { revert(); }
    function miaSupplierIndex(address, address) external view returns (uint) { revert(); }
    function miaInitialIndex() external view returns (uint224) { revert(); }
    function miaBorrowerIndex(address, address) external view returns (uint) { revert(); }
    function miaBorrowState(address) external view returns (uint224, uint32) { revert(); }
    function miaSupplyState(address) external view returns (uint224, uint32) { revert(); }
}

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns(string memory) {
        return s;
    }

    function addresses(address a) public pure returns(address) {
        return a;
    }

    function booly(bool b) public pure returns(bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns(uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}
