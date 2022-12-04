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
  const underlying = "0xe404783FFe345CE3262200Ca14eE97e656b70F20";

  // this is the unitroller contract to be precise
  const comptroller = "0x75eBe50E115bBe9F0399bab18Fe4719b7409c488";
  // whitepapermodel 
  const interestRateModel = "0x7B7A0202E26f7Cf76aA8feB902157a35BEAa2C3B"; 
  const initialExchangeRate = "200000000000000000000000000";
  const nameOfToken = "Nemo WETH";
  const symbol = "nWETH";
  const decimals = 8;
  const admin = "0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9";

  // contract of implementation NErc20Delegate
  const implementation = "0xC891276F7BDa3264e2D4D727CbC38493C5281070";
  const becomeImplementation = "0x00";

  const NWETH = await ethers.getContractFactory("NErc20Delegator");
  const nWeth = await NWETH.deploy(
    underlying, 
    comptroller,
    interestRateModel,
    initialExchangeRate,
    nameOfToken, 
    symbol,
    decimals,
    admin,
    implementation,
    becomeImplementation
  );

  await nWeth.deployed();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Deployed contract NWETH at address:", nWeth.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
