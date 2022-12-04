pragma solidity ^0.5.16;

import "./../Comptroller/ComptrollerG3.sol";

contract ComptrollerScenarioG3 is ComptrollerG3 {
    uint public blockNumber;

    constructor() ComptrollerG3() public {}

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
