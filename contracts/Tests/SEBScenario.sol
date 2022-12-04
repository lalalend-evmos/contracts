pragma solidity ^0.5.16;

import "../SEB/SEB.sol";

contract SEBScenario is SEB {
    uint blockNumber = 100000;

    constructor(uint chainId) SEB(chainId) public {}

    function harnessFastForward(uint blocks) public {
        blockNumber += blocks;
    }

    function harnessSetTotalSupply(uint _totalSupply) public {
        totalSupply = _totalSupply;
    }

    function harnessIncrementTotalSupply(uint addtlSupply_) public {
        totalSupply = totalSupply + addtlSupply_;
    }

    function harnessSetBalanceOf(address account, uint _amount) public {
        balanceOf[account] = _amount;
    }

    function allocateTo(address _owner, uint256 value) public {
        balanceOf[_owner] += value;
        totalSupply += value;
        emit Transfer(address(this), _owner, value);
    }

}
