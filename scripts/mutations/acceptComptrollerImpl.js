// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {

  const Comptroller = await ethers.getContractFactory("Comptroller");
  const comptroller = await Comptroller.attach("0xb0F26819Fee014272D5F2A2C1A8735bcF3e856cB");

  const Unitroller = await ethers.getContractFactory("Unitroller");
  const unitroller = await Unitroller.attach("0x75eBe50E115bBe9F0399bab18Fe4719b7409c488");
  let res = await unitroller.comptrollerImplementation();

  console.log(res);
  // address of unitroller 
  //await comptroller._become("0x75eBe50E115bBe9F0399bab18Fe4719b7409c488");

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
