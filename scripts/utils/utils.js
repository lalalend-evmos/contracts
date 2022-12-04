const BigNum = require('bignumber.js');
const ethers = require('ethers');

function evmosMantissa(num, scale = 1e18) {
    if (num < 0)
      return ethers.BigNumber.from(new BigNum(2).pow(256).plus(num).toFixed());
    return ethers.BigNumber.from(new BigNum(num).times(scale).toFixed());
}


module.exports = {
    evmosMantissa
}
