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

  await unitroller.exitMarket("0x5fF141cd9fb7A3137d43f3116F99a78Ab46FE5e4");
  /*
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

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
