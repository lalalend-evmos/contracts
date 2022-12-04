// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = 9000;

  
  const GovernorBravoDelegate = await ethers.getContractFactory("GovernorBravoDelegate");
  // proxy address inside attach function
  const governorBravoDelegator = await GovernorBravoDelegate.attach("0x1A27C97B84Ba2616CF8ff48df45A3f1e44a943f4");

  const impl = await governorBravoDelegator.implementation();
  const timelock = await governorBravoDelegator.timelock();
  const miaVault = await governorBravoDelegator.miaVault();
  const proposalMaxOperations = await governorBravoDelegator.proposalMaxOperations();
  const guardian = await governorBravoDelegator.guardian();

  console.log("impl : "+ impl);
  console.log("timelock : "+ timelock);
  console.log("miaVault : "+ miaVault);
  console.log("proposalMaxOperations : "+ proposalMaxOperations);
  console.log("guardian : "+ guardian);


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
