pragma solidity ^0.5.16;

import "./../Comptroller/ComptrollerInterface.sol";

contract TestNael {
    ComptrollerInterface public comptroller;
    address public admin;
    constructor(address _comptroller) public {
        comptroller = ComptrollerInterface(_comptroller);
        admin = msg.sender;
    }
    function isAllowed(address nToken, address borrower, uint amount) external returns (uint) {
        require(msg.sender==admin, "error only owner");
        return 0;
    }

}