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

    // carefulmath
  const CarefulMath = await ethers.getContractFactory("CarefulMath");
  const carefulMath = await CarefulMath.deploy();

  await carefulMath.deployed();

  console.log("Deployed contract carefulMath at address:", carefulMath.address);

  const ComptrollerErrorReporter = await ethers.getContractFactory("ComptrollerErrorReporter");
  const comptrollerErrorReporter = await ComptrollerErrorReporter.deploy();

  await comptrollerErrorReporter.deployed();

  console.log("Deployed contract ComptrollerErrorReporter at address:", comptrollerErrorReporter.address);


  const ExponentialNoError = await ethers.getContractFactory("ExponentialNoError");
  const exponentialNoError = await ExponentialNoError.deploy();

  await exponentialNoError.deployed();

  console.log("Deployed contract ExponentialNoError at address:", exponentialNoError.address);


  const Exponential = await ethers.getContractFactory("Exponential");
  const exponential = await Exponential.deploy();

  await exponential.deployed();

  console.log("Deployed contract Exponential at address:", exponential.address);


  const Context = await ethers.getContractFactory("Context");
  const context = await Context.deploy();

  await context.deployed();

  console.log("Deployed contract Context at address:", context.address);

  const Ownable = await ethers.getContractFactory("Ownable");
  const ownable = await Ownable.deploy();

  await ownable.deployed();

  console.log("Deployed contract Ownable at address:", ownable.address);

  const SafeMath = await ethers.getContractFactory("SafeMath");
  const safeMath = await SafeMath.deploy();

  await safeMath.deployed();

  console.log("Deployed contract SafeMath at address:", safeMath.address);

  const Address = await ethers.getContractFactory("Address");
  const address = await Address.deploy();

  await address.deployed();

  console.log("Deployed contract Address at address:", address.address);


  const ECDSA = await ethers.getContractFactory("ECDSA");
  const ecdsa = await ECDSA.deploy();

  await ecdsa.deployed();

  console.log("Deployed contract ECDSA at address:", ecdsa.address);


  const ReentrancyGuard = await ethers.getContractFactory("ReentrancyGuard");
  const reentrancyGuard = await ReentrancyGuard.deploy();

  await reentrancyGuard.deployed();

  console.log("Deployed contract ReentrancyGuard at address:", reentrancyGuard.address);


  const Owned = await ethers.getContractFactory("Owned");
  const owned = await Owned.deploy();

  await owned.deployed();

  console.log("Deployed contract Owned at address:", owned.address);


  const TokenLock = await ethers.getContractFactory("TokenLock");
  const tokenLock = await TokenLock.deploy();

  await tokenLock.deployed();

  console.log("Deployed contract TokenLock at address:", tokenLock.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
