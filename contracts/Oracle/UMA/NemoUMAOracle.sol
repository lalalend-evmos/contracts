pragma solidity ^0.5.16;

import "./../PriceOracle.sol";
import "./../../NTokens/NErc20.sol";
import "./../../EIP20Interface.sol";
import "./../../libraries/SafeMath.sol";

contract MiaUMAOracle is PriceOracle {
    using SafeMath for uint;
    uint public constant SEB_VALUE = 1e18;


    address public admin;

    mapping (address=>uint) internal prices;


    event NewAdmin(address oldAdmin, address newAdmin);

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