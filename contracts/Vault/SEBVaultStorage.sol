pragma solidity ^0.5.16;

import "../Utils/SafeMath.sol";
import "../Utils/IERC20.sol";
import "../Utils/SafeERC20.sol";

// DONE : should be ok

contract SEBVaultAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of SEB Vault
    */
    address public sebVaultImplementation;

    /**
    * @notice Pending brains of SEB Vault
    */
    address public pendingSEBVaultImplementation;
}

contract SEBVaultStorage is SEBVaultAdminStorage {
    /// @notice The MIA TOKEN!
    IERC20 public mia;

    /// @notice The SEB TOKEN!
    IERC20 public seb;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice MIA balance of vault
    uint256 public miaBalance;

    /// @notice Accumulated MIA per share
    uint256 public accMIAPerShare;

    //// pending rewards awaiting anyone to update
    uint256 public pendingRewards;

    /// @notice Info of each user.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    // Info of each user that stakes tokens.
    mapping(address => UserInfo) public userInfo;
}