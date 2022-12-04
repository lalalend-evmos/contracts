pragma solidity ^0.5.16;

import "./../Comptroller/ComptrollerG5.sol";

contract ComptrollerScenarioG5 is ComptrollerG5 {
    uint public blockNumber;

    constructor() ComptrollerG5() public {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function membershipLength(NToken nToken) public view returns (uint) {
        return accountAssets[address(nToken)].length;
    }

    function unlist(NToken nToken) public {
        markets[address(nToken)].isListed = false;
    }

    function setMiaSpeed(address nToken, uint miaSpeed) public {
        miaSpeeds[nToken] = miaSpeed;
    }
}
