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
  
  const SEBController = await ethers.getContractFactory("SEBController");
  // proxy address inside attach function
  const sebUnitroller = await SEBController.attach("0x3a1C7Fa5b924e02fAF3cd221804173a42F0117d6");
  await sebUnitroller._setComptroller("0x75eBe50E115bBe9F0399bab18Fe4719b7409c488");
  await sebUnitroller._setTreasuryData(deployer.address,"0xe5dba3a7dF3Dec54D7B2f92833530834c66B7DdB",0);



}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
