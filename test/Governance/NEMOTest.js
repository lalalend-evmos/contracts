const {
    address,
    minerStart,
    minerStop,
    unlockedAccount,
    mineBlock
} = require('../utils/EVMOS');
  
const EIP712 = require('../utils/EIP712');
const { ethers } = require('hardhat');
const { expect } = require("chai");

  
  describe('MIA', () => {
    const name = 'Mia';
    const symbol = 'MIA';
  
    let owner, a1, a2, accounts, chainId;
    let mia, MIA;
  
    beforeEach(async () => {
      [owner, a1, a2, ...accounts] = await ethers.getSigners();
      chainId = 9000;
      MIA = await ethers.getContractFactory("MIA");
      mia = await MIA.deploy(owner.address);
    });
  
    describe('metadata', () => {
      it('has given name', async () => {
        expect(await mia.name()).to.equal(name);
      });
  
      it('has given symbol', async () => {
        expect(await mia.symbol()).to.equal(symbol);
      });
    });
  
    describe('balanceOf', () => {
      it('grants to initial account', async () => {
        expect(await mia.balanceOf(owner.address)).to.equal("30000000000000000000000000");
      });
    });
    
    /*
    describe('delegateBySig', () => {
      const Domain = (mia) => ({ name, chainId, verifyingContract: mia.address });
      const Types = {
        Delegation: [
          { name: 'delegatee', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };
  
      it('reverts if the signatory is invalid', async () => {
        const delegatee = owner.address, nonce = 0, expiry = 0;
        await expect(mia.delegateBySig(delegatee, nonce, expiry, 0, '0x62616473000000000000000000000000000000000000000000000000000000', '0x62616473000000000000000000000000000000000000000000000000000000'))
        .to.be.revertedWith("revert mia::delegateBySig: invalid signature");
      });
  
      it('reverts if the nonce is bad ', async () => {
        const delegatee = owner.address, nonce = 1, expiry = 0;
        const { v, r, s } = EIP712.sign(Domain(mia), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey);
        await expect(mia.delegateBySig(delegatee, nonce, expiry, v, r, s)).to.be.revertedWith("revert mia::delegateBySig: invalid nonce");
      });
  
      it('reverts if the signature has expired', async () => {
        const delegatee = owner.address, nonce = 0, expiry = 0;
        const { v, r, s } = EIP712.sign(Domain(mia), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey);
        await expect(mia.delegateBySig(delegatee, nonce, expiry, v, r, s)).to.be.revertedWith("revert mia::delegateBySig: signature expired");
      });
  
      it('delegates on behalf of the signatory', async () => {
        const delegatee = owner.address, nonce = 0, expiry = 10e9;
        const { v, r, s } = EIP712.sign(Domain(mia), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey);
        expect(await mia.delegates(a1)).to.equal(address(0));
        const tx = await mia.delegateBySig(delegatee, nonce, expiry, v, r, s);
        expect(tx.gasUsed < 80000);
        expect(await mia.delegates(a1)).to.equal(owner.address);
      });
    });
  
    describe.only('numCheckpoints', () => {
      it('returns the number of checkpoints for a delegate', async () => {
        let guy = accounts[0];
        await mia.transfer(guy, '100'); //give an account a few tokens for readability
        //expect(await mia.numCheckpoints(a1.address)).to.equal('0');
  
        const t1 = await mia.connect(guy).delegate(a1.address);
        expect(await mia.numCheckpoints(a1.address)).to.equal('1');
  
        const t2 = await mia.connect(guy).transfer(a2.address, 10);
         expect(await mia.numCheckpoints(a1.address)).to.equal('2');
  
        const t3 = await mia.connect(guy).transfer(a2.address, 10);
         expect(await mia.numCheckpoints(a1.address)).to.equal('3');
  
        const t4 = await mia.connect(owner.address).transfer(guy.address, 20);
         expect(await mia.numCheckpoints(a1.address)).to.equal('4');
  
         expect(await mia.checkpoints(a1.address, 0)).to.equal(expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '100' }));
         expect(await mia.checkpoints(a1.address, 1)).to.equal(expect.objectContaining({ fromBlock: t2.blockNumber.toString(), votes: '90' }));
         expect(await mia.checkpoints(a1.address, 2)).to.equal(expect.objectContaining({ fromBlock: t3.blockNumber.toString(), votes: '80' }));
         expect(await mia.checkpoints(a1.address, 3)).to.equal(expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '100' }));
      });
  
      it('does not add more than one checkpoint in a block', async () => {
        let guy = accounts[0].address;
  
        await mia.transfer(guy, '100'); //give an account a few tokens for readability
        //expect(await mia.numCheckpoints(a1.address)).to.equal('0');
        await minerStop();
  
        let t1 = mia.delegate(a1.address, { from: guy });
        let t2 = mia.transfer(a2.address, 10, { from: guy });
        let t3 = mia.transfer(a2.address, 10, { from: guy });
  
        await minerStart();
        t1 = await t1;
        t2 = await t2;
        t3 = await t3;
  
         expect(await mia.numCheckpoints(a1.address)).to.equal('1');
  
         expect(await mia.checkpoints(a1.address, 0)).to.equal(expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '80' }));
         expect(await mia.checkpoints(a1.address, 1)).to.equal(expect.objectContaining({ fromBlock: '0', votes: '0' }));
         expect(await mia.checkpoints(a1.address, 2)).to.equal(expect.objectContaining({ fromBlock: '0', votes: '0' }));
  
        const t4 = await mia.transfer(guy, 20, { from: owner.address });
         expect(await mia.numCheckpoints(a1.address)).to.equal('2');
         expect(await mia.checkpoints(a1.address, 1)).to.equal(expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '100' }));
      });
    });*/
  
    describe('getPriorVotes', () => {
      it('reverts if block number >= current block', async () => {
        await expect(await mia.getPriorVotes(a1.address, 5e10)).to.be.revertedWith("revert mia::getPriorVotes: not yet determined");
      });
  
      it('returns 0 if there are no checkpoints', async () => {
        expect(await mia.getPriorVotes(a1.address, 0)).to.equal('0');
      });
  
      it('returns the latest block if >= last checkpoint block', async () => {
        const t1 = await mia.connect(owner).delegate(a1.address);
        await mineBlock();
        await mineBlock();
  
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber)).to.equal('30000000000000000000000000');
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber + 1)).to.equal('30000000000000000000000000');
      });
  
      it('returns zero if < first checkpoint block', async () => {
        await mineBlock();
        const t1 = await mia.connect(owner).delegate(a1.address);
        await mineBlock();
        await mineBlock();
  
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber - 1)).to.equal('0');
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber + 1)).to.equal('30000000000000000000000000');
      });
  
      it('generally returns the voting balance at the appropriate checkpoint', async () => {
        const t1 = await mia.connect(owner).delegate(a1.address);
        await mineBlock();
        await mineBlock();
        const t2 = await mia.connect(owner).transfer(a2.address, 10);
        await mineBlock();
        await mineBlock();
        const t3 = await mia.connect(owner).transfer(a2.address, 10);
        await mineBlock();
        await mineBlock();
        const t4 = await mia.connect(a2).transfer(owner.address, 20);
        await mineBlock();
        await mineBlock();
  
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber - 1)).to.equal('0');
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber)).to.equal('30000000000000000000000000');
        expect(await mia.getPriorVotes(a1.address, t1.blockNumber + 1)).to.equal('30000000000000000000000000');
        expect(await mia.getPriorVotes(a1.address, t2.blockNumber)).to.equal('29999999999999999999999990');
        expect(await mia.getPriorVotes(a1.address, t2.blockNumber + 1)).to.equal('29999999999999999999999990');
        expect(await mia.getPriorVotes(a1.address, t3.blockNumber)).to.equal('29999999999999999999999980');
        expect(await mia.getPriorVotes(a1.address, t3.blockNumber + 1)).to.equal('29999999999999999999999980');
        expect(await mia.getPriorVotes(a1.address, t4.blockNumber)).to.equal('30000000000000000000000000');
        expect(await mia.getPriorVotes(a1.address, t4.blockNumber + 1)).to.equal('30000000000000000000000000');
      });
    });
  });