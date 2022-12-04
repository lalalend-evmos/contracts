const {
    address,
    advanceBlocks,
    evmosUnsigned,
    evmosMantissa,
  } = require('../Utils/EVMOS');
  const {
    makeComptroller,
  } = require('../Utils/MIA');
  
  const RATE_PER_BLOCK = evmosMantissa(1).toFixed(0);
  const MIN_RELEASE_AMOUNT = evmosMantissa(100).toFixed(0);
  const START_BLOCK = 1;
  
  describe('releaseToVault', () => {
    let root, accounts;
    let comptroller, sebVault;
  
    async function checkBalance(account, balance) {
      expect(await call(comptroller.mia, 'balanceOf', [account])).toEqualNumber(balance);
    }
  
    async function checkBalanceOverZero(account) {
      expect(await call(comptroller.mia, 'balanceOf', [account])).toBeGreaterThan(0);
    }
  
    beforeEach(async () => {
      [root, ...accounts] = saddle.accounts;
      comptroller = await makeComptroller();
      sebVault = await deploy('SEBVault');
      await send(sebVault, 'setNemoInfo', [comptroller.mia._address, comptroller.seb._address]);
      // startBlock = 0, minRelease = 100
      await send(comptroller, '_setSEBVaultInfo', [sebVault._address, START_BLOCK, MIN_RELEASE_AMOUNT], {
        from: root,
      })
      // 1 mia per block
      await send(comptroller, '_setNemoSEBVaultRate', [RATE_PER_BLOCK], {
        from: root,
      })    
    });
  
    it('won\'t release before start block', async () => {
      await send(comptroller, 'harnessSetReleaseStartBlock', [1000]);
      await send(comptroller, 'releaseToVault');
      await checkBalance(sebVault._address, 0);
    });
  
    it('releaseAmount < minReleaseAmount', async () => {
      await send(comptroller, 'setBlockNumber', [1]);
      await send(comptroller, 'releaseToVault');
      await checkBalance(sebVault._address, 0);
    });
  
    it('miaBalance < minReleaseAmount', async () => {
      await send(comptroller, 'setBlockNumber', [10001]);
      
      // give comptroller 0.5 MIA
      // releaseAmount > minReleaseAmount && miaBalance < minReleaseAmount
      await send(comptroller.mia, 'transfer', [comptroller._address, evmosMantissa(0.5).toFixed(0)], {
        from: root,
      })
      await send(comptroller, 'releaseToVault');
      await checkBalance(sebVault._address, evmosMantissa(0));
    });
  
    it('miaBalance >= _releaseAmount', async () => {
      await send(comptroller, 'setBlockNumber', [8001]);
      // give comptroller 1000 MIA
      // miaBalance > minReleaseAmount && miaBalance < _releaseAmount
      await send(comptroller.mia, 'transfer', [comptroller._address, evmosMantissa(10000).toFixed(0)], {
        from: root,
      })
      await send(comptroller, 'releaseToVault');
      await checkBalance(sebVault._address, evmosMantissa(8000));
  
    });
  
    it('miaBalance < _releaseAmount', async () => {
      await send(comptroller, 'setBlockNumber', [8001]);
      // give comptroller 1000 MIA
      // miaBalance > minReleaseAmount && miaBalance < _releaseAmount
      await send(comptroller.mia, 'transfer', [comptroller._address, evmosMantissa(7000).toFixed(0)], {
        from: root,
      })
      await send(comptroller, 'releaseToVault');
      await checkBalance(sebVault._address, evmosMantissa(7000));
  
      // multiple release has no effect
      await send(comptroller, 'releaseToVault');
      await send(comptroller, 'releaseToVault');
      await send(comptroller, 'releaseToVault');
      await send(comptroller, 'releaseToVault');
      await checkBalance(sebVault._address, evmosMantissa(7000));
    });
  
  
  
  });