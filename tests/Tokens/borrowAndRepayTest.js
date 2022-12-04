const {
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
    pretendBorrow
  } = require('../Utils/Nemo');
  
  const borrowAmount = evmosUnsigned(10e3);
  const repayAmount = evmosUnsigned(10e2);
  
  async function preBorrow(nToken, borrower, borrowAmount) {
    await send(nToken.comptroller, 'setBorrowAllowed', [true]);
    await send(nToken.comptroller, 'setBorrowVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken.underlying, 'harnessSetBalance', [nToken._address, borrowAmount]);
    await send(nToken, 'harnessSetFailTransferToAddress', [borrower, false]);
    await send(nToken, 'harnessSetAccountBorrows', [borrower, 0, 0]);
    await send(nToken, 'harnessSetTotalBorrows', [0]);
  }
  
  async function borrowFresh(nToken, borrower, borrowAmount) {
    return send(nToken, 'harnessBorrowFresh', [borrower, borrowAmount]);
  }
  
  async function borrow(nToken, borrower, borrowAmount, opts = {}) {
    // make sure to have a block delta so we accrue interest
    await send(nToken, 'harnessFastForward', [1]);
    return send(nToken, 'borrow', [borrowAmount], {from: borrower});
  }
  
  async function preRepay(nToken, benefactor, borrower, repayAmount) {
    // setup either benefactor OR borrower for success in repaying
    await send(nToken.comptroller, 'setRepayBorrowAllowed', [true]);
    await send(nToken.comptroller, 'setRepayBorrowVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [benefactor, false]);
    await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [borrower, false]);
    await pretendBorrow(nToken, borrower, 1, 1, repayAmount);
    await preApprove(nToken, benefactor, repayAmount);
    await preApprove(nToken, borrower, repayAmount);
  }
  
  async function repayBorrowFresh(nToken, payer, borrower, repayAmount) {
    return send(nToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: payer});
  }
  
  async function repayBorrow(nToken, borrower, repayAmount) {
    // make sure to have a block delta so we accrue interest
    await send(nToken, 'harnessFastForward', [1]);
    return send(nToken, 'repayBorrow', [repayAmount], {from: borrower});
  }
  
  async function repayBorrowBehalf(nToken, payer, borrower, repayAmount) {
    // make sure to have a block delta so we accrue interest
    await send(nToken, 'harnessFastForward', [1]);
    return send(nToken, 'repayBorrowBehalf', [borrower, repayAmount], {from: payer});
  }
  
  describe('NToken', function () {
    let nToken, root, borrower, benefactor, accounts;
    beforeEach(async () => {
      [root, borrower, benefactor, ...accounts] = saddle.accounts;
      nToken = await makeNToken({comptrollerOpts: {kind: 'bool'}});
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
  
      it("fails if error if protocol has less than borrowAmount of underlying", async () => {
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
  
      it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
        const beforeProtocolCash = await balanceOf(nToken.underlying, nToken._address);
        const beforeProtocolBorrows = await totalBorrows(nToken);
        const beforeAccountCash = await balanceOf(nToken.underlying, borrower);
        const result = await borrowFresh(nToken, borrower, borrowAmount);
        expect(result).toSucceed();
        expect(await balanceOf(nToken.underlying, borrower)).toEqualNumber(beforeAccountCash.add(borrowAmount));
        expect(await balanceOf(nToken.underlying, nToken._address)).toEqualNumber(beforeProtocolCash.sub(borrowAmount));
        expect(await totalBorrows(nToken)).toEqualNumber(beforeProtocolBorrows.add(borrowAmount));
        expect(result).toHaveLog('Transfer', {
          from: nToken._address,
          to: borrower,
          amount: borrowAmount.toString()
        });
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
        await expect(borrow(nToken, borrower, borrowAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from borrowFresh without emitting any extra logs", async () => {
        expect(await borrow(nToken, borrower, borrowAmount.add(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
      });
  
      it("returns success from borrowFresh and transfers the correct amount", async () => {
        const beforeAccountCash = await balanceOf(nToken.underlying, borrower);
        await fastForward(nToken);
        expect(await borrow(nToken, borrower, borrowAmount)).toSucceed();
        expect(await balanceOf(nToken.underlying, borrower)).toEqualNumber(beforeAccountCash.add(borrowAmount));
      });
    });
  
    describe('repayBorrowFresh', () => {
      [true, false].forEach((benefactorIsPayer) => {
        let payer;
        const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
        describe(label, () => {
          beforeEach(async () => {
            payer = benefactorIsPayer ? benefactor : borrower;
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
  
          it("fails if insufficient approval", async() => {
            await preApprove(nToken, payer, 1);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert('revert Insufficient allowance');
          });
  
          it("fails if insufficient balance", async() => {
            await setBalance(nToken.underlying, payer, 1);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert('revert Insufficient balance');
          });
  
  
          it("returns an error if calculating account new account borrow balance fails", async () => {
            await pretendBorrow(nToken, borrower, 1, 1, 1);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED");
          });
  
          it("returns an error if calculation of new total borrow balance fails", async () => {
            await send(nToken, 'harnessSetTotalBorrows', [1]);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert REPAY_BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED");
          });
  
  
          it("reverts if doTransferIn fails", async () => {
            await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [payer, true]);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert TOKEN_TRANSFER_IN_FAILED");
          });
  
          it("reverts if repayBorrowVerify fails", async() => {
            await send(nToken.comptroller, 'setRepayBorrowVerify', [false]);
            await expect(repayBorrowFresh(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert repayBorrowVerify rejected repayBorrow");
          });
  
          it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
            const beforeProtocolCash = await balanceOf(nToken.underlying, nToken._address);
            const result = await repayBorrowFresh(nToken, payer, borrower, repayAmount);
            expect(await balanceOf(nToken.underlying, nToken._address)).toEqualNumber(beforeProtocolCash.add(repayAmount));
            expect(result).toHaveLog('Transfer', {
              from: payer,
              to: nToken._address,
              amount: repayAmount.toString()
            });
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
  
      it("emits a repay borrow failure if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(repayBorrow(nToken, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
        await setBalance(nToken.underlying, borrower, 1);
        await expect(repayBorrow(nToken, borrower, repayAmount)).rejects.toRevert('revert Insufficient balance');
      });
  
      it("returns success from repayBorrowFresh and repays the right amount", async () => {
        await fastForward(nToken);
        const beforeAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(await repayBorrow(nToken, borrower, repayAmount)).toSucceed();
        const afterAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.sub(repayAmount));
      });
  
      it("repays the full amount owed if payer has enough", async () => {
        await fastForward(nToken);
        expect(await repayBorrow(nToken, borrower, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toSucceed();
        const afterAccountBorrowSnap = await borrowSnapshot(nToken, borrower);
        expect(afterAccountBorrowSnap.principal).toEqualNumber(0);
      });
  
      it("fails gracefully if payer does not have enough", async () => {
        await setBalance(nToken.underlying, borrower, 3);
        await fastForward(nToken);
        await expect(repayBorrow(nToken, borrower, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).rejects.toRevert('revert Insufficient balance');
      });
    });
  
    describe('repayBorrowBehalf', () => {
      let payer;
  
      beforeEach(async () => {
        payer = benefactor;
        await preRepay(nToken, payer, borrower, repayAmount);
      });
  
      it("emits a repay borrow failure if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(repayBorrowBehalf(nToken, payer, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
        await setBalance(nToken.underlying, payer, 1);
        await expect(repayBorrowBehalf(nToken, payer, borrower, repayAmount)).rejects.toRevert('revert Insufficient balance');
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