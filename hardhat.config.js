require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-chai-matchers");



/** @type import('hardhat/config').HardhatUserConfig */
require('dotenv').config({path:__dirname+'/.env'})

const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version : "0.5.16",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true
    },
    evmostestnet: {
      url: `https://eth.bd.evmos.dev:8545`,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 9000
    },
    goerli: {
      url: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 5
    }
  },
};
