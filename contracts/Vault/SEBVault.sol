
pragma solidity ^0.5.16;
import "../Utils/SafeERC20.sol";
import "../Utils/IERC20.sol";
import "./SEBVaultProxy.sol";
import "./SEBVaultStorage.sol";
import "./SEBVaultErrorReporter.sol";

// TODO : 

contract SEBVault is SEBVaultStorage {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice Event emitted when SEB deposit
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when SEB withrawal
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Event emitted when admin changed
    event AdminTransfered(address indexed oldAdmin, address indexed newAdmin);

    constructor() public {
        admin = msg.sender;
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

    /**
     * @notice Deposit SEB to SEBVault for MIA allocation
     * @param _amount The amount to deposit to vault
     */
    function deposit(uint256 _amount) public nonReentrant {
        UserInfo storage user = userInfo[msg.sender];

        updateVault();

        // Transfer pending tokens to user
        updateAndPayOutPending(msg.sender);

        // Transfer in the amounts from user
        if(_amount > 0) {
            seb.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }

        user.rewardDebt = user.amount.mul(accMIAPerShare).div(1e18);
        emit Deposit(msg.sender, _amount);
    }

    /**
     * @notice Withdraw SEB from SEBVault
     * @param _amount The amount to withdraw from vault
     */
    function withdraw(uint256 _amount) public nonReentrant {
        _withdraw(msg.sender, _amount);
    }

    /**
     * @notice Claim MIA from SEBVault
     */
    function claim() public nonReentrant {
        _withdraw(msg.sender, 0);
    }

    /**
     * @notice Low level withdraw function
     * @param account The account to withdraw from vault
     * @param _amount The amount to withdraw from vault
     */
    function _withdraw(address account, uint256 _amount) internal {
        UserInfo storage user = userInfo[account];
        require(user.amount >= _amount, "withdraw: not good");

        updateVault();
        updateAndPayOutPending(account); // Update balances of account this is not withdrawal but claiming MIA farmed

        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            seb.safeTransfer(address(account), _amount);
        }
        user.rewardDebt = user.amount.mul(accMIAPerShare).div(1e18);

        emit Withdraw(account, _amount);
    }

    /**
     * @notice View function to see pending MIA on frontend
     * @param _user The user to see pending MIA
     */
    function pendingMIA(address _user) public view returns (uint256)
    {
        UserInfo storage user = userInfo[_user];

        return user.amount.mul(accMIAPerShare).div(1e18).sub(user.rewardDebt);
    }

    /**
     * @notice Update and pay out pending MIA to user
     * @param account The user to pay out
     */
    function updateAndPayOutPending(address account) internal {
        uint256 pending = pendingMIA(account);

        if(pending > 0) {
            safeMIATransfer(account, pending);
        }
    }

    /**
     * @notice Safe MIA transfer function, just in case if rounding error causes pool to not have enough MIA
     * @param _to The address that MIA to be transfered
     * @param _amount The amount that MIA to be transfered
     */
    function safeMIATransfer(address _to, uint256 _amount) internal {
        uint256 miaBal = mia.balanceOf(address(this));

        if (_amount > miaBal) {
            mia.transfer(_to, miaBal);
            miaBalance = mia.balanceOf(address(this));
        } else {
            mia.transfer(_to, _amount);
            miaBalance = mia.balanceOf(address(this));
        }
    }

    /**
     * @notice Function that updates pending rewards
     */
    function updatePendingRewards() public {
        uint256 newRewards = mia.balanceOf(address(this)).sub(miaBalance);

        if(newRewards > 0) {
            miaBalance = mia.balanceOf(address(this)); // If there is no change the balance didn't change
            pendingRewards = pendingRewards.add(newRewards);
        }
    }

    /**
     * @notice Update reward variables to be up-to-date
     */
    function updateVault() internal {
        uint256 sebBalance = seb.balanceOf(address(this));
        if (sebBalance == 0) { // avoids division by 0 errors
            return;
        }

        accMIAPerShare = accMIAPerShare.add(pendingRewards.mul(1e18).div(sebBalance));
        pendingRewards = 0;
    }

    /**
     * @dev Returns the address of the current admin
     */
    function getAdmin() public view returns (address) {
        return admin;
    }

    /**
     * @dev Burn the current admin
     */
    function burnAdmin() public onlyAdmin {
        emit AdminTransfered(admin, address(0));
        admin = address(0);
    }

    /**
     * @dev Set the current admin to new address
     */
    function setNewAdmin(address newAdmin) public onlyAdmin {
        require(newAdmin != address(0), "new owner is the zero address");
        emit AdminTransfered(admin, newAdmin);
        admin = newAdmin;
    }

    /*** Admin Functions ***/

    function _become(SEBVaultProxy sebVaultProxy) public {
        require(msg.sender == sebVaultProxy.admin(), "only proxy admin can change brains");
        require(sebVaultProxy._acceptImplementation() == 0, "change not authorized");
    }

    function setMiaInfo(address _mia, address _seb) public onlyAdmin {
        mia = IERC20(_mia);
        seb = IERC20(_seb);

        _notEntered = true;
    }
}