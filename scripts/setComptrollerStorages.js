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
  
  const Comptroller = await ethers.getContractFactory("Comptroller");
  // proxy address inside attach function
  const unitroller = await Comptroller.attach("0x75eBe50E115bBe9F0399bab18Fe4719b7409c488");
  //await unitroller._setComptrollerLens("0x10d229945Ce65E2B2d8fbe6850D18b8227ad1Bd4");
  //await unitroller._setTreasuryData(deployer.address,"0xe5dba3a7dF3Dec54D7B2f92833530834c66B7DdB",0);
  //await unitroller._setCloseFactor("500000000000000000");
  //await unitroller._setLiquidationIncentive("1100000000000000000");
  await unitroller._setLiquidatorContract("0xdfd9Ab52DAC750b3e1429Fd3Df5F80828C99FD0F"); 
  //await unitroller._setSEBController("0x3a1C7Fa5b924e02fAF3cd221804173a42F0117d6");
  // not made await unitroller._setSEBVaultInfo("0x9BFEfeA5e697C88b56A8e2BcB322e5E953A37Ca1","20641115 ","4000000000000000000"); // after get SEBVaultProxy address

  // not made await unitroller._setMiaSEBVaultRate("8680555555555560"); // after

  /* TODO 
  => miaRate : 224000000000000000 (lalalendRate)
  => miaSEBVaultRate : 8680555555555560  (lalalendSEBVaultRate)


  
  const sebController = await unitroller.sebController();
  const liquidatorContract = await unitroller.liquidatorContract();
  const comptrollerLens = await unitroller.comptrollerLens();
  const treasuryGuardian = await unitroller.treasuryGuardian();
  const treasuryAddress = await unitroller.treasuryAddress();
  const treasuryPercent = await unitroller.treasuryPercent();
  const miaSEBVaultRate = await unitroller.miaSEBVaultRate();
  const sebVaultAddress = await unitroller.sebVaultAddress();
  const releaseStartBlock = await unitroller.releaseStartBlock();
  //const miaSEBRate = await unitroller.miaSEBRate(); private ? 
  const sebMintRate = await unitroller.sebMintRate();
  const miaRate = await unitroller.miaRate();
  //const collateralFactorMantissa = await unitroller.collateralFactorMantissa();
  const liquidationIncentiveMantissa = await unitroller.liquidationIncentiveMantissa();
  const closeFactorMantissa = await unitroller.closeFactorMantissa();
  const minReleaseAmount = await unitroller.minReleaseAmount(); 4000000000000000000 

  console.log("sebController : "+ sebController);
  console.log("liquidatorContract : "+ liquidatorContract);
  console.log("comptrollerLens : "+ comptrollerLens);
  console.log("treasuryGuardian : "+ treasuryGuardian);
  console.log("treasuryAddress : "+ treasuryAddress);
  console.log("treasuryPercent : "+ treasuryPercent);
  console.log("miaSEBVaultRate : "+ miaSEBVaultRate);
  console.log("sebVaultAddress : "+ sebVaultAddress);
  console.log("releaseStartBlock : "+ releaseStartBlock);
  console.log("minReleaseAmount : "+ minReleaseAmount);
  //console.log("miaSEBRate : "+ miaSEBRate);
  console.log("sebMintRate : "+ sebMintRate);
  console.log("miaRate : "+ miaRate);
  //console.log("collateralFactorMantissa : "+ collateralFactorMantissa);
  console.log("liquidationIncentiveMantissa : "+ liquidationIncentiveMantissa);
  console.log("closeFactorMantissa : "+ closeFactorMantissa);
  */
  // _setSEBController
  // _setTreasuryData

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
