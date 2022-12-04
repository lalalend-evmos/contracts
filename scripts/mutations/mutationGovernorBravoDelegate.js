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

  const GovernorBravo = await ethers.getContractFactory("GovernorBravoDelegate");
  const governorBravo = await GovernorBravo.attach("0x1A27C97B84Ba2616CF8ff48df45A3f1e44a943f4");

  await governorBravo._initiate("0xD3f9721AA021590878F8920A0AC8f28CAF3990aE")


  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
