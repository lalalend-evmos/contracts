
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

  let res = await sebUnitroller.sebControllerImplementation();
  console.log("IMPL is "+ res);
  res = await sebUnitroller.pendingSEBControllerImplementation();
  console.log(" PENDING IMPL is "+ res);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
