pragma solidity ^0.5.16;

import "./../NTokens/NErc20.sol";
import "./../NTokens/NToken.sol";
import "./PriceOracle.sol";

interface V1PriceOracleInterface {
    function assetPrices(address asset) external view returns (uint);
}

contract PriceOracleProxy is PriceOracle {
    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    // DONE
    /// @notice Address of the guardian, which may set the SAI price once
    address public guardian;

    /// @notice Address of the nEvmos contract, which has a constant price
    address public nEvmosAddress;

    /// @notice Address of the nUSDC contract, which we hand pick a key for
    address public nUsdcAddress;

    /// @notice Address of the nUSDT contract, which uses the nUSDC price
    address public nUsdtAddress;

    /// @notice Address of the nSAI contract, which may have its price set
    address public nSaiAddress;

    /// @notice Address of the nDAI contract, which we hand pick a key for
    address public nDaiAddress;

    /// @notice Handpicked key for USDC
    address public constant usdcOracleKey = address(1);

    /// @notice Handpicked key for DAI
    address public constant daiOracleKey = address(2);

    /// @notice Frozen SAI price (or 0 if not set yet)
    uint public saiPrice;

    /**
     * @param guardian_ The address of the guardian, which may set the SAI price once
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param nEvmosAddress_ The address of nEvmos, which will return a constant 1e18, since all prices relative to evmos
     * @param nUsdcAddress_ The address of nUSDC, which will be read from a special oracle key
     * @param nSaiAddress_ The address of nSAI, which may be read directly from storage
     * @param nDaiAddress_ The address of nDAI, which will be read from a special oracle key
     * @param nUsdtAddress_ The address of nUSDT, which uses the nUSDC price
     */
    constructor(address guardian_,
                address v1PriceOracle_,
                address nEvmosAddress_,
                address nUsdcAddress_,
                address nSaiAddress_,
                address nDaiAddress_,
                address nUsdtAddress_) public {
        guardian = guardian_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);

        nEvmosAddress = nEvmosAddress_;
        nUsdcAddress = nUsdcAddress_;
        nSaiAddress = nSaiAddress_;
        nDaiAddress = nDaiAddress_;
        nUsdtAddress = nUsdtAddress_;
    }

    /**
     * @notice Get the underlying price of a listed nToken asset
     * @param nToken The nToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(NToken nToken) public view returns (uint) {
        address nTokenAddress = address(nToken);

        if (nTokenAddress == nEvmosAddress) {
            // evmos always worth 1
            return 1e18;
        }

        if (nTokenAddress == nUsdcAddress || nTokenAddress == nUsdtAddress) {
            return v1PriceOracle.assetPrices(usdcOracleKey);
        }

        if (nTokenAddress == nDaiAddress) {
            return v1PriceOracle.assetPrices(daiOracleKey);
        }

        if (nTokenAddress == nSaiAddress) {
            // use the frozen SAI price if set, otherwise use the DAI price
            return saiPrice > 0 ? saiPrice : v1PriceOracle.assetPrices(daiOracleKey);
        }

        // otherwise just read from v1 oracle
        address underlying = NErc20(nTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }

    /**
     * @notice Set the price of SAI, permanently
     * @param price The price for SAI
     */
    function setSaiPrice(uint price) public {
        require(msg.sender == guardian, "only guardian may set the SAI price");
        require(saiPrice == 0, "SAI price may only be set once");
        require(price < 0.1e18, "SAI price must be < 0.1 BNB");
        saiPrice = price;
    }
}