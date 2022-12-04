const {
    makeComptroller,
    makeNToken,
    balanceOf,
    fastForward,
    pretendBorrow,
    quickMint,
    enterMarkets,
    makeToken,
    setMarketSupplyCap
  } = require('../Utils/Nemo');
  const {
    evmosExp,
    evmosDouble,
    evmosUnsigned,
    evmosMantissa
  } = require('../Utils/EVMOS');
  
  const miaRate = evmosUnsigned(1e18);
  
  async function miaAccrued(comptroller, user) {
    return evmosUnsigned(await call(comptroller, 'miaAccrued', [user]));
  }
  
  async function miaBalance(comptroller, user) {
    return evmosUnsigned(await call(comptroller.mia, 'balanceOf', [user]))
  }
  
  async function totalmiaAccrued(comptroller, user) {
    return (await miaAccrued(comptroller, user)).add(await miaBalance(comptroller, user));
  }
  
  describe('Flywheel', () => {
    let root, a1, a2, a3, accounts;
    let comptroller, nLOW, nREP, nZRX,nEVIL;
    beforeEach(async () => {
      let interestRateModelOpts = {borrowRate: 0.000001};
      [root, a1, a2, a3, ...accounts] = saddle.accounts;
      comptroller = await makeComptroller();
      nLOW = await makeNToken({comptroller, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
      await setMarketSupplyCap(nLOW.comptroller, [nLOW._address], [1e15]);
      nREP = await makeNToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      await setMarketSupplyCap(nREP.comptroller, [nREP._address], [1e15]);
      nZRX = await makeNToken({comptroller, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
      await setMarketSupplyCap(nZRX.comptroller, [nZRX._address], [1e15]);
      nEVIL = await makeNToken({comptroller, supportMarket: false, underlyingPrice: 3, interestRateModelOpts});
      await setMarketSupplyCap(nEVIL.comptroller, [nEVIL._address], [1e15]);
    });
  
    describe('_grantMIA()', () => {
      beforeEach(async () => {
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
      });
  
      it('should award mia if called by admin', async () => {
        const tx = await send(comptroller, '_grantMIA', [a1, 100]);
        expect(tx).toHaveLog('NemoGranted', {
          recipient: a1,
          amount: 100
        });
      });
  
      it('should revert if not called by admin', async () => {
        await expect(
          send(comptroller, '_grantMIA', [a1, 100], {from: a1})
        ).rejects.toRevert('revert access denied');
      });
  
      it('should revert if insufficient mia', async () => {
        await expect(
          send(comptroller, '_grantMIA', [a1, evmosUnsigned(1e20)])
        ).rejects.toRevert('revert insufficient mia for grant');
      });
    });
  
    describe('getNemoMarkets()', () => {
      it('should return the mia markets', async () => {
        for (let mkt of [nREP, nZRX]) {
          await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        }
        expect(await call(comptroller, 'getNemoMarkets')).toEqual(
          [nLOW, nREP, nZRX].map((c) => c._address)
        );
      });
    });
  
    describe('_setNemoSpeed()', () => {
      it('should update market index when calling setNemoSpeed', async () => {
        const mkt = nREP;
        await send(comptroller, 'setBlockNumber', [0]);
        await send(mkt, 'harnessSetTotalSupply', [evmosUnsigned(10e18)]);
  
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        await fastForward(comptroller, 20);
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(1)]);
  
        const {index, block} = await call(comptroller, 'miaSupplyState', [mkt._address]);
        expect(index).toEqualNumber(2e36);
        expect(block).toEqualNumber(20);
      });
  
      it('should correctly drop a mia market if called by admin', async () => {
        for (let mkt of [nLOW, nREP, nZRX]) {
          await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        }
        const tx = await send(comptroller, '_setNemoSpeed', [nLOW._address, 0]);
        expect(await call(comptroller, 'getNemoMarkets')).toEqual(
          [nREP, nZRX].map((c) => c._address)
        );
        expect(tx).toHaveLog('NemoSpeedUpdated', {
          nToken: nLOW._address,
          newSpeed: 0
        });
      });
  
      it('should correctly drop a mia market from middle of array', async () => {
        for (let mkt of [nLOW, nREP, nZRX]) {
          await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        }
        await send(comptroller, '_setNemoSpeed', [nREP._address, 0]);
        expect(await call(comptroller, 'getNemoMarkets')).toEqual(
          [nLOW, nZRX].map((c) => c._address)
        );
      });
  
      it('should not drop a mia market unless called by admin', async () => {
        for (let mkt of [nLOW, nREP, nZRX]) {
          await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        }
        await expect(
          send(comptroller, '_setNemoSpeed', [nLOW._address, 0], {from: a1})
        ).rejects.toRevert('revert access denied');
      });
  
      it('should not add non-listed markets', async () => {
        const nBAT = await makeNToken({ comptroller, supportMarket: false });
        await expect(
          send(comptroller, 'harnessAddNemoMarkets', [[nBAT._address]])
        ).rejects.toRevert('revert market not listed');
  
        const markets = await call(comptroller, 'getNemoMarkets');
        expect(markets).toEqual([]);
      });
    });
  
    describe('updateNemoBorrowIndex()', () => {
      it('should calculate mia borrower index correctly', async () => {
        const mkt = nREP;
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        await send(comptroller, 'setBlockNumber', [100]);
        await send(mkt, 'harnessSetTotalBorrows', [evmosUnsigned(11e18)]);
        await send(comptroller, 'harnessUpdateNemoBorrowIndex', [
          mkt._address,
          evmosExp(1.1),
        ]);
        /*
          100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed
  
          borrowAmt   = totalBorrows * 1e18 / borrowIdx
                      = 11e18 * 1e18 / 1.1e18 = 10e18
          miaAccrued = deltaBlocks * borrowSpeed
                      = 100 * 0.5e18 = 50e18
          newIndex   += 1e36 + miaAccrued * 1e36 / borrowAmt
                      = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
        */
  
        const {index, block} = await call(comptroller, 'miaBorrowState', [mkt._address]);
        expect(index).toEqualNumber(6e36);
        expect(block).toEqualNumber(100);
      });
  
      it('should not revert or update miaBorrowState index if nToken not in Nemo markets', async () => {
        const mkt = await makeNToken({
          comptroller: comptroller,
          supportMarket: true,
          addmiaMarket: false,
        });
        await send(comptroller, 'setBlockNumber', [100]);
        await send(comptroller, 'harnessUpdateNemoBorrowIndex', [
          mkt._address,
          evmosExp(1.1),
        ]);
  
        const {index, block} = await call(comptroller, 'miaBorrowState', [mkt._address]);
        expect(index).toEqualNumber(0);
        expect(block).toEqualNumber(100);
        const speed = await call(comptroller, 'miaSpeeds', [mkt._address]);
        expect(speed).toEqualNumber(0);
      });
  
      it('should not update index if no blocks passed since last accrual', async () => {
        const mkt = nREP;
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        await send(comptroller, 'harnessUpdatemiaBorrowIndex', [
          mkt._address,
          evmosExp(1.1),
        ]);
  
        const {index, block} = await call(comptroller, 'miaBorrowState', [mkt._address]);
        expect(index).toEqualNumber(1e36);
        expect(block).toEqualNumber(0);
      });
  
      it('should not update index if mia speed is 0', async () => {
        const mkt = nREP;
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        await send(comptroller, 'setBlockNumber', [100]);
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0)]);
        await send(comptroller, 'harnessUpdateNemoBorrowIndex', [
          mkt._address,
          evmosExp(1.1),
        ]);
  
        const {index, block} = await call(comptroller, 'miaBorrowState', [mkt._address]);
        expect(index).toEqualNumber(1e36);
        expect(block).toEqualNumber(100);
      });
    });
  
    describe('updateNemoSupplyIndex()', () => {
      it('should calculate mia supplier index correctly', async () => {
        const mkt = nREP;
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        await send(comptroller, 'setBlockNumber', [100]);
        await send(mkt, 'harnessSetTotalSupply', [evmosUnsigned(10e18)]);
        await send(comptroller, 'harnessUpdateNemoSupplyIndex', [mkt._address]);
        /*
          suppyTokens = 10e18
          miaAccrued = deltaBlocks * supplySpeed
                      = 100 * 0.5e18 = 50e18
          newIndex   += miaAccrued * 1e36 / supplyTokens
                      = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
        */
        const {index, block} = await call(comptroller, 'miaSupplyState', [mkt._address]);
        expect(index).toEqualNumber(6e36);
        expect(block).toEqualNumber(100);
      });
  
      it('should not update index on non-Nemo markets', async () => {
        const mkt = await makeNToken({
          comptroller: comptroller,
          supportMarket: true,
          addmiaMarket: false
        });
        await send(comptroller, 'setBlockNumber', [100]);
        await send(comptroller, 'harnessUpdateNemoSupplyIndex', [
          mkt._address
        ]);
  
        const {index, block} = await call(comptroller, 'miaSupplyState', [mkt._address]);
        expect(index).toEqualNumber(0);
        expect(block).toEqualNumber(100);
        const speed = await call(comptroller, 'miaSpeeds', [mkt._address]);
        expect(speed).toEqualNumber(0);
        // nToken could have no mia speed or mia supplier state if not in mia markets
        // this logic could also possibly be implemented in the allowed hook
      });
  
      it('should not update index if no blocks passed since last accrual', async () => {
        const mkt = nREP;
        await send(comptroller, 'setBlockNumber', [0]);
        await send(mkt, 'harnessSetTotalSupply', [evmosUnsigned(10e18)]);
        await send(comptroller, '_setNemoSpeed', [mkt._address, evmosExp(0.5)]);
        await send(comptroller, 'harnessUpdateNemoSupplyIndex', [mkt._address]);
  
        const {index, block} = await call(comptroller, 'miaSupplyState', [mkt._address]);
        expect(index).toEqualNumber(1e36);
        expect(block).toEqualNumber(0);
      });
  
      it('should not matter if the index is updated multiple times', async () => {
        const miaRemaining = miaRate.mul(100)
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address]]);
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        await pretendBorrow(nLOW, a1, 1, 1, 100);
        await send(comptroller, 'harnessRefreshmiaSpeeds');
        await quickMint(nLOW, a2, evmosUnsigned(1e12));
        await quickMint(nLOW, a3, evmosUnsigned(15e12));
  
        const a2Accrued0 = await totalNemoAccrued(comptroller, a2);
        const a3Accrued0 = await totalNemoAccrued(comptroller, a3);
        const a2Balance0 = await balanceOf(nLOW, a2);
        const a3Balance0 = await balanceOf(nLOW, a3);
  
        await fastForward(comptroller, 20);
  
        const txT1 = await send(nLOW, 'transfer', [a2, a3Balance0.sub(a2Balance0)], {from: a3});
  
        const a2Accrued1 = await totalNemoAccrued(comptroller, a2);
        const a3Accrued1 = await totalNemoAccrued(comptroller, a3);
        const a2Balance1 = await balanceOf(nLOW, a2);
        const a3Balance1 = await balanceOf(nLOW, a3);
  
        await fastForward(comptroller, 10);
        await send(comptroller, 'harnessUpdateNemoSupplyIndex', [nLOW._address]);
        await fastForward(comptroller, 10);
  
        const txT2 = await send(nLOW, 'transfer', [a3, a2Balance1.sub(a3Balance1)], {from: a2});
  
        const a2Accrued2 = await totalNemoAccrued(comptroller, a2);
        const a3Accrued2 = await totalNemoAccrued(comptroller, a3);
  
        expect(a2Accrued0).toEqualNumber(0);
        expect(a3Accrued0).toEqualNumber(0);
        expect(a2Accrued1).not.toEqualNumber(0);
        expect(a3Accrued1).not.toEqualNumber(0);
        expect(a2Accrued1).toEqualNumber(a3Accrued2.sub(a3Accrued1));
        expect(a3Accrued1).toEqualNumber(a2Accrued2.sub(a2Accrued1));
  
        expect(txT1.gasUsed).toBeLessThan(220000);
        expect(txT1.gasUsed).toBeGreaterThan(150000);
        expect(txT2.gasUsed).toBeLessThan(150000);
        expect(txT2.gasUsed).toBeGreaterThan(100000);
      });
    });
  
    describe('distributeBorrowerNemo()', () => {
  
      it('should update borrow index checkpoint but not miaAccrued for first time user', async () => {
        const mkt = nREP;
        await send(comptroller, "setNemoBorrowState", [mkt._address, evmosDouble(6), 10]);
        await send(comptroller, "setNemoBorrowerIndex", [mkt._address, root, evmosUnsigned(0)]);
  
        await send(comptroller, "harnessDistributeBorrowerNemo", [mkt._address, root, evmosExp(1.1)]);
        expect(await call(comptroller, "miaAccrued", [root])).toEqualNumber(0);
        expect(await call(comptroller, "miaBorrowerIndex", [ mkt._address, root])).toEqualNumber(6e36);
      });
  
      it('should transfer mia and update borrow index checkpoint correctly for repeat time user', async () => {
        const mkt = nREP;
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
        await send(mkt, "harnessSetAccountBorrows", [a1, evmosUnsigned(5.5e18), evmosExp(1)]);
        await send(comptroller, "setNemoBorrowState", [mkt._address, evmosDouble(6), 10]);
        await send(comptroller, "setNemoBorrowerIndex", [mkt._address, a1, evmosDouble(1)]);
  
        /*
        * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 miaBorrowIndex
        * this tests that an acct with half the total borrows over that time gets 25e18 mia
          borrowerAmount = borrowBalance * 1e18 / borrow idx
                         = 5.5e18 * 1e18 / 1.1e18 = 5e18
          deltaIndex     = marketStoredIndex - userStoredIndex
                         = 6e36 - 1e36 = 5e36
          borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                         = 5e18 * 5e36 / 1e36 = 25e18
        */
        const tx = await send(comptroller, "harnessDistributeBorrowerNemo", [mkt._address, a1, evmosUnsigned(1.1e18)]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(25e18);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(0);
        expect(tx).toHaveLog('DistributedBorrowerNemo', {
          nToken: mkt._address,
          borrower: a1,
          miaDelta: evmosUnsigned(25e18).toFixed(),
          miaBorrowIndex: evmosDouble(6).toFixed()
        });
      });
  
      it('should not transfer mia automatically', async () => {
        const mkt = nREP;
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
        await send(mkt, "harnessSetAccountBorrows", [a1, evmosUnsigned(5.5e17), evmosExp(1)]);
        await send(comptroller, "setNemoBorrowState", [mkt._address, evmosDouble(1.0019), 10]);
        await send(comptroller, "setNemoBorrowerIndex", [mkt._address, a1, evmosDouble(1)]);
        /*
          borrowerAmount = borrowBalance * 1e18 / borrow idx
                         = 5.5e17 * 1e18 / 1.1e18 = 5e17
          deltaIndex     = marketStoredIndex - userStoredIndex
                         = 1.0019e36 - 1e36 = 0.0019e36
          borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                         = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
          0.00095e18 < miaClaimThreshold of 0.001e18
        */
        await send(comptroller, "harnessDistributeBorrowerNemo", [mkt._address, a1, evmosExp(1.1)]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(0);
      });
  
      it('should not revert or distribute when called with non-Nemo market', async () => {
        const mkt = await makeNToken({
          comptroller: comptroller,
          supportMarket: true,
          addmiaMarket: false,
        });
  
        await send(comptroller, "harnessDistributeBorrowerNemo", [mkt._address, a1, evmosExp(1.1)]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(0);
        expect(await call(comptroller, 'miaBorrowerIndex', [mkt._address, a1])).toEqualNumber(0);
      });
    });
  
    describe('distributeSupplierNemo()', () => {
      it('should transfer mia and update supply index correctly for first time user', async () => {
        const mkt = nREP;
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
  
        await send(mkt, "harnessSetBalance", [a1, evmosUnsigned(5e18)]);
        await send(comptroller, "setNemoSupplyState", [mkt._address, evmosDouble(6), 10]);
        /*
        * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 miaSupplyIndex
        * confirming an acct with half the total supply over that time gets 25e18 MIA:
          supplierAmount  = 5e18
          deltaIndex      = marketStoredIndex - userStoredIndex
                          = 6e36 - 1e36 = 5e36
          suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                          = 5e18 * 5e36 / 1e36 = 25e18
        */
  
        const tx = await send(comptroller, "harnessDistributeAllSupplierNemo", [mkt._address, a1]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(25e18);
        expect(tx).toHaveLog('DistributedSupplierNemo', {
          nToken: mkt._address,
          supplier: a1,
          miaDelta: evmosUnsigned(25e18).toFixed(),
          miaSupplyIndex: evmosDouble(6).toFixed()
        });
      });
  
      it('should update mia accrued and supply index for repeat user', async () => {
        const mkt = nREP;
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
  
        await send(mkt, "harnessSetBalance", [a1, evmosUnsigned(5e18)]);
        await send(comptroller, "setNemoSupplyState", [mkt._address, evmosDouble(6), 10]);
        await send(comptroller, "setNemoSupplierIndex", [mkt._address, a1, evmosDouble(2)])
        /*
          supplierAmount  = 5e18
          deltaIndex      = marketStoredIndex - userStoredIndex
                          = 6e36 - 2e36 = 4e36
          suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                          = 5e18 * 4e36 / 1e36 = 20e18
        */
  
       await send(comptroller, "harnessDistributeAllSupplierNemo", [mkt._address, a1]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(20e18);
      });
  
      it('should not transfer when miaAccrued below threshold', async () => {
        const mkt = nREP;
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
  
        await send(mkt, "harnessSetBalance", [a1, evmosUnsigned(5e17)]);
        await send(comptroller, "setNemoSupplyState", [mkt._address, evmosDouble(1.0019), 10]);
        /*
          supplierAmount  = 5e17
          deltaIndex      = marketStoredIndex - userStoredIndex
                          = 1.0019e36 - 1e36 = 0.0019e36
          suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                          = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
        */
  
        await send(comptroller, "harnessDistributeSupplierNemo", [mkt._address, a1]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(0);
      });
  
      it('should not revert or distribute when called with non-Nemo market', async () => {
        const mkt = await makeNToken({
          comptroller: comptroller,
          supportMarket: true,
          addmiaMarket: false,
        });
  
        await send(comptroller, "harnessDistributeSupplierNemo", [mkt._address, a1]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(0);
        expect(await call(comptroller, 'miaBorrowerIndex', [mkt._address, a1])).toEqualNumber(0);
      });
  
    });
  
    describe('transferMIA', () => {
      it('should transfer mia accrued when amount is above threshold', async () => {
        const miaRemaining = 1000, a1AccruedPre = 100, threshold = 1;
        const miaBalancePre = await miaBalance(comptroller, a1);
        const tx0 = await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        const tx1 = await send(comptroller, 'setNemoAccrued', [a1, a1AccruedPre]);
        const tx2 = await send(comptroller, 'harnessTransferNemo', [a1, a1AccruedPre, threshold]);
        const a1AccruedPost = await miaAccrued(comptroller, a1);
        const miaBalancePost = await miaBalance(comptroller, a1);
        expect(miaBalancePre).toEqualNumber(0);
        expect(miaBalancePost).toEqualNumber(a1AccruedPre);
      });
  
      it('should not transfer when mia accrued is below threshold', async () => {
        const miaRemaining = 1000, a1AccruedPre = 100, threshold = 101;
        const miaBalancePre = await call(comptroller.mia, 'balanceOf', [a1]);
        const tx0 = await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        const tx1 = await send(comptroller, 'setNemoAccrued', [a1, a1AccruedPre]);
        const tx2 = await send(comptroller, 'harnessTransferNemo', [a1, a1AccruedPre, threshold]);
        const a1AccruedPost = await miaAccrued(comptroller, a1);
        const miaBalancePost = await miaBalance(comptroller, a1);
        expect(miaBalancePre).toEqualNumber(0);
        expect(miaBalancePost).toEqualNumber(0);
      });
  
      it('should not transfer mia if mia accrued is greater than mia remaining', async () => {
        const miaRemaining = 99, a1AccruedPre = 100, threshold = 1;
        const miaBalancePre = await miaBalance(comptroller, a1);
        const tx0 = await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        const tx1 = await send(comptroller, 'setNemoAccrued', [a1, a1AccruedPre]);
        const tx2 = await send(comptroller, 'harnessTransferNemo', [a1, a1AccruedPre, threshold]);
        const a1AccruedPost = await miaAccrued(comptroller, a1);
        const miaBalancePost = await miaBalance(comptroller, a1);
        expect(miaBalancePre).toEqualNumber(0);
        expect(miaBalancePost).toEqualNumber(0);
      });
    });
  
    describe('claimNemo', () => {
      it('should accrue mia and then transfer mia accrued', async () => {
        const miaRemaining = miaRate.mul(100), mintAmount = evmosUnsigned(12e12), deltaBlocks = 10;
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        await pretendBorrow(nLOW, a1, 1, 1, 100);
        await send(comptroller, '_setNemoSpeed', [nLOW._address, evmosExp(0.5)]);
        await send(comptroller, 'harnessRefreshNemoSpeeds');
        const speed = await call(comptroller, 'miaSpeeds', [nLOW._address]);
        const a2AccruedPre = await miaAccrued(comptroller, a2);
        const miaBalancePre = await miaBalance(comptroller, a2);
        await quickMint(nLOW, a2, mintAmount);
        await fastForward(comptroller, deltaBlocks);
        const tx = await send(comptroller, 'claimNemo', [a2]);
        const a2AccruedPost = await miaAccrued(comptroller, a2);
        const miaBalancePost = await miaBalance(comptroller, a2);
        expect(tx.gasUsed).toBeLessThan(400000);
        expect(speed).toEqualNumber(miaRate);
        expect(a2AccruedPre).toEqualNumber(0);
        expect(a2AccruedPost).toEqualNumber(0);
        expect(miaBalancePre).toEqualNumber(0);
        expect(miaBalancePost).toEqualNumber(miaRate.mul(deltaBlocks).sub(1)); // index is 8333...
      });
  
      it('should accrue mia and then transfer mia accrued in a single market', async () => {
        const miaRemaining = miaRate.mul(100), mintAmount = evmosUnsigned(12e12), deltaBlocks = 10;
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        await pretendBorrow(nLOW, a1, 1, 1, 100);
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address]]);
        await send(comptroller, 'harnessRefreshNemoSpeeds');
        const speed = await call(comptroller, 'miaSpeeds', [nLOW._address]);
        const a2AccruedPre = await miaAccrued(comptroller, a2);
        const miaBalancePre = await miaBalance(comptroller, a2);
        await quickMint(nLOW, a2, mintAmount);
        await fastForward(comptroller, deltaBlocks);
        const tx = await send(comptroller, 'claimNemo', [a2, [nLOW._address]]);
        const a2AccruedPost = await miaAccrued(comptroller, a2);
        const miaBalancePost = await miaBalance(comptroller, a2);
        expect(tx.gasUsed).toBeLessThan(220000);
        expect(speed).toEqualNumber(miaRate);
        expect(a2AccruedPre).toEqualNumber(0);
        expect(a2AccruedPost).toEqualNumber(0);
        expect(miaBalancePre).toEqualNumber(0);
        expect(miaBalancePost).toEqualNumber(miaRate.mul(deltaBlocks).sub(1)); // index is 8333...
      });
  
      it('should claim when mia accrued is below threshold', async () => {
        const miaRemaining = evmosExp(1), accruedAmt = evmosUnsigned(0.0009e18)
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        await send(comptroller, 'setNemoAccrued', [a1, accruedAmt]);
        await send(comptroller, 'claimNemo', [a1, [nLOW._address]]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(accruedAmt);
      });
  
      it('should revert when a market is not listed', async () => {
        const cNOT = await makeNToken({comptroller});
        await expect(
          send(comptroller, 'claimNemo', [a1, [cNOT._address]])
        ).rejects.toRevert('revert market not listed');
      });
    });
  
    describe('claimNemo batch', () => {
      it('should revert when claiming mia from non-listed market', async () => {
        const miaRemaining = miaRate.mul(100), deltaBlocks = 10, mintAmount = evmosMantissa(1, 12);
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        let [_, __, ...claimAccts] = saddle.accounts;
  
        for(let from of claimAccts) {
          expect(await send(nLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
          send(nLOW.underlying, 'approve', [nLOW._address, mintAmount], { from });
          send(nLOW, 'mint', [mintAmount], { from });
        }
  
        await pretendBorrow(nLOW, root, 1, 1, evmosMantissa(1, 12));
        await send(comptroller, 'harnessRefreshNemoSpeeds');
  
        await fastForward(comptroller, deltaBlocks);
  
        await expect(send(comptroller, 'claimNemo', [claimAccts, [nLOW._address, nEVIL._address], true, true])).rejects.toRevert('revert market not listed');
      });
  
      it('should claim the expected amount when holders and nTokens arg is duplicated', async () => {
        const miaRemaining = miaRate.mul(100), deltaBlocks = 10, mintAmount = evmosMantissa(1, 12);
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        let [_, __, ...claimAccts] = saddle.accounts;
        for(let from of claimAccts) {
          expect(await send(nLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
          send(nLOW.underlying, 'approve', [nLOW._address, mintAmount], { from });
          send(nLOW, 'mint', [mintAmount], { from });
        }
        await pretendBorrow(nLOW, root, 1, 1, evmosMantissa(1, 12));
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address]]);
        await send(comptroller, 'harnessRefreshNemoSpeeds');
  
        await fastForward(comptroller, deltaBlocks);
  
        const tx = await send(comptroller, 'claimNemo', [[...claimAccts, ...claimAccts], [nLOW._address, nLOW._address], false, true]);
        // mia distributed => 10e18
        for(let acct of claimAccts) {
          const miaSupplierIndex_Actual = await call(comptroller, 'miaSupplierIndex', [nLOW._address, acct])
          expect(miaSupplierIndex_Actual.toString()).toEqualNumber("104166666666666667666666666666666666666666666666666666");
          const miaBalance_Actual = await miaBalance(comptroller, acct)
          expect(miaBalance_Actual.toString()).toEqualNumber("1249999999999999999");
        }
      });
  
      it('claims mia for multiple suppliers only', async () => {
        const miaRemaining = miaRate.mul(100), deltaBlocks = 10, mintAmount = evmosMantissa(1, 12);
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        let [_, __, ...claimAccts] = saddle.accounts;
        for(let from of claimAccts) {
          expect(await send(nLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
          send(nLOW.underlying, 'approve', [nLOW._address, mintAmount], { from });
          send(nLOW, 'mint', [mintAmount], { from });
        }
        await pretendBorrow(nLOW, root, 1, 1, evmosMantissa(1, 12));
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address]]);
        await send(comptroller, 'harnessRefreshNemoSpeeds');
  
        await fastForward(comptroller, deltaBlocks);
  
        const tx = await send(comptroller, 'claimmia', [claimAccts, [nLOW._address], false, true]);
        // mia distributed => 1e18
        for(let acct of claimAccts) {
          const miaSupplierIndex_Actual = await call(comptroller, 'miaSupplierIndex', [nLOW._address, acct]);
          expect(miaSupplierIndex_Actual.toString()).toEqual("104166666666666667666666666666666666666666666666666666");
          const miaBalance_Actual = await miaBalance(comptroller, acct);
          expect(miaBalance_Actual.toString()).toEqualNumber("1249999999999999999");
        }
      });
  
      it('claims mia for multiple borrowers only, primes uninitiated', async () => {
        const miaRemaining = miaRate.mul(100), deltaBlocks = 10, mintAmount = evmosExp(10), borrowAmt = evmosMantissa(1, 12), borrowIdx = evmosMantissa(1, 12)
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        let [_,__, ...claimAccts] = saddle.accounts;
  
        for(let acct of claimAccts) {
          await send(nLOW, 'harnessIncrementTotalBorrows', [borrowAmt]);
          await send(nLOW, 'harnessSetAccountBorrows', [acct, borrowAmt, borrowIdx]);
        }
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address]]);
        await send(comptroller, 'harnessRefreshNemoSpeeds');
  
        await send(comptroller, 'harnessFastForward', [10]);
  
        const tx = await send(comptroller, 'claimNemo', [claimAccts, [nLOW._address], true, false]);
        for(let acct of claimAccts) {
          const miaBorrowerIndex_Actual = await call(comptroller, 'miaBorrowerIndex', [nLOW._address, acct]);
          expect(miaBorrowerIndex_Actual.toString()).toEqualNumber("104166666666666667666666666666666666666666666666666666");
          expect(await call(comptroller, 'miaSupplierIndex', [nLOW._address, acct])).toEqualNumber(0);
        }
      });
  
      it('should revert when a market is not listed', async () => {
        const cNOT = await makeNToken({comptroller});
        await setMarketSupplyCap(cNOT.comptroller, [cNOT._address], [1e15]);
        await expect(
          send(comptroller, 'claimNemo', [[a1, a2], [cNOT._address], true, true])
        ).rejects.toRevert('revert market not listed');
      });
    });
  
    describe('harnessRefreshNemoSpeeds', () => {
      it('should start out 0', async () => {
        await send(comptroller, 'harnessRefreshNemoSpeeds');
        const speed = await call(comptroller, 'miaSpeeds', [nLOW._address]);
        expect(speed).toEqualNumber(0);
      });
  
      it('should get correct speeds with borrows', async () => {
        await pretendBorrow(nLOW, a1, 1, 1, 100);
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address]]);
        const tx = await send(comptroller, 'harnessRefreshNemoSpeeds');
        const speed = await call(comptroller, 'miaSpeeds', [nLOW._address]);
        expect(speed).toEqualNumber(miaRate);
        expect(tx).toHaveLog(['NemoSpeedUpdated', 0], {
          nToken: nLOW._address,
          newSpeed: speed
        });
      });
  
      it('should get correct speeds for 2 assets', async () => {
        await pretendBorrow(nLOW, a1, 1, 1, 100);
        await pretendBorrow(nZRX, a1, 1, 1, 100);
        await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address, nZRX._address]]);
        await send(comptroller, 'harnessRefreshNemoSpeeds');
        const speed1 = await call(comptroller, 'miaSpeeds', [nLOW._address]);
        const speed2 = await call(comptroller, 'miaSpeeds', [nREP._address]);
        const speed3 = await call(comptroller, 'miaSpeeds', [nZRX._address]);
        expect(speed1).toEqualNumber(miaRate.div(4));
        expect(speed2).toEqualNumber(0);
        expect(speed3).toEqualNumber(miaRate.div(4).mul(3));
      });
    });
  
    describe('harnessAddNemoMarkets', () => {
      it('should correctly add a mia market if called by admin', async () => {
        const nBAT = await makeNToken({comptroller, supportMarket: true});
        await setMarketSupplyCap(nBAT.comptroller, [nBAT._address], [1e15]);
        const tx1 = await send(comptroller, 'harnessAddNemoMarkets', [[nLOW._address, nREP._address, nZRX._address]]);
        const tx2 = await send(comptroller, 'harnessAddNemoMarkets', [[nBAT._address]]);
        const markets = await call(comptroller, 'getNemoMarkets');
        expect(markets).toEqual([nLOW, nREP, nZRX, nBAT].map((c) => c._address));
        expect(tx2).toHaveLog('NemoSpeedUpdated', {
          nToken: nBAT._address,
          newSpeed: 1
        });
      });
  
      it('should not write over a markets existing state', async () => {
        const mkt = nLOW._address;
        const bn0 = 10, bn1 = 20;
        const idx = evmosUnsigned(1.5e36);
  
        await send(comptroller, "harnessAddNemoMarkets", [[mkt]]);
        await send(comptroller, "setNemoSupplyState", [mkt, idx, bn0]);
        await send(comptroller, "setNemoBorrowState", [mkt, idx, bn0]);
        await send(comptroller, "setBlockNumber", [bn1]);
        await send(comptroller, "_setNemoSpeed", [mkt, 0]);
        await send(comptroller, "harnessAddNemoMarkets", [[mkt]]);
  
        const supplyState = await call(comptroller, 'miaSupplyState', [mkt]);
        expect(supplyState.block).toEqual(bn1.toFixed());
        expect(supplyState.index).toEqual(idx.toFixed());
  
        const borrowState = await call(comptroller, 'miaBorrowState', [mkt]);
        expect(borrowState.block).toEqual(bn1.toFixed());
        expect(borrowState.index).toEqual(idx.toFixed());
      });
    });
  
    describe('claimNemo bankrupt accounts', () => {
      let nToken, liquidity, shortfall, comptroller;
      const borrowed = 6666666;
      const minted = 1e6;
      const collateralFactor = 0.5, underlyingPrice = 1, amount = 1e6;
      beforeEach(async () => {
        // prepare a nToken
        comptroller = await makeComptroller();
        nToken = await makeNToken({comptroller, supportMarket: true, collateralFactor, underlyingPrice});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [1e15]);
        // enter market and make user borrow something
        await enterMarkets([nToken], a1);
        // mint nToken to get user some liquidity
        await quickMint(nToken, a1, minted);
        ({1: liquidity, 2: shortfall} = await call(
          nToken.comptroller, 
          'getAccountLiquidity', 
          [a1]));
        expect(liquidity).toEqualNumber(minted * collateralFactor);
        expect(shortfall).toEqualNumber(0);
  
        // borror some tokens and let user go bankrupt
        await pretendBorrow(nToken, a1, 1, 1, borrowed);
        ({1: liquidity, 2: shortfall} = await call(
          nToken.comptroller, 
          'getAccountLiquidity', 
          [a1]));
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber((borrowed - minted) * collateralFactor);
      });
  
      it('should stop bankrupt accounts from claiming', async () => {
        // claiming mia will fail
        const miaRemaining = evmosUnsigned(100e18);
        const accruedAmt = evmosUnsigned(10e18);
        await send(comptroller.mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        await send(comptroller, 'setNemoAccrued', [a1, accruedAmt]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(accruedAmt);
        expect(await miaBalance(comptroller, a1)).toEqualNumber(0);
  
        await expect(
          send(comptroller, 'claimNemo', [a1, [nToken._address]])
        ).rejects.toRevert('revert bankrupt accounts can only collateralize their pending mia rewards');
      });
  
      it('should use the pending mia reward of bankrupt accounts as collateral and liquidator can liquidate them', async () => {
        // set mia and vmia token
        const mia = await makeToken();
        const nMIA= await makeNToken({comptroller, supportMarket: true, collateralFactor: 0.5, underlying: mia, root, underlyingPrice: 1});
        await setMarketSupplyCap(nMIA.comptroller, [nMIA._address], [1e15]);
  
        const miaRemaining = evmosUnsigned(1e12);
  
        // this small amount of accrued mia couldn't save the user out of bankrupt...
        const smallAccruedAmt = evmosUnsigned(888);
        // ...but this can
        const bigAccruedAmt = evmosUnsigned(1e10);
  
        await enterMarkets([nMIA], a1);
        await send(comptroller, 'setMIAAddress', [mia._address]);
        await send(comptroller, 'setMIANTokenAddress', [nMIA._address]);
        await send(mia, 'transfer', [comptroller._address, miaRemaining], {from: root});
        await send(comptroller, 'setNemoAccrued', [a1, smallAccruedAmt]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(smallAccruedAmt);
  
        // mintBehalf is called
        await send(comptroller, 'claimNemoAsCollateral', [a1]);
  
        // balance check
        expect(evmosUnsigned(await call(mia, 'balanceOf', [a1]))).toEqualNumber(0);
        expect(evmosUnsigned(await call(nMIA, 'balanceOf', [a1]))).toEqualNumber(smallAccruedAmt);
        expect(evmosUnsigned(await call(mia, 'balanceOf', [comptroller._address]))).toEqualNumber(miaRemaining.sub(smallAccruedAmt));
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(0);
  
        // liquidity check, a part of user's debt is paid off but the user's
        // still bankrupt 
        ({1: liquidity, 2: shortfall} = await call(
          comptroller, 
          'getAccountLiquidity', 
          [a1]));
        expect(liquidity).toEqualNumber(0);
        const shortfallBefore = evmosUnsigned(borrowed - minted); 
        const shortfallAfter = shortfallBefore.sub(smallAccruedAmt) * collateralFactor;
        expect(shortfall).toEqualNumber(shortfallAfter)
  
        // give the user big amount of reward so the user can pay off the debt
        await send(comptroller, 'setNemoAccrued', [a1, bigAccruedAmt]);
        expect(await miaAccrued(comptroller, a1)).toEqualNumber(bigAccruedAmt);
  
        await send(comptroller, 'claimNemoAsCollateral', [a1]);
        ({1: liquidity, 2: shortfall} = await call(
          comptroller, 
          'getAccountLiquidity', 
          [a1]));
        expect(liquidity).toEqualNumber(evmosUnsigned(bigAccruedAmt * collateralFactor).sub(shortfallAfter));
        expect(shortfall).toEqualNumber(0)
  
        // balance check
        expect(evmosUnsigned(await call(mia, 'balanceOf', [a1]))).toEqualNumber(0);
        expect(evmosUnsigned(await call(nMIA, 'balanceOf', [a1]))).toEqualNumber(smallAccruedAmt.add(bigAccruedAmt));
        expect(evmosUnsigned(await call(mia, 'balanceOf', [comptroller._address]))).toEqualNumber(miaRemaining.sub(smallAccruedAmt).sub(bigAccruedAmt));
      });
  
    })
  });