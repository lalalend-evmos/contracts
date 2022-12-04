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

  /*const MiaOracleMock = await ethers.getContractFactory("MiaPriceOracleMock");
  const miaOracleMock = await MiaOracleMock.attach("0xd928133afE68dB739b322C38e8B895a3686E4597");
  */
  
  const SEBController = await ethers.getContractFactory("SEBController");
  // proxy address inside attach function
  const sebUnitroller = await SEBController.attach("0x3a1C7Fa5b924e02fAF3cd221804173a42F0117d6");


  const treasuryGuardian = await sebUnitroller.treasuryGuardian();
  const treasuryAddress = await sebUnitroller.treasuryAddress();
  const treasuryPercent = await sebUnitroller.treasuryPercent();

  const comptroller = await sebUnitroller.comptroller();



  console.log("comptroller : "+ comptroller);
  console.log("treasuryGuardian : "+ treasuryGuardian);
  console.log("treasuryAddress : "+ treasuryAddress);
  console.log("treasuryPercent : "+ treasuryPercent);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
