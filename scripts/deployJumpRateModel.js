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
  
  const baseRate=0;
  const multiplier = "200000000000000000";
  const jumpMultiplier = "3000000000000000000" ;
  const kink = "500000000000000000" ;

  const JumpRateModel = await ethers.getContractFactory("JumpRateModel");
  const jumpRateModel = await JumpRateModel.deploy(baseRate, multiplier,jumpMultiplier,kink);

  await jumpRateModel.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract JumpRateModel at address:", jumpRateModel.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
