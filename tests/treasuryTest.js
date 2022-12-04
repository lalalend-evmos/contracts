const {
    evmosMantissa,
    evmosUnsigned,
  } = require('./Utils/EVMOS');
  
  const BigNumber = require('bignumber.js');
  
  const {
    makeToken
  } = require('./Utils/Nemo');
  
  const transferAmount = evmosMantissa(1000);
  const evmosAmount = new BigNumber(1e17);
  const withdrawEVMOSAmount = new BigNumber(3e15);
  
  async function makeTreasury(opts = {}) {
    const {
      root = saddle.account,
      kind = 'nTreasury'
    } = opts || {};
  
    if (kind == 'nTreasury') {
      return await deploy('NTreasury', []);
    }
  }
  
  async function withdrawTreasuryERC20(nTreasury, tokenAddress, withdrawAmount, withdrawAddress, caller) {
    return send(nTreasury, 'withdrawTreasuryERC20', 
      [
        tokenAddress,
        withdrawAmount,
        withdrawAddress,      
      ], { from: caller });
  }
  
  async function withdrawTreasuryEVMOS(nTreasury, withdrawAmount, withdrawAddress, caller) {
    return send(nTreasury, 'withdrawTreasuryEVMOS', 
      [
        withdrawAmount,
        withdrawAddress,      
      ], { from: caller });
  }
  
  describe('NTreasury', function () {
    let root, minter, redeemer, accounts;
    let nTreasury
    let erc20Token;
  
    beforeEach(async () => {
      [root, minter, redeemer, ...accounts] = saddle.accounts;
      // Create New Erc20 Token
      erc20Token = await makeToken();
      // Create New nTreasury
      nTreasury = await makeTreasury();
      // Transfer ERC20 to nTreasury Contract for test
      await send(erc20Token, 'transfer', [nTreasury._address, transferAmount]);
      // Transfer EVMOS to nTreasury Contract for test
      await web3.eth.sendTransaction({ from: root, to: nTreasury._address, value: evmosAmount.toFixed()});
    });
  
    it ('Check EVMOS Balnce', async() => {
      expect(await web3.eth.getBalance(vTreasury._address)).toEqual(evmosAmount.toFixed());
    });
  
    it ('Check Owner', async() => {
      const treasuryOwner = await call(nTreasury, 'owner', []);
      expect(treasuryOwner).toEqual(root);
    });
  
    it ('Check Change Owner', async() => {
      await send(nTreasury, 'transferOwnership', [accounts[0]], { from: root });
      const newTreasuryOwner = await call(nTreasury, 'owner', []);
      expect(newTreasuryOwner).toEqual(accounts[0]);
    })
  
  
    it ('Check Wrong Owner', async() => {
      // Call withdrawTreausry with wrong owner
      await expect(withdrawTreasuryERC20(nTreasury, erc20Token._address, transferAmount, accounts[0], accounts[1]))
        .rejects
        .toRevert("revert Ownable: caller is not the owner");
    });
  
    it ('Check Withdraw Treasury ERC20 Token, Over Balance of Treasury', async() => {
      const overWithdrawAmount = evmosMantissa(1001);
      // Check Before erc20 Balance
      expect(evmosUnsigned(await call(erc20Token, 'balanceOf', [nTreasury._address]))).toEqual(transferAmount);
  
      // Call withdrawTreasury ERC2À
      await withdrawTreasuryERC20(
        nTreasury,
        erc20Token._address,
        overWithdrawAmount,
        accounts[0],
        root
      );
  
      // Check After Balance
      expect(await call(erc20Token, 'balanceOf', [nTreasury._address])).toEqual('0');
      // Check withdrawAddress Balance
      expect(evmosUnsigned(await call(erc20Token, 'balanceOf', [accounts[0]]))).toEqual(transferAmount);
    });
  
    it ('Check Withdraw Treasury ERC20 Token, less Balance of Treasury', async() => {
      const withdrawAmount = evmosMantissa(1);
      const leftAmouont = evmosMantissa(999);
      // Check Before ERC20 Balance
      expect(evmosUnsigned(await call(erc20Token, 'balanceOf', [nTreasury._address]))).toEqual(transferAmount);
  
      // Call withdrawTreasury ERC20
      await withdrawTreasuryERC20(
        nTreasury,
        erc20Token._address,
        withdrawAmount,
        accounts[0],
        root
      );
  
      // Check After Balance
      expect(evmosUnsigned(await call(erc20Token, 'balanceOf', [nTreasury._address]))).toEqual(leftAmouont);
      // Check withdrawAddress Balance
      expect(evmosUnsigned(await call(erc20Token, 'balanceOf', [accounts[0]]))).toEqual(withdrawAmount);
    });
  
    it ('Check Withdraw Treasury EVMOS, Over Balance of Treasury', async() => {
      const overWithdrawAmount = evmosAmount.plus(1).toFixed();
      // Get Original Balance of Withdraw Account
      const originalBalance = await web3.eth.getBalance(accounts[0]);
      // Get Expected New Balance of Withdraw Account
      const newBalance = evmosAmount.plus(originalBalance);
  
      // Call withdrawTreasury EVMOS
      await withdrawTreasuryEVMOS(
        nTreasury,
        overWithdrawAmount,
        accounts[0],
        root
      );
  
      // Check After Balance
      expect(await web3.eth.getBalance(nTreasury._address)).toEqual('0');
      // Check withdrawAddress Balance
      expect(await web3.eth.getBalance(accounts[0])).toEqual(newBalance.toFixed());
    });
  
    it ('Check Withdraw Treasury EVMOS, less Balance of Treasury', async() => {
      const withdrawAmount = withdrawEVMOSAmount.toFixed();
      const leftAmount = evmosAmount.minus(withdrawEVMOSAmount);
      // Get Original Balance of Withdraw Account
      const originalBalance = await web3.eth.getBalance(accounts[0]);
      // Get Expected New Balance of Withdraw Account
      const newBalance = withdrawEVMOSAmount.plus(originalBalance);
  
      // Call withdrawTreasury EVMOS
      await withdrawTreasuryEVMOS(
        nTreasury,
        withdrawAmount,
        accounts[0],
        root
      );
  
      // Check After Balance
      expect(await web3.eth.getBalance(nTreasury._address)).toEqual(leftAmount.toFixed());
      // Check withdrawAddress Balance
      expect(await web3.eth.getBalance(accounts[0])).toEqual(newBalance.toFixed());
    });
  });