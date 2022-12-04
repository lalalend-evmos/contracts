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
 
  const MiaOracleMock = await ethers.getContractFactory("MiaPriceOracleMock");
  // proxy address inside attach function
  const miaOracleMock = await MiaOracleMock.attach("0x7191e2DE1DaDcb643C9e98F72d04bBBa66f58071");
   
  /*await miaOracleMock.setFeed("WETH","0xf8af20b210bCed918f71899E9f4c26dE53e6ccE6");
  await miaOracleMock.setFeed("FRAX","0x37B8123AD1B2cBF926B63E8c980ce32F7c2E11f8");
  await miaOracleMock.setFeed("USDC","0xE50d7F4B56E2F492a80CF73330047A04cfC7471D");
  await miaOracleMock.setFeed("USDT","0x77f31550D5aBD2ec40B7aC4F6526B05DEFb8A5C7");
  await miaOracleMock.setFeed("WBTC","0x371BeA87c5a254bC2d17f11f244199A55AbA0A6C");
  */
  //await miaOracleMock.setFeed("nEVMOS","0xDec9a2c82eC657F3A9344aC295D2e02888d273ec"); // price of atom just for the sake of tests
  
  //await miaOracleMock.setDirectPrice("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E","30000000000000000000");
  
  const resETH = await miaOracleMock.getUnderlyingPrice("0x298FB14bCC10352F7B227d1565b7441671F9dCa5");
  const resBTC = await miaOracleMock.getUnderlyingPrice("0xeB1CE35B9Cff71316F612aA946B6a15015614D4F");
  const resUSDT = await miaOracleMock.getUnderlyingPrice("0xea4E1AfE4865192eEccf46c60Ecc4cdAe1Db119F");
  const resUSDC = await miaOracleMock.getUnderlyingPrice("0xb07F2da8296b42F6341393088adeacD10b493F77");
  const resFRAX = await miaOracleMock.getUnderlyingPrice("0xCc46bBAA530eba84AD84F88558ADb691725E23e5");
  const resWEVMOS = await miaOracleMock.getUnderlyingPrice("0xfaa9Bb1E7602AB9A9aAea86cCcbB6B3ddeAbbc54");
  const resMIA = await miaOracleMock.getUnderlyingPrice("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E");
  console.log("ETH/USD : "+ resETH);
  console.log("BTC/USD : "+ resBTC);
  console.log("USDT/USD : "+ resUSDT);
  console.log("USDC/USD : "+ resUSDC);
  console.log("FRAX/USD : "+ resFRAX);
  console.log("WEVMOS/USD : "+ resWEVMOS);
  console.log("MIA/USD : "+ resMIA);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
