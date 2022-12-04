const {
    evmosGasCost,
    evmosUnsigned
  } = require('../Utils/EVMOS');
  
  const {
    makeNToken,
    fastForward,
    setBalance,
    getBalances,
    adjustBalances,
    pretendBorrow,
    preApprove
  } = require('../Utils/Nemo');
  
  const repayAmount = evmosUnsigned(10e2);
  const seizeAmount = repayAmount;
  const seizeTokens = seizeAmount.mul(4); // forced
  
  async function preLiquidate(nToken, liquidator, borrower, repayAmount, nTokenCollateral) {
    // setup for success in liquidating
    await send(nToken.comptroller, 'setLiquidateBorrowAllowed', [true]);
    await send(nToken.comptroller, 'setLiquidateBorrowVerify', [true]);
    await send(nToken.comptroller, 'setRepayBorrowAllowed', [true]);
    await send(nToken.comptroller, 'setRepayBorrowVerify', [true]);
    await send(nToken.comptroller, 'setSeizeAllowed', [true]);
    await send(nToken.comptroller, 'setSeizeVerify', [true]);
    await send(nToken.comptroller, 'setFailCalculateSeizeTokens', [false]);
    await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [liquidator, false]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nTokenCollateral.comptroller, 'setCalculatedSeizeTokens', [seizeTokens]);
    await setBalance(nTokenCollateral, liquidator, 0);
    await setBalance(nTokenCollateral, borrower, seizeTokens);
    await pretendBorrow(nTokenCollateral, borrower, 0, 1, 0);
    await pretendBorrow(nToken, borrower, 1, 1, repayAmount);
    await preApprove(nToken, liquidator, repayAmount);
  }
  
  async function liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral) {
    return send(nToken, 'harnessLiquidateBorrowFresh', [liquidator, borrower, repayAmount, nTokenCollateral._address]);
  }
  
  async function liquidate(nToken, liquidator, borrower, repayAmount, nTokenCollateral) {
    // make sure to have a block delta so we accrue interest
    await fastForward(nToken, 1);
    await fastForward(nTokenCollateral, 1);
    return send(nToken, 'liquidateBorrow', [borrower, repayAmount, nTokenCollateral._address], {from: liquidator});
  }
  
  async function seize(nToken, liquidator, borrower, seizeAmount) {
    return send(nToken, 'seize', [liquidator, borrower, seizeAmount]);
  }
  
  describe('NToken', function () {
    let root, liquidator, borrower, accounts;
    let nToken, nTokenCollateral;
  
    beforeEach(async () => {
      [root, liquidator, borrower, ...accounts] = saddle.accounts;
      nToken = await makeNToken({comptrollerOpts: {kind: 'bool'}});
      nTokenCollateral = await makeNToken({comptroller: nToken.comptroller});
    });
  
    beforeEach(async () => {
      await preLiquidate(nToken, liquidator, borrower, repayAmount, nTokenCollateral);
    });
  
    describe('liquidateBorrowFresh', () => {
      it("fails if comptroller tells it to", async () => {
        await send(nToken.comptroller, 'setLiquidateBorrowAllowed', [false]);
        expect(
          await liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toHaveTrollReject('LIQUIDATE_COMPTROLLER_REJECTION', 'MATH_ERROR');
      });
  
      it("proceeds if comptroller tells it to", async () => {
        expect(
          await liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toSucceed();
      });
  
      it("fails if market not fresh", async () => {
        await fastForward(nToken);
        expect(
          await liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toHaveTokenFailure('MARKET_NOT_FRESH', 'LIQUIDATE_FRESHNESS_CHECK');
      });
  
      it("fails if collateral market not fresh", async () => {
        await fastForward(nToken);
        await fastForward(nTokenCollateral);
        await send(nToken, 'accrueInterest');
        expect(
          await liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toHaveTokenFailure('MARKET_NOT_FRESH', 'LIQUIDATE_COLLATERAL_FRESHNESS_CHECK');
      });
  
      it("fails if borrower is equal to liquidator", async () => {
        expect(
          await liquidateFresh(nToken, borrower, borrower, repayAmount, nTokenCollateral)
        ).toHaveTokenFailure('INVALID_ACCOUNT_PAIR', 'LIQUIDATE_LIQUIDATOR_IS_BORROWER');
      });
  
      it("fails if repayAmount = 0", async () => {
        expect(await liquidateFresh(nToken, liquidator, borrower, 0, nTokenCollateral)).toHaveTokenFailure('INVALID_CLOSE_AMOUNT_REQUESTED', 'LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
      });
  
      it("fails if calculating seize tokens fails and does not adjust balances", async () => {
        const beforeBalances = await getBalances([nToken, nTokenCollateral], [liquidator, borrower]);
        await send(nToken.comptroller, 'setFailCalculateSeizeTokens', [true]);
        await expect(
          liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).rejects.toRevert('revert LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
        const afterBalances = await getBalances([nToken, nTokenCollateral], [liquidator, borrower]);
        expect(afterBalances).toEqual(beforeBalances);
      });
  
      it("fails if repay fails", async () => {
        await send(nToken.comptroller, 'setRepayBorrowAllowed', [false]);
        expect(
          await liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).toHaveTrollReject('LIQUIDATE_REPAY_BORROW_FRESH_FAILED');
      });
  
      it("reverts if seize fails", async () => {
        await send(nToken.comptroller, 'setSeizeAllowed', [false]);
        await expect(
          liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).rejects.toRevert("revert token seizure failed");
      });
  
      it("reverts if liquidateBorrowVerify fails", async() => {
        await send(nToken.comptroller, 'setLiquidateBorrowVerify', [false]);
        await expect(
          liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral)
        ).rejects.toRevert("revert liquidateBorrowVerify rejected liquidateBorrow");
      });
  
      it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
        const beforeBalances = await getBalances([nToken, nTokenCollateral], [liquidator, borrower]);
        const result = await liquidateFresh(nToken, liquidator, borrower, repayAmount, nTokenCollateral);
        const afterBalances = await getBalances([nToken, nTokenCollateral], [liquidator, borrower]);
        expect(result).toSucceed();
        expect(result).toHaveLog('LiquidateBorrow', {
          liquidator: liquidator,
          borrower: borrower,
          repayAmount: repayAmount.toString(),
          nTokenCollateral: nTokenCollateral._address,
          seizeTokens: seizeTokens.toString()
        });
        expect(result).toHaveLog(['Transfer', 0], {
          from: liquidator,
          to: nToken._address,
          amount: repayAmount.toString()
        });
        expect(result).toHaveLog(['Transfer', 1], {
          from: borrower,
          to: liquidator,
          amount: seizeTokens.toString()
        });
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [nToken, 'cash', repayAmount],
          [nToken, 'borrows', -repayAmount],
          [nToken, liquidator, 'cash', -repayAmount],
          [nTokenCollateral, liquidator, 'tokens', seizeTokens],
          [nToken, borrower, 'borrows', -repayAmount],
          [nTokenCollateral, borrower, 'tokens', -seizeTokens]
        ]));
      });
    });
  
    describe('liquidateBorrow', () => {
      it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(liquidate(nToken, liquidator, borrower, repayAmount, nTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
        await send(nTokenCollateral.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(liquidate(nToken, liquidator, borrower, repayAmount, nTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
        expect(await liquidate(nToken, liquidator, borrower, 0, nTokenCollateral)).toHaveTokenFailure('INVALID_CLOSE_AMOUNT_REQUESTED', 'LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
      });
  
      it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
        const beforeBalances = await getBalances([nToken, nTokenCollateral], [liquidator, borrower]);
        const result = await liquidate(nToken, liquidator, borrower, repayAmount, nTokenCollateral);
        const gasCost = await evmosGasCost(result);
        const afterBalances = await getBalances([nToken, nTokenCollateral], [liquidator, borrower]);
        expect(result).toSucceed();
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [nToken, 'cash', repayAmount],
          [nToken, 'borrows', -repayAmount],
          [nToken, liquidator, 'evmos', -gasCost],
          [nToken, liquidator, 'cash', -repayAmount],
          [nTokenCollateral, liquidator, 'evmos', -gasCost],
          [nTokenCollateral, liquidator, 'tokens', seizeTokens],
          [nToken, borrower, 'borrows', -repayAmount],
          [nTokenCollateral, borrower, 'tokens', -seizeTokens]
        ]));
      });
    });
  
    describe('seize', () => {
      // XXX verify callers are properly checked
  
      it("fails if seize is not allowed", async () => {
        await send(nToken.comptroller, 'setSeizeAllowed', [false]);
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
        const beforeBalances = await getBalances([nTokenCollateral], [liquidator, borrower]);
        const result = await seize(nTokenCollateral, liquidator, borrower, seizeTokens);
        const afterBalances = await getBalances([nTokenCollateral], [liquidator, borrower]);
        expect(result).toSucceed();
        expect(result).toHaveLog('Transfer', {
          from: borrower,
          to: liquidator,
          amount: seizeTokens.toString()
        });
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [nTokenCollateral, liquidator, 'tokens', seizeTokens],
          [nTokenCollateral, borrower, 'tokens', -seizeTokens]
        ]));
      });
    });
  });