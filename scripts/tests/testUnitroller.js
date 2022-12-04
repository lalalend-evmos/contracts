
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

  const Unitroller = await ethers.getContractFactory("Unitroller");
  const unitroller = await Unitroller.attach("0x75eBe50E115bBe9F0399bab18Fe4719b7409c488");

  let res = await unitroller.comptrollerImplementation();
  console.log("IMPL is "+ res);
  res = await unitroller.pendingComptrollerImplementation();
  console.log(" PENDING IMPL is "+ res);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
