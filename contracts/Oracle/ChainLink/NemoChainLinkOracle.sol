pragma solidity ^0.5.16;

import "./../PriceOracle.sol";
import "./../../NTokens/NErc20.sol";
import "./../../EIP20Interface.sol";
import "./../../libraries/SafeMath.sol";
import "./AggregatorV2V3Interface.sol";

contract MiaChainlinkOracle is PriceOracle {
    using SafeMath for uint;
    uint public constant SEB_VALUE = 1e18;
    address public admin;

    //uint public maxStalePeriod;

    mapping(address => uint) internal prices;
    mapping(bytes32 => AggregatorV2V3Interface) internal feeds;

    event PricePosted(address asset, uint previousPriceMantissa, uint requestedPriceMantissa, uint newPriceMantissa);
    event NewAdmin(address oldAdmin, address newAdmin);
    event FeedSet(address feed, string symbol);
    event MaxStalePeriodUpdated(uint oldMaxStalePeriod, uint newMaxStalePeriod);

    constructor() public {
        admin = msg.sender;
        //maxStalePeriod = maxStalePeriod_;
    }

    /*function setMaxStalePeriod(uint newMaxStalePeriod) external onlyAdmin() {
        require(newMaxStalePeriod > 0, "stale period can't be zero");
        uint oldMaxStalePeriod = maxStalePeriod;
        maxStalePeriod = newMaxStalePeriod;
        emit MaxStalePeriodUpdated(oldMaxStalePeriod, newMaxStalePeriod);
    }*/

    function getUnderlyingPrice(NToken nToken) public view returns (uint) {
        string memory symbol = nToken.symbol();
        // DONE : should be ok
        /*
        if (compareStrings(symbol, "nEVMOS")) {
            return getChainlinkPrice(getFeed(symbol));
        } else if (compareStrings(symbol, " SEB")) {
            return SEB_VALUE;
        } else if (compareStrings(symbol, "MIA")) {
            return prices[address(nToken)];
        } else {
            return getPrice(nToken);
        }*/
        if(compareStrings(symbol, "SEB")) {
            return SEB_VALUE;
        } else if (compareStrings(symbol, "MIA")) {
            return prices[address(nToken)];
        } else {
            return getPrice(nToken);
        }
    }

    function getPrice(NToken nToken) internal view returns (uint price) {
        EIP20Interface token = EIP20Interface(NErc20(address(nToken)).underlying());

        if (prices[address(token)] != 0) {
            price = prices[address(token)];
        } else {
            price = getChainlinkPrice(getFeed(token.symbol()));
        }

        uint decimalDelta = uint(18).sub(uint(token.decimals()));
        // Ensure that we don't multiply the result by 0
        if (decimalDelta > 0) {
            return price.mul(10**decimalDelta);
        } else {
            return price;
        }
    }

    function getChainlinkPrice(AggregatorV2V3Interface feed) internal view returns (uint) {
        // Chainlink USD-denominated feeds store answers at 8 decimals
        uint decimalDelta = uint(18).sub(feed.decimals());

        if (decimalDelta > 0) {
            return uint(feed.latestAnswer()).mul(10**decimalDelta);
        } else {
            return uint(feed.latestAnswer());
        }
    }

    function setUnderlyingPrice(NToken nToken, uint underlyingPriceMantissa) external onlyAdmin() {
        address asset = address(NErc20(address(nToken)).underlying());
        emit PricePosted(asset, prices[asset], underlyingPriceMantissa, underlyingPriceMantissa);
        prices[asset] = underlyingPriceMantissa;
    }

    function setDirectPrice(address asset, uint price) external onlyAdmin() {
        emit PricePosted(asset, prices[asset], price, price);
        prices[asset] = price;
    }

    function setFeed(string calldata symbol, address feed) external onlyAdmin() {
        require(feed != address(0) && feed != address(this), "invalid feed address");
        emit FeedSet(feed, symbol);
        feeds[keccak256(abi.encodePacked(symbol))] = AggregatorV2V3Interface(feed);
    }

    function getFeed(string memory symbol) public view returns (AggregatorV2V3Interface) {
        return feeds[keccak256(abi.encodePacked(symbol))];
    }

    function assetPrices(address asset) external view returns (uint) {
        return prices[asset];
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function setAdmin(address newAdmin) external onlyAdmin() {
        address oldAdmin = admin;
        admin = newAdmin;

        emit NewAdmin(oldAdmin, newAdmin);
    }

    modifier onlyAdmin() {
      require(msg.sender == admin, "only admin may call");
      _;
    }
}