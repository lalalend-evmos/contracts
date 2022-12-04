pragma solidity ^0.5.16;

import "./../NTokens/NToken.sol";
import "./../Oracle/PriceOracle.sol";
import "./../SEBControllerInterface.sol";
import "./../Lens/ComptrollerLensInterface.sol";

contract UnitrollerAdminStorage {
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
    address public comptrollerImplementation;

    /**
    * @notice Pending brains of Unitroller
    */
    address public pendingComptrollerImplementation;
}

contract ComptrollerV1Storage is UnitrollerAdminStorage {

    /**
     * @notice Oracle which gives the price of any given asset
     */
    PriceOracle public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint public liquidationIncentiveMantissa;

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    uint public maxAssets;

    /**
     * @notice Per-account mapping of "assets you are in", capped by maxAssets
     */
    mapping(address => NToken[]) public accountAssets;

    struct Market {
        /// @notice Whether or not this market is listed 
        bool isListed;

        /**
         * @notice Multiplier representing the most one can borrow against their collateral in this market.
         *  For instance, 0.9 to allow borrowing 90% of collateral value.
         *  Must be between 0 and 1, and stored as a mantissa.
         */
        uint collateralFactorMantissa;

        /// @notice Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;

        /// @notice Whether or not this market receives MIA
        bool isMia;
    }
 
    /**
     * @notice Official mapping of nTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) public markets;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     *  Actions which allow users to remove their own assets cannot be paused.
     *  Liquidation / seizing / transfer can only be paused globally, not by market.
     */
    address public pauseGuardian;
    /// @notice Whether minting is paused (deprecated, superseded by per-market pause)
    bool private _mintGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by per-market pause)
    bool private _borrowGuardianPaused;
    bool public transferGuardianPaused;
    bool public seizeGuardianPaused;
    mapping(address => bool) public mintGuardianPaused;
    mapping(address => bool) public borrowGuardianPaused;

    struct MiaMarketState {
        /// @notice The market's last updated miaBorrowIndex or miaSupplyIndex
        uint224 index;

        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice A list of all markets
    NToken[] public allMarkets;
 
    /// @notice The rate at which the flywheel distributes MIA, per block
    uint public miaRate;

    /// @notice The portion of miaRate that each market currently receives
    mapping(address => uint) public miaSpeeds;

    /// @notice The Mia market supply state for each market
    mapping(address => MiaMarketState) public miaSupplyState;

    /// @notice The Mia market borrow state for each market
    mapping(address => MiaMarketState) public miaBorrowState;

    /// @notice The Mia supply index for each market for each supplier as of the last time they accrued MIA
    mapping(address => mapping(address => uint)) public miaSupplierIndex;

    /// @notice The Mia borrow index for each market for each borrower as of the last time they accrued MIA
    mapping(address => mapping(address => uint)) public miaBorrowerIndex;

    /// @notice The Mia accrued but not yet transferred to each user
    mapping(address => uint) public miaAccrued;

    /// @notice The Address of SEBController
    SEBControllerInterface public sebController;

    /// @notice The minted SEB amount to each user
    mapping(address => uint) public mintedSEBs;

    /// @notice SEB Mint Rate as a percentage
    uint public sebMintRate;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    bool public mintSEBGuardianPaused;
    bool public repaySEBGuardianPaused;

    /**
     * @notice Pause/Unpause whole protocol actions
     */
    bool public protocolPaused;

    /// @notice The rate at which the flywheel distributes MIA to SEB Minters, per block (deprecated)
    uint private miaSEBRate;
}

contract ComptrollerV2Storage is ComptrollerV1Storage {
    /// @notice The rate at which the flywheel distributes MIA to SEB Vault, per block
    uint public miaSEBVaultRate;

    // address of SEB Vault
    address public sebVaultAddress;

    // start block of release to SEB Vault
    uint256 public releaseStartBlock;

    // minimum release amount to SEB Vault
    uint256 public minReleaseAmount;
}

contract ComptrollerV3Storage is ComptrollerV2Storage {
    /// @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    address public borrowCapGuardian;

    /// @notice Borrow caps enforced by borrowAllowed for each nToken address. Defaults to zero which corresponds to unlimited borrowing.
    mapping(address => uint) public borrowCaps;
}

contract ComptrollerV4Storage is ComptrollerV3Storage {
    /// @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice Treasury address
    address public treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;
}

contract ComptrollerV5Storage is ComptrollerV4Storage {
    /// @notice The portion of MIA that each contributor receives per block (deprecated)
    mapping(address => uint) private miaContributorSpeeds;

    /// @notice Last block at which a contributor's MIA rewards have been allocated (deprecated)
    mapping(address => uint) private lastContributorBlock;
}

contract ComptrollerV6Storage is ComptrollerV5Storage {
    address public liquidatorContract;
}
 
contract ComptrollerV7Storage is ComptrollerV6Storage {
    ComptrollerLensInterface public comptrollerLens;
}

contract ComptrollerV8Storage is ComptrollerV7Storage {
    
    /// @notice Supply caps enforced by mintAllowed for each nToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint256) public supplyCaps;
}