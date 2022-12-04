const {
    evmosMantissa,
    evmosUnsigned
  } = require('../Utils/EVMOS');
  const {
    makeNToken,
    setBorrowRate
  } = require('../Utils/Nemo');
  
  const blockNumber = 2e7;
  const borrowIndex = 1e18;
  const borrowRate = .000001;
  
  async function pretendBlock(nToken, accrualBlock = blockNumber, deltaBlocks = 1) {
    await send(nToken, 'harnessSetAccrualBlockNumber', [evmosUnsigned(blockNumber)]);
    await send(nToken, 'harnessSetBlockNumber', [evmosUnsigned(blockNumber + deltaBlocks)]);
    await send(nToken, 'harnessSetBorrowIndex', [evmosUnsigned(borrowIndex)]);
  }
  
  async function preAccrue(nToken) {
    await setBorrowRate(nToken, borrowRate);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken, 'harnessExchangeRateDetails', [0, 0, 0]);
  }
  
  describe('nToken', () => {
    let root, accounts;
    let nToken;
    beforeEach(async () => {
      [root, ...accounts] = saddle.accounts;
      nToken = await makeNToken({comptrollerOpts: {kind: 'bool'}});
    });
  
    beforeEach(async () => {
      await preAccrue(nToken);
    });
  
    describe('accrueInterest', () => {
      it('reverts if the interest rate is absurdly high', async () => {
        await pretendBlock(nToken, blockNumber, 1);
        expect(await call(nToken, 'getBorrowRateMaxMantissa')).toEqualNumber(evmosMantissa(0.000005)); // 0.0005% per block
        await setBorrowRate(nToken, 0.001e-2); // 0.0010% per block
        await expect(send(nToken, 'accrueInterest')).rejects.toRevert("revert borrow rate is absurdly high");
      });
  
      it('fails if new borrow rate calculation fails', async () => {
        await pretendBlock(nToken, blockNumber, 1);
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(send(nToken, 'accrueInterest')).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it('fails if simple interest factor calculation fails', async () => {
        await pretendBlock(nToken, blockNumber, 5e70);
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_SIMPLE_INTEREST_FACTOR_CALCULATION_FAILED');
      });
  
      it('fails if new borrow index calculation fails', async () => {
        await pretendBlock(nToken, blockNumber, 5e60);
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED');
      });
  
      it('fails if new borrow interest index calculation fails', async () => {
        await pretendBlock(nToken)
        await send(nToken, 'harnessSetBorrowIndex', ['0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF']);
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED');
      });
  
      it('fails if interest accumulated calculation fails', async () => {
        await send(nToken, 'harnessExchangeRateDetails', [0, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 0]);
        await pretendBlock(nToken)
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_ACCUMULATED_INTEREST_CALCULATION_FAILED');
      });
  
      it('fails if new total borrows calculation fails', async () => {
        await setBorrowRate(nToken, 1e-18);
        await pretendBlock(nToken)
        await send(nToken, 'harnessExchangeRateDetails', [0, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 0]);
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_BORROWS_CALCULATION_FAILED');
      });
  
      it('fails if interest accumulated for reserves calculation fails', async () => {
        await setBorrowRate(nToken, .000001);
        await send(nToken, 'harnessExchangeRateDetails', [0, evmosUnsigned(1e30), '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF']);
        await send(nToken, 'harnessSetReserveFactorFresh', [evmosUnsigned(1e10)]);
        await pretendBlock(nToken, blockNumber, 5e20)
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED');
      });
  
      it('fails if new total reserves calculation fails', async () => {
        await setBorrowRate(nToken, 1e-18);
        await send(nToken, 'harnessExchangeRateDetails', [0, evmosUnsigned(1e56), '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF']);
        await send(nToken, 'harnessSetReserveFactorFresh', [evmosUnsigned(1e17)]);
        await pretendBlock(nToken)
        expect(await send(nToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED');
      });
  
      it('succeeds and saves updated values in storage on success', async () => {
        const startingTotalBorrows = 1e22;
        const startingTotalReserves = 1e20;
        const reserveFactor = 1e17;
  
        await send(nToken, 'harnessExchangeRateDetails', [0, evmosUnsigned(startingTotalBorrows), evmosUnsigned(startingTotalReserves)]);
        await send(nToken, 'harnessSetReserveFactorFresh', [evmosUnsigned(reserveFactor)]);
        await pretendBlock(nToken)
  
        const expectedAccrualBlockNumber = blockNumber + 1;
        const expectedBorrowIndex = borrowIndex + borrowIndex * borrowRate;
        const expectedTotalBorrows = startingTotalBorrows + startingTotalBorrows * borrowRate;
        const expectedTotalReserves = startingTotalReserves + startingTotalBorrows *  borrowRate * reserveFactor / 1e18;
  
        const receipt = await send(nToken, 'accrueInterest')
        expect(receipt).toSucceed();
        expect(receipt).toHaveLog('AccrueInterest', {
          cashPrior: 0,
          interestAccumulated: evmosUnsigned(expectedTotalBorrows).sub(evmosUnsigned(startingTotalBorrows)).toFixed(),
          borrowIndex: evmosUnsigned(expectedBorrowIndex).toFixed(),
          totalBorrows: evmosUnsigned(expectedTotalBorrows).toFixed()
        })
        expect(await call(nToken, 'accrualBlockNumber')).toEqualNumber(expectedAccrualBlockNumber);
        expect(await call(nToken, 'borrowIndex')).toEqualNumber(expectedBorrowIndex);
        expect(await call(nToken, 'totalBorrows')).toEqualNumber(expectedTotalBorrows);
        expect(await call(nToken, 'totalReserves')).toEqualNumber(expectedTotalReserves);
      });
    });
  });