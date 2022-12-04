const {
    evmosGasCost,
    evmosUnsigned,
    evmosMantissa
  } = require('../Utils/EVMOS');
  
  const {
    makeNToken,
    balanceOf,
    borrowSnapshot,
    totalBorrows,
    fastForward,
    setBalance,
    preApprove,
    pretendBorrow,
    setEVMOSBalance,
    getBalances,
    adjustBalances
  } = require('../Utils/Nemo');
  
  const BigNumber = require('bignumber.js');
  
  const borrowAmount = evmosUnsigned(10e3);
  const repayAmount = evmosUnsigned(10e2);
  
  async function preBorrow(nToken, borrower, borrowAmount) {
    await send(nToken.comptroller, 'setBorrowAllowed', [true]);
    await send(nToken.comptroller, 'setBorrowVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken, 'harnessSetFailTransferToAddress', [borrower, false]);
    await send(nToken, 'harnessSetAccountBorrows', [borrower, 0, 0]);
    await send(nToken, 'harnessSetTotalBorrows', [0]);
    await setEVMOSBalance(nToken, borrowAmount);
  }
  
  async function borrowFresh(nToken, borrower, borrowAmount) {
    return send(nToken, 'harnessBorrowFresh', [borrower, borrowAmount], {from: borrower});
  }
  
  async function borrow(nToken, borrower, borrowAmount, opts = {}) {
    await send(nToken, 'harnessFastForward', [1]);
    return send(nToken, 'borrow', [borrowAmount], {from: borrower});
  }
  
  async function preRepay(nToken, benefactor, borrower, repayAmount) {
    // setup either benefactor OR borrower for success in repaying
    await send(nToken.comptroller, 'setRepayBorrowAllowed', [true]);
    await send(nToken.comptroller, 'setRepayBorrowVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await pretendBorrow(nToken, borrower, 1, 1, repayAmount);
  }
  
  async function repayBorrowFresh(nToken, payer, borrower, repayAmount) {
    return send(nToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: payer, value: repayAmount});
  }
  
  async function repayBorrow(nToken, borrower, repayAmount) {
    await send(nToken, 'harnessFastForward', [1]);
    return send(nToken, 'repayBorrow', [], {from: borrower, value: repayAmount});
  }
  
  async function repayBorrowBehalf(nToken, payer, borrower, repayAmount) {
    await send(nToken, 'harnessFastForward', [1]);
    return send(nToken, 'repayBorrowBehalf', [borrower], {from: payer, value: repayAmount});
  }
  
  describe('NEVMOS', function () {
    let nToken, root, borrower, benefactor, accounts;
    beforeEach(async () => {
      [root, borrower, benefactor, ...accounts] = saddle.accounts;
      nToken = await makeNToken({kind: 'nevmos', comptrollerOpts: {kind: 'bool'}});
    });
  
    describe('borrowFresh', () => {
      beforeEach(async () => await preBorrow(nToken, borrower, borrowAmount));
  
      it("fails if comptroller tells it to", async () => {
        await send(nToken.comptroller, 'setBorrowAllowed', [false]);
        expect(await borrowFresh(nToken, borrower, borrowAmount)).toHaveTrollReject('BORROW_COMPTROLLER_REJECTION');
      });
  
      it("proceeds if comptroller tells it to", async () => {
        await expect(await borrowFresh(nToken, borrower, borrowAmount)).toSucceed();
      });
  
      it("fails if market not fresh", async () => {
        await fastForward(nToken);
        expect(await borrowFresh(nToken, borrower, borrowAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'BORROW_FRESHNESS_CHECK');
      });
  
      it("continues if fresh", async () => {
        await expect(await send(nToken, 'accrueInterest')).toSucceed();
        await expect(await borrowFresh(nToken, borrower, borrowAmount)).toSucceed();
      });
  
      it("fails if protocol has less than borrowAmount of underlying", async () => {
        expect(await borrowFresh(nToken, borrower, borrowAmount.add(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
      });
  
      it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
        await pretendBorrow(nToken, borrower, 0, 3e18, 5e18);
        expect(await borrowFresh(nToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_ACCUMULATED_BALANCE_CALCULATION_FAILED');
      });
  
      it("fails if calculating account new total borrow balance overflows", async () => {
        await pretendBorrow(nToken, borrower, 1e-18, 1e-18, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
        expect(await borrowFresh(nToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
      });
  
      it("fails if calculation of new total borrow balance overflows", async () => {
        await send(nToken, 'harnessSetTotalBorrows', ['0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF']);
        expect(await borrowFresh(nToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED');
      });
  
      it("reverts if transfer out fails", async () => {
        await send(nToken, 'harnessSetFailTransferToAddress', [borrower, true]);
        await expect(borrowFresh(nToken, borrower, borrowAmount)).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
      });
  
      it("reverts if borrowVerify fails", async() => {
        await send(nToken.comptroller, 'setBorrowVerify', [false]);
        await expect(borrowFresh(nToken, borrower, borrowAmount)).rejects.toRevert("revert borrowVerify rejected borrow");
      });
  
      it("transfers the underlying cash, tokens, and emits Borrow event", async () => {
        const beforeBalances = await getBalances([nToken], [borrower]);
        const beforeProtocolBorrows = await totalBorrows(nToken);
        const result = await borrowFresh(nToken, borrower, borrowAmount);
        const afterBalances = await getBalances([nToken], [borrower]);
        expect(result).toSucceed();
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [nToken, 'evmos', -borrowAmount],
          [nToken, 'borrows', borrowAmount],
          [nToken, borrower, 'evmos', borrowAmount.sub(await evmosGasCost(result))],
          [nToken, borrower, 'borrows', borrowAmount]
        ]));
        expect(result).toHaveLog('Borrow', {
          borrower: borrower,
          borrowAmount: borrowAmount.toString(),
          accountBorrows: borrowAmount.toString(),
          totalBorrows: beforeProtocolBorrows.add(borrowAmount).toString()
        });
      });
  
      it("stores new borrow principal and interest index", async () => {
        const beforeProtocolBorrows = await totalBorrows(nToken);
        await pretendBorrow(nToken, borrower, 0, 3, 0);
        await borrowFresh(nToken, borrower, borrowAmount);
        const borrowSnap = await borrowSnapshot(nToken, borrower);
        expect(borrowSnap.principal).toEqualNumber(borrowAmount);
        expect(borrowSnap.interestIndex).toEqualNumber(evmosMantissa(3));
        expect(await totalBorrows(nToken)).toEqualNumber(beforeProtocolBorrows.add(borrowAmount));
      });
    });
  
    describe('borrow', () => {
      beforeEach(async () => await preBorrow(nToken, borrower, borrowAmount));
  
      it("emits a borrow failure if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await send(nToken, 'harnessFastForward', [1]);
        await expect(borrow(nToken, borrower, borrowAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from borrowFresh without emitting any extra logs", async () => {
        expect(await borrow(nToken, borrower, borrowAmount.add(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
      });
  
      it("returns success from borrowFresh and transfers the correct amount", async () => {
        const beforeBalances = await getBalances([nToken], [borrower]);
        await fastForward(nToken);
        const result = await borrow(nToken, borrower, borrowAmount);
        const afterBalances = await getBalances([nToken], [borrower]);
        expect(result).toSucceed();
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [nToken, 'evmos', -borrowAmount],
          [nToken, 'borrows', borrowAmount],
          [nToken, borrower, 'evmos', borrowAmount.sub(await evmosGasCost(result))],
          [nToken, borrower, 'borrows', borrowAmount]
        ]));
      });
    });
  
    describe('repayBorrowFresh', () => {
      [true, false].forEach(async (benefactorPaying) => {
        let payer;
        const label = benefactorPaying ? "benefactor paying" : "borrower paying";
        describe(label, () => {
          beforeEach(async () => {
            payer = benefactorPaying ? benefactor : borrower;
  
            await preRepay(nToken, payer, borrower, repayAmount);
          });
  
          it("fails if repay is not allowed", async () => {
            await send(nToken.comptroller, 'setRepayBorrowAllowed', [false]);
            expect(await repayBorrowFresh(nToken, payer, borrower, repayAmount)).toHaveTrollReject('REPAY_BORROW_COMPTROLLER_REJECTION', 'MATH_ERROR');
          });
  
          it("fails if block number ≠ current block number", async () => {
            await fastForward(nToken);
            expect(await repayBorrowFresh(nToken, payer, borrower, repayAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'REPAY_BORROW_FRESHNESS_CHECK');
          });
  
          it("returns an error if calculating account new account borrow balance fails", async () => {
            await pretendBorrow(nToken, borrower, 1, 1, 1);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert('revert REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
          });
  
          it("returns an error if calculation of new total borrow balance fails", async () => {
            await send(nToken, 'harnessSetTotalBorrows', [1]);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert('revert REPAY_BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED');
          });
  
          it("reverts if checkTransferIn fails", async () => {
            await expect(
              send(nToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: root, value: repayAmount})
            ).rejects.toRevert("revert sender mismatch");
            await expect(
              send(nToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: payer, value: 1})
            ).rejects.toRevert("revert value mismatch");
          });
  
          it("reverts if repayBorrowVerify fails", async() => {
            await send(nToken.comptroller, 'setRepayBorrowVerify', [false]);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert repayBorrowVerify rejected repayBorrow");
          });
  
          it("transfers the underlying cash, and emits RepayBorrow event", async () => {
            const beforeBalances = await getBalances([nToken], [borrower]);
            const result = await repayBorrowFresh(nToken, payer, borrower, repayAmount);
            const afterBalances = await getBalances([nToken], [borrower]);
            expect(result).toSucceed();
            if (borrower == payer) {
              expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
                [nToken, 'evmos', repayAmount],
                [nToken, 'borrows', -repayAmount],
                [nToken, borrower, 'borrows', -repayAmount],
                [nToken, borrower, 'evmos', -repayAmount.add(await evmosGasCost(result))]
              ]));
            } else {
              expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
                [nToken, 'evmos', repayAmount],
                [nToken, 'borrows', -repayAmount],
                [nToken, borrower, 'borrows', -repayAmount],
              ]));
            }
            expect(result).toHaveLog('RepayBorrow', {
              payer: payer,
              borrower: borrower,
              repayAmount: repayAmount.toString(),
              accountBorrows: "0",
              totalBorrows: "0"
            });
          });
  
          it("stores new borrow principal and interest index", async () => {
            const beforeProtocolBorrows = await totalBorrows(nToken);
            const beforeAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
            expect(await repayBorrowFresh(nToken, payer, borrower, repayAmount)).toSucceed();
            const afterAccountBorrows = await borrowSnapshot(nToken, borrower);
            expect(afterAccountBorrows.principal).toEqualNumber(beforeAccountBorrowSnap.principal.sub(repayAmount));
            expect(afterAccountBorrows.interestIndex).toEqualNumber(evmosMantissa(1));
            expect(await totalBorrows(nToken)).toEqualNumber(beforeProtocolBorrows.sub(repayAmount));
          });
        });
      });
    });
  
    describe('repayBorrow', () => {
      beforeEach(async () => {
        await preRepay(nToken, borrower, borrower, repayAmount);
      });
  
      it("reverts if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(repayBorrow(nToken, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("reverts when repay borrow fresh fails", async () => {
        await send(nToken.comptroller, 'setRepayBorrowAllowed', [false]);
        await expect(repayBorrow(nToken, borrower, repayAmount)).rejects.toRevertWithError('COMPTROLLER_REJECTION', "revert repayBorrow failed");
      });
  
      it("returns success from repayBorrowFresh and repays the right amount", async () => {
        await fastForward(nToken);
        const beforeAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(await repayBorrow(nToken, borrower, repayAmount)).toSucceed();
        const afterAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.sub(repayAmount));
      });
  
      it("reverts if overpaying", async () => {
        const beforeAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        let tooMuch = new BigNumber(beforeAccountBorrowSnap.principal).plus(1);
        await expect(repayBorrow(nToken, borrower, tooMuch)).rejects.toRevert("revert REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED");
        // await assert.toRevertWithError(repayBorrow(nToken, borrower, tooMuch), 'MATH_ERROR', "revert repayBorrow failed");
      });
    });
  
    describe('repayBorrowBehalf', () => {
      let payer;
  
      beforeEach(async () => {
        payer = benefactor;
        await preRepay(nToken, payer, borrower, repayAmount);
      });
  
      it("reverts if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(repayBorrowBehalf(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("reverts from within repay borrow fresh", async () => {
        await send(nToken.comptroller, 'setRepayBorrowAllowed', [false]);
        await expect(repayBorrowBehalf(nToken, payer, borrower, repayAmount)).rejects.toRevertWithError('COMPTROLLER_REJECTION', "revert repayBorrowBehalf failed");
      });
  
      it("returns success from repayBorrowFresh and repays the right amount", async () => {
        await fastForward(nToken);
        const beforeAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(await repayBorrowBehalf(nToken, payer, borrower, repayAmount)).toSucceed();
        const afterAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.sub(repayAmount));
      });
    });
  });