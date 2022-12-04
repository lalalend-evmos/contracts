
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
    // TIMELOCK
    const Timelock = await ethers.getContractFactory("Timelock");
    const timelock = await Timelock.attach("0x8A9a884D712fbBA3D0E0b31C5F4774f05eF239Cb");

    //const blockNumber = await ethers.provider.getBlockNumber();
    //const {timestamp} = await ethers.provider.getBlock(blockNumber);
    //const timestampUpdated = timestamp + 24*2*3600;
    //await timelock.queueTransaction("0x8A9a884D712fbBA3D0E0b31C5F4774f05eF239Cb", 0, "setPendingAdmin(address)", "0xD3f9721AA021590878F8920A0AC8f28CAF3990aE",timestampUpdated);
    await timelock.executeTransaction("0x8A9a884D712fbBA3D0E0b31C5F4774f05eF239Cb", 0, "setPendingAdmin(address)", "0xD3f9721AA021590878F8920A0AC8f28CAF3990aE",1661554048);
 
    
    timelock.on("ExecuteTransaction", (txHash, target, value, signature, data, eta) => {
        console.log(txHash, target, value, signature, data, eta);
    });

    //await timelock.executeTransaction("0x8A9a884D712fbBA3D0E0b31C5F4774f05eF239Cb", 0, "setPendingAdmin(address)", "0xD3f9721AA021590878F8920A0AC8f28CAF3990aE",1661554048);

  //GOVERNOR ALPHA
  /*const GovernorAlpha = await ethers.getContractFactory("contracts/Governance/GovernorAlpha.sol:GovernorAlpha");
  const governorAlpha = await GovernorAlpha.attach("0xD3f9721AA021590878F8920A0AC8f28CAF3990aE");

  const blockNumber = await ethers.provider.getBlockNumber();
  const {timestamp} = await ethers.provider.getBlock(blockNumber);
  const timestampUpdated = timestamp + 24*2*3600;

  await governorAlpha.__queueSetTimelockPendingAdmin("0x1A27C97B84Ba2616CF8ff48df45A3f1e44a943f4",timestampUpdated);

  // TODO IN 2 DAYS 
  //  governorAlpha.__executeSetTimelockPendingAdmin("0x1A27C97B84Ba2616CF8ff48df45A3f1e44a943f4",getBlockTimestamp().add(2));



  let newAdmin = await timelock.admin();

  console.log("oldAdmin is "+ oldAdmin);

  console.log("newAdmin is "+ newAdmin);
  */
  let newAdmin = await timelock.admin();
  let pendingAdmin = await timelock.pendingAdmin();
  console.log("pendingAdmin is "+ pendingAdmin);

  console.log("newAdmin is "+ newAdmin);


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
