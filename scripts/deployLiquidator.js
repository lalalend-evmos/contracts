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

  const Liquidator = await ethers.getContractFactory("Liquidator");
  
  const admin_ = "0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9";
  const nEvmos_ = "0xfaa9Bb1E7602AB9A9aAea86cCcbB6B3ddeAbbc54";
  const comptroller_ = "0x75eBe50E115bBe9F0399bab18Fe4719b7409c488" ;
  const sebController_ = "0x3a1C7Fa5b924e02fAF3cd221804173a42F0117d6";
  const treasury_ = "0xe5dba3a7dF3Dec54D7B2f92833530834c66B7DdB";
  const treasuryPercentMantissa_ = 0;

  const liquidator = await Liquidator.deploy(admin_,nEvmos_,comptroller_,sebController_,treasury_,treasuryPercentMantissa_);
  

  await liquidator.deployed()

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract liquidator at address:", liquidator.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
