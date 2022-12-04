
const hre = require("hardhat");

const ethers =  hre.ethers;

async function main() {
    const [deployer] = await ethers.getSigners();
    const chainId = 9000; 
  
    const NMIA = await ethers.getContractFactory("NErc20Delegate");
    const nmia = await NMIA.attach("0xd9edE9aDe6090987fB3eBE4750877C66b32c002E");
    const MIA = await ethers.getContractFactory("MIA");
    const mia = await MIA.attach("0x8333AfA22De158606E74E9904f281D73e0023ED9");


    /*console.log("Redeeming");
    const res = await nmia.redeem("49999995000000500"); //ntokens values in e8 

    console.log(res);
    nmia.on("Redeem",(redeemer, remainedAmount, redeemTokens)=> {
        console.log(redeemer, remainedAmount,redeemTokens);
    })*/
    
    
    const totalSupply = await nmia.totalSupply();
    console.log("total supply of nmia token after withdrawal is "+ totalSupply);
    

    const balanceOfNMIA = await nmia.balanceOf(deployer.address);
    console.log("balance of NMIA for owner after withdrawal is "+ totalSupply);

    const totalCash = await nmia.getCash();
    console.log("total cash after withdrawal of mia inside nmia token market is : "+ totalCash); 
  
  
    const balance = await mia.balanceOf("0xE3678E00F1a669EBDCb146c66DbD43dBb2f4A1d9");
  
    console.log("balance of MIA token after withdrawal (should be 30M) : " + balance);
    
    
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
  