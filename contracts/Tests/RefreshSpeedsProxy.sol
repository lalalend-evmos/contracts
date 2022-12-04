pragma solidity ^0.5.16;

interface IComptroller {
	function refreshMiaSpeeds() external;
}

contract RefreshSpeedsProxy {
	constructor(address comptroller) public {
		IComptroller(comptroller).refreshMiaSpeeds();
	}
}
