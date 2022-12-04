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

  const SEBUnitroller = await ethers.getContractFactory("SEBUnitroller");
  const sebUnitroller = await SEBUnitroller.attach("0x3a1C7Fa5b924e02fAF3cd221804173a42F0117d6");

  await sebUnitroller._setPendingImplementation("0x09f3682d96E6773fdFB945fbab992C5CC312e368");

  sebUnitroller.on("NewPendingImplementation", (oldPendingImplementation, newPendingImplementation)=> {
    console.log('old pending impl is ' + oldPendingImplementation );
    console.log('new pending impl is ' + newPendingImplementation );
  })

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
