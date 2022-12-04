const {
    evmosMantissa,
    minerStart,
    minerStop
  } = require('./Utils/EVMOS');
  
  const {
    makeNToken,
    balanceOf,
    borrowSnapshot,
    enterMarkets,
    setMarketSupplyCap
  } = require('./Utils/Nemo');
  
  describe('Spinarama', () => {
    let root, from, accounts;
  
    beforeEach(async () => {
      [root, from, ...accounts] = saddle.accounts;
    });
  
    describe('#mintMint', () => {
      it('should succeed', async () => {
        const nToken = await makeNToken({supportMarket: true, underlyingPrice: 1});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        await send(nToken.underlying, 'harnessSetBalance', [from, 100], {from});
        await send(nToken.underlying, 'approve', [nToken._address, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'], {from});
        await minerStop();
        const p1 = send(nToken, 'mint', [1], {from});
        const p2 = send(nToken, 'mint', [2], {from});
        await minerStart();
        expect(await p1).toSucceed();
        expect(await p2).toSucceed();
        expect(await balanceOf(nToken, from)).toEqualNumber(3);
      });
  
      it('should partial succeed', async () => {
        const nToken = await makeNToken({supportMarket: true, underlyingPrice: 1});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        await send(nToken.underlying, 'harnessSetBalance', [from, 100], {from});
        await send(nToken.underlying, 'approve', [nToken._address, 10], {from});
        await minerStop();
        const p1 = send(nToken, 'mint', [11], {from});
        const p2 = send(nToken, 'mint', [10], {from});
        await expect(minerStart()).rejects.toRevert("revert Insufficient allowance");
        try {
          await p1;
        } catch (err) {
          // hack: miner start reverts with correct message, but tx gives us a weird tx obj. ganache bug?
          expect(err.toString()).toContain("reverted by the EVM");
        }
        await expect(p2).resolves.toSucceed();
        expect(await balanceOf(nToken, from)).toEqualNumber(10);
      });
    });
  
    describe('#mintRedeem', () => {
      it('should succeed', async () => {
        const nToken = await makeNToken({supportMarket: true, underlyingPrice: 1});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        await send(nToken.underlying, 'harnessSetBalance', [from, 100], {from});
        await send(nToken.underlying, 'approve', [nToken._address, 10], {from});
        await send(nToken.comptroller.seb, 'approve', [nToken.comptroller._address, 100], {from});
        await minerStop();
        const p1 = send(nToken, 'mint', [10], {from});
        const p2 = send(nToken, 'redeemUnderlying', [10], {from});
        await minerStart();
        expect(await p1).toSucceed();
        expect(await p2).toSucceed();
        expect(await balanceOf(nToken, from)).toEqualNumber(0);
      });
    });
  
    describe('#redeemMint', () => {
      it('should succeed', async () => {
        const nToken = await makeNToken({supportMarket: true, underlyingPrice: 1});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        await send(nToken, 'harnessSetTotalSupply', [10]);
        await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(1)]);
        await send(nToken, 'harnessSetBalance', [from, 10]);
        await send(nToken.underlying, 'harnessSetBalance', [nToken._address, 10]);
        await send(nToken.underlying, 'approve', [nToken._address, 10], {from});
        await minerStop();
        const p1 = send(nToken, 'redeem', [10], {from});
        const p2 = send(nToken, 'mint', [10], {from});
        await minerStart();
        expect(await p1).toSucceed();
        expect(await p2).toSucceed();
        expect(await balanceOf(nToken, from)).toEqualNumber(10);
      });
    });
  
    describe('#repayRepay', () => {
      it('should succeed', async () => {
        const nToken1 = await makeNToken({supportMarket: true, underlyingPrice: 1, collateralFactor: .5});
        await setMarketSupplyCap(nToken1.comptroller, [nToken1._address], [100000000000]);
        const nToken2 = await makeNToken({supportMarket: true, underlyingPrice: 1, comptroller: nToken1.comptroller});
        await setMarketSupplyCap(nToken2.comptroller, [nToken2._address], [100000000000]);
        await send(nToken1.underlying, 'harnessSetBalance', [from, 10]);
        await send(nToken1.underlying, 'approve', [nToken1._address, 10], {from});
        await send(nToken2.underlying, 'harnessSetBalance', [nToken2._address, 10]);
        await send(nToken2, 'harnessSetTotalSupply', [100]);
        await send(nToken2.underlying, 'approve', [nToken2._address, 10], {from});
        await send(nToken2, 'harnessSetExchangeRate', [evmosMantissa(1)]);
        await send(nToken1.comptroller.seb, 'approve', [nToken1.comptroller._address, 100], {from});
        expect(await enterMarkets([nToken1, nToken2], from)).toSucceed();
        expect(await send(nToken1, 'mint', [10], {from})).toSucceed();
        expect(await send(nToken2, 'borrow', [2], {from})).toSucceed();
        await minerStop();
        const p1 = send(nToken2, 'repayBorrow', [1], {from});
        const p2 = send(nToken2, 'repayBorrow', [1], {from});
        await minerStart();
        expect(await p1).toSucceed();
        expect(await p2).toSucceed();
        expect((await borrowSnapshot(nToken2, from)).principal).toEqualNumber(0);
      });
  
      // XXX not yet converted below this point...moving on to certora
  
      it.skip('can have partial failure succeed', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        // Now borrow 5 bat
        expect(await spinarama.methods.borrow(BAT._address, 5).send({from: accounts[0]})).toSucceed();
  
        // And repay it, repay it
        const {'0': err0, '1': err1} = await spinarama.methods.repayRepay(BAT._address, 100, 1).call({from: accounts[0]});
  
        expect(err0).hasErrorCode(ErrorEnum.INTEGER_UNDERFLOW);
        expect(err1).hasErrorCode(ErrorEnum.NO_ERROR);
      });
    });
  
    describe('#borrowRepayBorrow', () => {
      it.skip('should fail', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        // Borrow then repayBorrow should revert
        await expect(
          spinarama.methods.borrowRepayBorrow(BAT._address, 5, 1).call({from: accounts[0]})
        ).rejects.toRevert();
      });
  
      it.skip('can succeed with partial failure', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        // Borrow a little, repay a lot
        const {'0': err0, '1': err1} = await spinarama.methods.borrowRepayBorrow(BAT._address, 1, 1000).call({from: accounts[0]});
  
        expect(err0).hasErrorCode(ErrorEnum.NO_ERROR);
        expect(err1).hasErrorCode(ErrorEnum.INTEGER_UNDERFLOW);
      });
    });
  
    describe('#borrowSupply', () => {
      it.skip('should fail in same asset', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        // Borrow then supply should revert
        await expect(
          spinarama.methods.borrowSupply(BAT._address, BAT._address, 5, 1).call({from: accounts[0]})
        ).rejects.toRevert();
      });
  
      it.skip('should fail, even in different assets', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        // Borrow then supply in different assets
        await expect(
          spinarama.methods.borrowSupply(BAT._address, OMG._address, 5, 1).call({from: accounts[0]})
        ).rejects.toRevert();
      });
    });
  
    describe('#supplyLiquidate', () => {
      it.skip('should fail', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        await expect(
          spinarama.methods.supplyLiquidate(OMG._address, 5, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
        ).rejects.toRevert();
      });
    });
  
    describe('#withdrawLiquidate', () => {
      it.skip('should fail', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        await expect(
          spinarama.methods.withdrawLiquidate(OMG._address, 5, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
        ).rejects.toRevert();
      });
    });
  
    describe('#borrowLiquidate', () => {
      it.skip('should fail', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root);
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        await expect(
          spinarama.methods.borrowLiquidate(OMG._address, 5, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
        ).rejects.toRevert();
      });
    });
  
    describe('#repayBorrowLiquidate', () => {
      it.skip('should fail', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root)
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        // Borrow some OMG
        expect(await spinarama.methods.borrow(OMG._address, 5).send({from: accounts[0]})).toSucceed();
  
        await expect(
          spinarama.methods.repayBorrowLiquidate(OMG._address, 1, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
        ).rejects.toRevert();
      });
    });
  
    describe('#liquidateLiquidate', () => {
      it.skip('should fail', async () => {
        const {moneyMarketHarness,
          priceOracle,
          interestRateModel} = await setupMoneyMarket(root)
        const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
        const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
        const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  
        // Add cash to the protocol
        await addCash(moneyMarketHarness, BAT, root);
  
        // Supply some collateral
        expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();
  
        await expect(
          spinarama.methods.liquidateLiquidate(OMG._address, 1, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
        ).rejects.toRevert();
      });
    });
  });