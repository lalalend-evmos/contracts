pragma solidity ^0.5.16;

import "../SEBController.sol";

contract SEBControllerHarness is SEBController {
    address sebAddress;
    uint public blockNumber;

    constructor() SEBController() public {
        admin = msg.sender;
    }

    function setMiaSEBState(uint224 index, uint32 blockNumber_) public {
        miaSEBState.index = index;
        miaSEBState.block = blockNumber_;
    }

    function setSEBAddress(address sebAddress_) public {
        sebAddress = sebAddress_;
    }

    /*function getSEBAddress() public view returns (address) {
        return sebAddress;
    }*/

    function harnessRepaySEBFresh(address payer, address account, uint repayAmount) public returns (uint) {
       (uint err,) = repaySEBFresh(payer, account, repayAmount);
       return err;
    }

    function harnessLiquidateSEBFresh(address liquidator, address borrower, uint repayAmount, NToken nTokenCollateral) public returns (uint) {
        (uint err,) = liquidateSEBFresh(liquidator, borrower, repayAmount, nTokenCollateral);
        return err;
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }
}
