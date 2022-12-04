const {
    address,
    evmosUnsigned,
    minerStart,
    minerStop,
    unlockedAccount,
    mineBlock
  } = require('../Utils/EVMOS');
  
  const EIP712 = require('../Utils/EIP712');
  
  describe('EVMOSVault governance', () => {
    const name = 'EVMOSVault';
  
    let root, a1, a2, accounts, chainId;
    let mia, miaVault, miaStore;
  
    async function deployVault(root) {
      miaVault = await deploy('MIAVault', []);
      miaStore = await deploy('MIAStore', []);
      mia = await deploy('MIAScenario', [root]);
      await send(miaStore, 'setNewOwner', [miaVault._address], { from: root });
      await send(miaVault, 'setNemoStore', [mia._address, miaStore._address], { from: root });
      // address _rewardToken, uint256 _allocPoint, IBEP20 _token, uint256 _rewardPerBlock, uint256 _lockPeriod
      await send(miaVault, 'add', [mia._address, 100, mia._address, evmosUnsigned(1e16), 300], { from: root }); // lock period 300s
    }
  
    beforeEach(async () => {
      [root, a1, a2, ...accounts] = saddle.accounts;
      chainId = 1; // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515
      await deployVault(root);
    });
  
    describe('delegateBySig', () => {
      const Domain = (miaVault) => ({ name, chainId, verifyingContract: miaVault._address });
      const Types = {
        Delegation: [
          { name: 'delegatee', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };
  
      it('reverts if the signatory is invalid', async () => {
        const delegatee = root, nonce = 0, expiry = 0;
        await expect(
          send(miaVault, 'delegateBySig', [delegatee, nonce, expiry, 0, '0xbad', '0xbad'])
        ).rejects.toRevert("revert ECDSA: invalid signature 's' value");
      });
  
      it('reverts if the nonce is bad ', async () => {
        const delegatee = root, nonce = 1, expiry = 0;
        const { v, r, s } = EIP712.sign(
          Domain(miaVault), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey
        );
        await expect(
          send(miaVault, 'delegateBySig', [delegatee, nonce, expiry, v, r, s])
        ).rejects.toRevert("revert MIAVault::delegateBySig: invalid nonce");
      });
  
      it('reverts if the signature has expired', async () => {
        const delegatee = root, nonce = 0, expiry = 0;
        const { v, r, s } = EIP712.sign(
          Domain(miaVault), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey
        );
        await expect(
          send(miaVault, 'delegateBySig', [delegatee, nonce, expiry, v, r, s])
        ).rejects.toRevert("revert MIAVault::delegateBySig: signature expired");
      });
  
      it('delegates on behalf of the signatory', async () => {
        const delegatee = root, nonce = 0, expiry = 10e9;
        const { v, r, s } = EIP712.sign(
          Domain(miaVault), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey
        );
        expect(await call(miaVault, 'delegates', [a1])).toEqual(address(0));
        const tx = await send(miaVault, 'delegateBySig', [delegatee, nonce, expiry, v, r, s]);
        expect(tx.gasUsed < 80000);
        expect(await call(miaVault, 'delegates', [a1])).toEqual(root);
      });
    });
  });