// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;
const { evmosMantissa } = require('./utils/utils');
const BigNum = require('bignumber.js');


async function main() {
  const [deployer] = await ethers.getSigners();

  // todo
  
  const timelockAddress = "";
  // MIAvaultProxy address
  const miaVaultAddress = "0xdf034433adB73978D328548EF21e021a8E9849DF";
  const admin = "0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9";
  const governorBravoDelegateAddress = "0x2B01D72a8815f787525f4A68c26e998Cbd5C59E4";
  const votingPeriod = 86400; // to verify after 
  const votingDelay = 1;
  const proposalThreshold = "300000000000000000000000";
  const guardian = "0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9";

  const GovernorBravoDelegator = await ethers.getContractFactory("GovernorBravoDelegator");
  const governorBravoDelegator = await GovernorBravoDelegator.deploy(
    timelockAddress,
    miaVaultAddress,
    admin,
    governorBravoDelegateAddress,
    votingPeriod,
    votingDelay,
    proposalThreshold,
    guardian
  );

  await governorBravoDelegator.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract GovernorBravoDelegator at address:", governorBravoDelegator.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
