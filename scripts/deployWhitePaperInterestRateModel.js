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
  const baseRate = "20000000000000000";
  const multiplier = "100000000000000000";
  const WhitePaperInterestRateModel = await ethers.getContractFactory("WhitePaperInterestRateModel");
  const whitePaperInterestRateModel = await WhitePaperInterestRateModel.deploy(baseRate, multiplier);

  await whitePaperInterestRateModel.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract WhitePaperInterestRateModel at address:", whitePaperInterestRateModel.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
