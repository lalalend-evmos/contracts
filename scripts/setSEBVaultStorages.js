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
  
  const SEBVault = await ethers.getContractFactory("SEBVault");
  // proxy address inside attach function
  const sebVaultProxy = await SEBVault.attach("0x9BFEfeA5e697C88b56A8e2BcB322e5E953A37Ca1");
  await sebVaultProxy.setMiaInfo("0x8333AfA22De158606E74E9904f281D73e0023ED9", "0xD0BdEb1c59B4Bb0fF53681fcE5b9d6E1cB9Cc1eF");

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
