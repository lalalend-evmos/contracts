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

  const PFlux = await ethers.getContractFactory("PriceFeedConsumerExample");
  const pFlux = await PFlux.deploy("0x4C8f111a1048fEc7Ea9c9cbAB96a2cB5d1B94560");

  await pFlux.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract pFlux at address:", pFlux.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
