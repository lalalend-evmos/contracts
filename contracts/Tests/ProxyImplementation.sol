pragma solidity ^0.5.16;

contract ProxyImplementation {

    address payable public admin;
    
    constructor() public {
        admin = msg.sender;
    }

    function setImplementationForContracts(address senderContract, address target, address param) public {
        require(msg.sender == admin, "only owner is authorized");
    
    }

}