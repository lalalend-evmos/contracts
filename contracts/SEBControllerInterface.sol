pragma solidity ^0.5.16;

import "./NTokens/NToken.sol";

contract SEBControllerInterface {
    function getSEBAddress() public view returns (address);
    function getMintableSEB(address minter) public view returns (uint, uint);
    function mintSEB(address minter, uint mintSEBAmount) external returns (uint);
    function repaySEB(address repayer, uint repaySEBAmount) external returns (uint);
    function liquidateSEB(address borrower, uint repayAmount, NTokenInterface nTokenCollateral) external returns (uint, uint);

    function _initializeMiaSEBState(uint blockNumber) external returns (uint);
    function updateMiaSEBMintIndex() external returns (uint);
    function calcDistributeSEBMinterMia(address sebMinter) external returns(uint, uint, uint, uint);
}