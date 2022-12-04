// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  const admin = "0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9";
  const [deployer] = await ethers.getSigners();
  const underlying = "0x0b67B0A0Ed150B9F06e0ee90D2f1d3c4b3016D5D";
  const comptroller = "0x75eBe50E115bBe9F0399bab18Fe4719b7409c488";
  const interestRateModel = "0x7B7A0202E26f7Cf76aA8feB902157a35BEAa2C3B"; 
  const initialExchangeRate = "20000000000000000";
  const nameOfToken = "Lalalend EVMOS";
  const symbol = "nEVMOS";
  const decimals = 8;
  
  const NEVMOS = await ethers.getContractFactory("NEvmos");
  const nEvmos = await NEVMOS.deploy( 
    comptroller,
    interestRateModel,
    initialExchangeRate,
    nameOfToken, 
    symbol,
    decimals,
    admin
  );

  await nEvmos.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract NEVMOS at address:", nEvmos.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
