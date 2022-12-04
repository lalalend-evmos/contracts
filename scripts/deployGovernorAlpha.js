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
  const timelock = "0x8A9a884D712fbBA3D0E0b31C5F4774f05eF239Cb", mia = "0x8333AfA22De158606E74E9904f281D73e0023ED9", guardian = "0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9";
  const GovernorAlpha = await ethers.getContractFactory("contracts/Governance/GovernorAlpha.sol:GovernorAlpha");
  const governorAlpha = await GovernorAlpha.deploy(timelock, mia, guardian);

  await governorAlpha.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract GovernorAlpha at address:", governorAlpha.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
