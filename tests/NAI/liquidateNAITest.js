const {
    evmosGasCost,
    evmosUnsigned
  } = require('../Utils/EVMOS');
  
  const {
    makeNToken,
    fastForward,
    setBalance,
    setMintedSEBOf,
    setSEBBalance,
    getBalancesWithSEB,
    adjustBalancesWithSEB,
    pretendBorrow,
    pretendSEBMint,
    preApproveSEB
  } = require('../Utils/Nemo');
  
  const repayAmount = evmosUnsigned(10e2);
  const seizeAmount = repayAmount;
  const seizeTokens = seizeAmount.mul(4); // forced
  
  async function preLiquidateSEB(comptroller, sebcontroller, seb, liquidator, borrower, repayAmount, nTokenCollateral) {
    // setup for success in liquidating
    await send(comptroller, 'setLiquidateBorrowAllowed', [true]);
    await send(comptroller, 'setLiquidateBorrowVerify', [true]);
    await send(comptroller, 'setRepayBorrowAllowed', [true]);
    await send(comptroller, 'setRepayBorrowVerify', [true]);
    await send(comptroller, 'setSeizeAllowed', [true]);
    await send(comptroller, 'setSeizeVerify', [true]);
    await send(comptroller, 'setSEBFailCalculateSeizeTokens', [false]);
    await send(nTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nTokenCollateral.comptroller, 'setSEBCalculatedSeizeTokens', [seizeTokens]);
    await setBalance(nTokenCollateral, liquidator, 0);
    await setBalance(nTokenCollateral, borrower, seizeTokens);
    await setMintedSEBOf(comptroller, borrower, 40e2);
    await setSEBBalance(seb, borrower, 40e2);
    await setSEBBalance(seb, liquidator, 40e2);
    await pretendBorrow(nTokenCollateral, borrower, 0, 10e2, 0);
    await pretendSEBMint(comptroller, sebcontroller, seb, borrower, 40e2);
    await preApproveSEB(comptroller, seb, liquidator, sebcontroller._address, repayAmount);
  }
  
  async function liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral) {
    return send(sebcontroller, 'harnessLiquidateSEBFresh', [liquidator, borrower, repayAmount, nTokenCollateral._address]);
  }
  
  async function liquidateSEB(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral) {
    // make sure to have a block delta so we accrue interest
    await fastForward(sebcontroller, 1);
    await fastForward(nTokenCollateral, 1);
    return send(sebcontroller, 'liquidateSEB', [borrower, repayAmount, nTokenCollateral._address], {from: liquidator});
  }
  
  async function seize(nToken, liquidator, borrower, seizeAmount) {
    return send(nToken, 'seize', [liquidator, borrower, seizeAmount]);
  }
  
  describe('SEBController', function () {
    let root, liquidator, borrower, accounts;
    let nTokenCollateral;
    let comptroller, sebcontroller, seb;
  
    beforeEach(async () => {
      [root, liquidator, borrower, ...accounts] = saddle.accounts;
      nTokenCollateral = await makeNToken({comptrollerOpts: {kind: 'bool'}});
      comptroller = nTokenCollateral.comptroller;
      sebcontroller = comptroller.sebcontroller;
      await send(comptroller, 'setLiquidateBorrowAllowed', [false]);
      seb = comptroller.seb;
    });
  
    beforeEach(async () => {
      await preLiquidateSEB(comptroller, sebcontroller, seb, liquidator, borrower, repayAmount, nTokenCollateral);
    });
  
    describe('liquidateSEBFresh', () => {
      it("fails if comptroller tells it to", async () => {
        await send(comptroller, 'setLiquidateBorrowAllowed', [false]);
        expect(
          await liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toHaveSEBTrollReject('SEB_LIQUIDATE_COMPTROLLER_REJECTION', 'MATH_ERROR');
      });
  
      it("proceeds if comptroller tells it to", async () => {
        expect(
          await liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toSucceed();
      });
  
      it("fails if collateral market not fresh", async () => {
        await fastForward(sebcontroller);
        await fastForward(nTokenCollateral);
        expect(
          await liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toHaveSEBTrollFailure('REJECTION', 'SEB_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK');
      });
  
      it("fails if borrower is equal to liquidator", async () => {
        expect(
          await liquidateSEBFresh(sebcontroller, borrower, borrower, repayAmount, nTokenCollateral)
        ).toHaveSEBTrollFailure('REJECTION', 'SEB_LIQUIDATE_LIQUIDATOR_IS_BORROWER');
      });
  
      it("fails if repayAmount = 0", async () => {
        expect(await liquidateSEBFresh(sebcontroller, liquidator, borrower, 0, nTokenCollateral)).toHaveSEBTrollFailure('REJECTION', 'SEB_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
      });
  
      it("fails if calculating seize tokens fails and does not adjust balances", async () => {
        const beforeBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        await send(comptroller, 'setSEBFailCalculateSeizeTokens', [true]);
        await expect(
          liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
        ).rejects.toRevert('revert SEB_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
        const afterBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        expect(afterBalances).toEqual(beforeBalances);
      });
  
      // it("fails if repay fails", async () => {
      //   await send(comptroller, 'setRepayBorrowAllowed', [false]);
      //   expect(
      //     await liquidatesebFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
      //   ).toHavesebTrollReject('LIQUIDATE_REPAY_BORROW_FRESH_FAILED');
      // });
  
      it("reverts if seize fails", async () => {
        await send(comptroller, 'setSeizeAllowed', [false]);
        await expect(
          liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
        ).rejects.toRevert("revert token seizure failed");
      });
  
      it("reverts if liquidateBorrowVerify fails", async() => {
        await send(comptroller, 'setLiquidateBorrowVerify', [false]);
        await expect(
          liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)
        ).rejects.toRevert("revert liquidateBorrowVerify rejected liquidateBorrow");
      });
  
      it("transfers the cash, borrows, tokens, and emits LiquidateSEB events", async () => {
        const beforeBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        const result = await liquidateSEBFresh(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral);
        const afterBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        expect(result).toSucceed();
        expect(result).toHaveLog('LiquidateSEB', {
          liquidator: liquidator,
          borrower: borrower,
          repayAmount: repayAmount.toString(),
          nTokenCollateral: nTokenCollateral._address,
          seizeTokens: seizeTokens.toString()
        });
        // expect(result).toHaveLog(['Transfer', 0], {
        //   from: liquidator,
        //   to: sebcontroller._address,
        //   amount: repayAmount.toString()
        // });
        // expect(result).toHaveLog(['Transfer', 1], {
        //   from: borrower,
        //   to: liquidator,
        //   amount: seizeTokens.toString()
        // });
  
        expect(afterBalances).toEqual(await adjustBalancesWithSEB(beforeBalances, [
          [nTokenCollateral, liquidator, 'tokens', seizeTokens],
          [nTokenCollateral, borrower, 'tokens', -seizeTokens],
          [seb, liquidator, 'seb', -repayAmount]
        ], seb));
      });
    });
  
    describe('liquidateSEB', () => {
      // it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      //   await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
      //   await expect(liquidateSEB(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      // });
  
      // it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      //   await send(nTokenCollateral.interestRateModel, 'setFailBorrowRate', [true]);
      //   await expect(liquidateSEB(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      // });
  
      it("returns error from liquidateSEBFresh without emitting any extra logs", async () => {
        expect(await liquidateSEB(sebcontroller, liquidator, borrower, 0, nTokenCollateral)).toHaveSEBTrollFailure('REJECTION', 'SEB_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
      });
  
      it("returns success from liquidateSEBFresh and transfers the correct amounts", async () => {
        const beforeBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        const result = await liquidateSEB(sebcontroller, liquidator, borrower, repayAmount, nTokenCollateral);
        const gasCost = await evmosGasCost(result);
        const afterBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        expect(result).toSucceed();
        expect(afterBalances).toEqual(await adjustBalancesWithSEB(beforeBalances, [
          [nTokenCollateral, liquidator, 'evmos', -gasCost],
          [nTokenCollateral, liquidator, 'tokens', seizeTokens],
          [nTokenCollateral, borrower, 'tokens', -seizeTokens],
          [seb, liquidator, 'seb', -repayAmount]
        ], seb));
      });
    });
  
    describe('seize', () => {
      // XXX verify callers are properly checked
  
      it("fails if seize is not allowed", async () => {
        await send(comptroller, 'setSeizeAllowed', [false]);
        expect(await seize(nTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTrollReject('LIQUIDATE_SEIZE_COMPTROLLER_REJECTION', 'MATH_ERROR');
      });
  
      it("fails if nTokenBalances[borrower] < amount", async () => {
        await setBalance(nTokenCollateral, borrower, 1);
        expect(await seize(nTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_DECREMENT_FAILED', 'INTEGER_UNDERFLOW');
      });
  
      it("fails if nTokenBalances[liquidator] overflows", async () => {
        await setBalance(nTokenCollateral, liquidator, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
        expect(await seize(nTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_INCREMENT_FAILED', 'INTEGER_OVERFLOW');
      });
  
      it("succeeds, updates balances, and emits Transfer event", async () => {
        const beforeBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        const result = await seize(nTokenCollateral, liquidator, borrower, seizeTokens);
        const afterBalances = await getBalancesWithSEB(seb, [nTokenCollateral], [liquidator, borrower]);
        expect(result).toSucceed();
        expect(result).toHaveLog('Transfer', {
          from: borrower,
          to: liquidator,
          amount: seizeTokens.toString()
        });
        expect(afterBalances).toEqual(await adjustBalancesWithSEB(beforeBalances, [
          [nTokenCollateral, liquidator, 'tokens', seizeTokens],
          [nTokenCollateral, borrower, 'tokens', -seizeTokens]
        ], seb));
      });
    });
  });