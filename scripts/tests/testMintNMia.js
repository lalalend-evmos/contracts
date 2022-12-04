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

  const NMIA = await ethers.getContractFactory("NErc20Delegate");
  const nmia = await NMIA.attach("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E");

  
  const totalSupply = await nmia.totalSupply();
  console.log("total supply of nmia token is "+totalSupply);
  
  /*const eR = await nmia.exchangeRateStored();
  console.log("exchange rate is : "+ eR);

  const balanceOfNMIA = await nmia.balanceOf(deployer.address);
  const balanceOfMIA = await nmia.balanceOfUnderlying(deployer.address);
  
  console.log("nmia token [NMIA] : "+ balanceOfNMIA);

  */
  const MIA = await ethers.getContractFactory("MIA");
  const mia = await MIA.attach("0x8333AfA22De158606E74E9904f281D73e0023ED9");

  //console.log("balanceOfMIA [NMIA] : "+ balanceOfMIA);

  //const balance= await mia.balanceOf("0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9");

  //console.log("balance of MIA token [MIA] : "+ balance);




  //const totalSupplyMIA = await mia.totalSupply();
  //console.log("total supply of mia token is "+totalSupplyMIA);

  const Comptroller = await ethers.getContractFactory("Comptroller");
  // proxy address inside attach function
  const unitroller = await Comptroller.attach("0x75eBe50E115bBe9F0399bab18Fe4719b7409c488");

  //await unitroller._setMarketSupplyCaps(["0xd9edE9aDe6090987fB3eBE4750877C66b32c002E"], [ethers.utils.parseEther('70000000')]);

  const supplyCap = await unitroller.supplyCaps("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E");
  console.log("supply cap of Lalalend mia: "+ supplyCap); 

 

  //const totalCash = await nmia.getCash();
  //console.log("total cash of mia inside nmia token market is : "+ totalCash); 
  //const market = await unitroller.markets("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E");
  //console.log("market is listed : "+ market.isListed);
  //await unitroller._supportMarket("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E");
  

  /*console.log("Attempting to mint ");
  await nmia.mint(ethers.utils.parseEther("100000"));

  nmia.on("Mint", (minter, actualMintAmount, mintTokens)=> {
    console.log(minter, actualMintAmount, mintTokens);
  })*/

  /*nmia.on("Failure", (error, info, detail) => {
    console.log(error, info, detail);
  });

  nmia.on("AccrueInterest", (cashPrior, interestAccumulated, borrowIndexNew, totalBorrowsNew) => {
    console.log(cashPrior, interestAccumulated, borrowIndexNew, totalBorrowsNew);
  });

  nmia.on("Mint", (minter, actualMintAmount, mintTokens)=> {
    console.log(minter, actualMintAmount, mintTokens);
  })
  */

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
