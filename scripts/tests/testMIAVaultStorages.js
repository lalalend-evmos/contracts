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

  
  const MIAVault = await ethers.getContractFactory("MIAVault");
  // proxy address inside attach function
  const miaVaultProxy = await MIAVault.attach("0xdf034433adB73978D328548EF21e021a8E9849DF");


  const mia = await miaVaultProxy.MIAAddress();

  const MIASTORE = await miaVaultProxy.MIAStore();


  console.log("mia : "+ mia);
  console.log("mia store : "+ MIASTORE);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
