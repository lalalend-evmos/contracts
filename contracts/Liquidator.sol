pragma solidity ^0.5.16;

import "./Comptroller/ComptrollerInterface.sol";
import "./SEBControllerInterface.sol";
import "./NTokens/NEvmos.sol";
import "./NTokens/NErc20.sol";
import "./Utils/ReentrancyGuard.sol";
import "./Utils/WithAdmin.sol";
import "./Utils/SafeMath.sol";
import "./Utils/IERC20.sol";
import "./Utils/SafeERC20.sol";

contract Liquidator is WithAdmin, ReentrancyGuard {

    /// @notice Address of nEVMOS contract.
    // DONE 
    NEvmos public nEvmos;

    /// @notice Address of Lalalend Unitroller contract.
    IComptroller comptroller;

    /// @notice Address of SEBUnitroller contract.
    SEBControllerInterface sebController;

    /// @notice Address of Lalalend Treasury.
    address public treasury;

    /// @notice Percent of seized amount that goes to treasury.
    uint256 public treasuryPercentMantissa;

    /// @notice Emitted when once changes the percent of the seized amount
    ///         that goes to treasury.
    event NewLiquidationTreasuryPercent(uint256 oldPercent, uint256 newPercent);

    /// @notice Event emitted when a borrow is liquidated
    event LiquidateBorrowedTokens(address liquidator, address borrower, uint256 repayAmount, address nTokenCollateral, uint256 seizeTokensForTreasury, uint256 seizeTokensForLiquidator);

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    constructor(
        address admin_,
        address payable nEvmos_,
        address comptroller_,
        address sebController_,
        address treasury_,
        uint256 treasuryPercentMantissa_
    )
        public
        WithAdmin(admin_)
        ReentrancyGuard()
    {
        ensureNonzeroAddress(admin_);
        ensureNonzeroAddress(sebController_);
        ensureNonzeroAddress(comptroller_);
        ensureNonzeroAddress(sebController_);
        ensureNonzeroAddress(treasury_);
        nEvmos = NEvmos(nEvmos_);
        comptroller = IComptroller(comptroller_);
        sebController = SEBControllerInterface(sebController_);
        treasury = treasury_;
        treasuryPercentMantissa = treasuryPercentMantissa_;
    }

    /// @notice Liquidates a borrow and splits the seized amount between treasury and
    ///         liquidator. The liquidators should use this interface instead of calling
    ///         nToken.liquidateBorrow(...) directly.
    /// @dev For BNB borrows msg.value should be equal to repayAmount; otherwise msg.value
    ///      should be zero.
    /// @param nToken Borrowed nToken
    /// @param borrower The address of the borrower
    /// @param repayAmount The amount to repay on behalf of the borrower
    /// @param nTokenCollateral The collateral to seize
    function liquidateBorrow(
        address nToken,
        address borrower,
        uint256 repayAmount,
        NToken nTokenCollateral
    )
        external
        payable
        nonReentrant
    {
        ensureNonzeroAddress(borrower);
        uint256 ourBalanceBefore = nTokenCollateral.balanceOf(address(this));
        if (nToken == address(nEvmos)) {
            require(repayAmount == msg.value, "wrong amount");
            nEvmos.liquidateBorrow.value(msg.value)(borrower, nTokenCollateral);
        } else {
            require(msg.value == 0, "you shouldn't pay for this");
            if (nToken == address(sebController)) {
                _liquidateSEB(borrower, repayAmount, nTokenCollateral);
            } else {
                _liquidateErc20(NErc20(nToken), borrower, repayAmount, nTokenCollateral);
            }
        }
        uint256 ourBalanceAfter = nTokenCollateral.balanceOf(address(this));
        uint256 seizedAmount = ourBalanceAfter.sub(ourBalanceBefore);
        (uint256 ours, uint256 theirs) = _distributeLiquidationIncentive(nTokenCollateral, seizedAmount);
        emit LiquidateBorrowedTokens(msg.sender, borrower, repayAmount, address(nTokenCollateral), ours, theirs);
    }

    /// @notice Sets the new percent of the seized amount that goes to treasury. Should
    ///         be less than or equal to comptroller.liquidationIncentiveMantissa().sub(1e18).
    /// @param newTreasuryPercentMantissa New treasury percent (scaled by 10^18).
    function setTreasuryPercent(uint256 newTreasuryPercentMantissa) external onlyAdmin {
        require(
            newTreasuryPercentMantissa <= comptroller.liquidationIncentiveMantissa().sub(1e18),
            "appetite too big"
        );
        emit NewLiquidationTreasuryPercent(treasuryPercentMantissa, newTreasuryPercentMantissa);
        treasuryPercentMantissa = newTreasuryPercentMantissa;
    }

    /// @dev Transfers ERC20 tokens to self, then approves nToken to take these tokens.
    function _liquidateErc20(
        NErc20 nToken,
        address borrower,
        uint256 repayAmount,
        NToken nTokenCollateral
    )
        internal
    {
        IERC20 borrowedToken = IERC20(nToken.underlying());
        uint256 actualRepayAmount = _transferErc20(borrowedToken, msg.sender, address(this), repayAmount);
        borrowedToken.safeApprove(address(nToken), 0);
        borrowedToken.safeApprove(address(nToken), actualRepayAmount);
        requireNoError(
            nToken.liquidateBorrow(borrower, actualRepayAmount, nTokenCollateral),
            "failed to liquidate"
        );
    }

    /// @dev Transfers ERC20 tokens to self, then approves seb to take these tokens.
    function _liquidateSEB(address borrower, uint256 repayAmount, NToken nTokenCollateral)
        internal
    {
        IERC20 seb = IERC20(sebController.getSEBAddress());
        seb.safeTransferFrom(msg.sender, address(this), repayAmount);
        seb.safeApprove(address(sebController), repayAmount);

        (uint err,) = sebController.liquidateSEB(borrower, repayAmount, nTokenCollateral);
        requireNoError(err, "failed to liquidate");
    }

    /// @dev Splits the received nTokens between the liquidator and treasury.
    function _distributeLiquidationIncentive(NToken nTokenCollateral, uint256 siezedAmount)
        internal returns (uint256 ours, uint256 theirs)
    {
        (ours, theirs) = _splitLiquidationIncentive(siezedAmount);
        require(
            nTokenCollateral.transfer(msg.sender, theirs),
            "failed to transfer to liquidator"
        );
        require(
            nTokenCollateral.transfer(treasury, ours),
            "failed to transfer to treasury"
        );
        return (ours, theirs);
    }

    /// @dev Transfers tokens and returns the actual transfer amount
    function _transferErc20(IERC20 token, address from, address to, uint256 amount)
        internal
        returns (uint256 actualAmount)
    {
        uint256 prevBalance = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        return token.balanceOf(to).sub(prevBalance);
    }

    /// @dev Computes the amounts that would go to treasury and to the liquidator.
    function _splitLiquidationIncentive(uint256 seizedAmount)
        internal
        view
        returns (uint256 ours, uint256 theirs)
    {
        uint256 totalIncentive = comptroller.liquidationIncentiveMantissa();
        uint256 seizedForRepayment = seizedAmount.mul(1e18).div(totalIncentive);
        ours = seizedForRepayment.mul(treasuryPercentMantissa).div(1e18);
        theirs = seizedAmount.sub(ours);
        return (ours, theirs);
    }

    function requireNoError(uint errCode, string memory message) internal pure {
        if (errCode == uint(0)) {
            return;
        }

        bytes memory fullMessage = new bytes(bytes(message).length + 5);
        uint i;

        for (i = 0; i < bytes(message).length; i++) {
            fullMessage[i] = bytes(message)[i];
        }

        fullMessage[i+0] = byte(uint8(32));
        fullMessage[i+1] = byte(uint8(40));
        fullMessage[i+2] = byte(uint8(48 + ( errCode / 10 )));
        fullMessage[i+3] = byte(uint8(48 + ( errCode % 10 )));
        fullMessage[i+4] = byte(uint8(41));

        revert(string(fullMessage));
    }

    function ensureNonzeroAddress(address addr) internal pure {
        require(addr != address(0), "address should be nonzero");
    }
}