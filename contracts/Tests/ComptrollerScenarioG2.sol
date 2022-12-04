pragma solidity ^0.5.16;

import "./../Comptroller/ComptrollerG2.sol";

contract ComptrollerScenarioG2 is ComptrollerG2 {
    uint public blockNumber;
    /// @notice Supply caps enforced by mintAllowed for each nToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint) public supplyCaps;

    constructor() ComptrollerG2() public {}

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

    /**
    * @notice Set the given supply caps for the given nToken markets. Supply that brings total Supply to or above supply cap will revert.
    * @dev Admin function to set the supply caps. A supply cap of 0 corresponds to Minting NotAllowed.
    * @param nTokens The addresses of the markets (tokens) to change the supply caps for
    * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed.
    */
    function _setMarketSupplyCaps(NToken[] calldata nTokens, uint[] calldata newSupplyCaps) external {
        require(msg.sender == admin , "only admin can set supply caps");

        uint numMarkets = nTokens.length;
        uint numSupplyCaps = newSupplyCaps.length;

        require(numMarkets != 0 && numMarkets == numSupplyCaps, "invalid input");

        for(uint i = 0; i < numMarkets; i++) {
            supplyCaps[address(nTokens[i])] = newSupplyCaps[i];
        }
    }
}
