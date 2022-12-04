pragma solidity ^0.5.16;

import "./Comptroller/ComptrollerInterface.sol";

contract SEBUnitrollerAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of Unitroller
    */
    address public sebControllerImplementation;

    /**
    * @notice Pending brains of Unitroller
    */
    address public pendingSEBControllerImplementation;
}

contract SEBControllerStorageG1 is SEBUnitrollerAdminStorage {
    ComptrollerInterface public comptroller;

    struct MiaSEBState {
        /// @notice The last updated miaSEBMintIndex
        uint224 index;

        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice The Mia SEB state
    MiaSEBState public miaSEBState;

    /// @notice The Mia SEB state initialized
    bool public isMiaSEBInitialized;

    /// @notice The Mia SEB minter index as of the last time they accrued MIA
    mapping(address => uint) public miaSEBMinterIndex;
}

contract SEBControllerStorageG2 is SEBControllerStorageG1 {
    /// @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice Treasury address
    address public treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;
}