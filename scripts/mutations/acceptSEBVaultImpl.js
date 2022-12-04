// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {

  const SEBVault = await ethers.getContractFactory("SEBVault");
  const sebVault = await SEBVault.attach("0xaD5A55501b6dE4f9E8312f2CC403F45859498c6F");

  // address of sebUnitroller 
  await sebVault._become("0x9BFEfeA5e697C88b56A8e2BcB322e5E953A37Ca1");

  /*
  miaVault.on("NewImplementation", (oldImplementation, newImplementation)=> {
    console.log('old impl is ' + oldImplementation );
    console.log('new impl is ' + newImplementation );
  })
  miaVault.on("NewPendingImplementation", (oldPendingImplementation, newPendingImplementation)=> {
    console.log('old pending impl is ' + oldPendingImplementation );
    console.log('new pending impl is ' + newPendingImplementation );
  })*/

  

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
