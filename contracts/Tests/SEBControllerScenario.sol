pragma solidity ^0.5.16;

import "../SEBController.sol";
import "./ComptrollerScenario.sol";

contract SEBControllerScenario is SEBController {
    uint blockNumber;
    address public miaAddress;
    address public sebAddress;

    constructor() SEBController() public {}

    function setSEBAddress(address sebAddress_) public {
        sebAddress = sebAddress_;
    }

    /*function getSEBAddress() public view returns (address) {
        return sebAddress;
    }*/

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }
}
