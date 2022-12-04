const {
    evmosUnsigned,
    evmosMantissa
  } = require('../Utils/EVMOS');
  
  const {
    makeNToken,
    setBorrowRate,
    pretendBorrow,
    setMarketSupplyCap
  } = require('../Utils/Nemo');
  
  describe('NToken', function () {
    let root, admin, accounts;
    beforeEach(async () => {
      [root, admin, ...accounts] = saddle.accounts;
    });
   
    describe('constructor', () => {
      it("fails when non bep-20 underlying", async () => {
        await expect(makeNToken({ underlying: { _address: root } })).rejects.toRevert("revert");
      });
  
      it("fails when 0 initial exchange rate", async () => {
        await expect(makeNToken({ exchangeRate: 0 })).rejects.toRevert("revert initial exchange rate must be greater than zero.");
      });
  
      it("succeeds with bep-20 underlying and non-zero exchange rate", async () => {
        const nToken = await makeNToken();
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        expect(await call(nToken, 'underlying')).toEqual(nToken.underlying._address);
        expect(await call(nToken, 'admin')).toEqual(root);
      });
  
      it("succeeds when setting admin to contructor argument", async () => {
        const nToken = await makeNToken({ admin: admin });
        expect(await call(nToken, 'admin')).toEqual(admin);
      });
    });
  
    describe('name, symbol, decimals', () => {
      let nToken;
  
      beforeEach(async () => {
        nToken = await makenToken({ name: "NToken Foo", symbol: "cFOO", decimals: 10 });
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
      });
  
      it('should return correct name', async () => {
        expect(await call(nToken, 'name')).toEqual("NToken Foo");
      });
  
      it('should return correct symbol', async () => {
        expect(await call(nToken, 'symbol')).toEqual("cFOO");
      });
  
      it('should return correct decimals', async () => {
        expect(await call(nToken, 'decimals')).toEqualNumber(10);
      });
    });
  
    describe('balanceOfUnderlying', () => {
      it("has an underlying balance", async () => {
        const nToken = await makeNToken({ supportMarket: true, exchangeRate: 2 });
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        await send(nToken, 'harnessSetBalance', [root, 100]);
        expect(await call(nToken, 'balanceOfUnderlying', [root])).toEqualNumber(200);
      });
    });
  
    describe('borrowRatePerBlock', () => {
      it("has a borrow rate", async () => {
        const nToken = await makeNToken({ supportMarket: true, interestRateModelOpts: { kind: 'jump-rate', baseRate: .05, multiplier: 0.45, kink: 0.95, jump: 5 } });
        const blocksPerYear = await call(nToken.interestRateModel, 'blocksPerYear');
        const perBlock = await call(nToken, 'borrowRatePerBlock');
        expect(Math.abs(perBlock * blocksPerYear - 5e16)).toBeLessThanOrEqual(1e8);
      });
    });
  
    describe('supplyRatePerBlock', () => {
      it("returns 0 if there's no supply", async () => {
        const nToken = await makeNToken({ supportMarket: true, interestRateModelOpts: { kind: 'jump-rate', baseRate: .05, multiplier: 0.45, kink: 0.95, jump: 5 } });
        const perBlock = await call(nToken, 'supplyRatePerBlock');
        await expect(perBlock).toEqualNumber(0);
      });
  
      it("has a supply rate", async () => {
        const baseRate = 0.05;
        const multiplier = 0.45;
        const kink = 0.95;
        const jump = 5 * multiplier;
        const nToken = await makeNToken({ supportMarket: true, interestRateModelOpts: { kind: 'jump-rate', baseRate, multiplier, kink, jump } });
        await send(nToken, 'harnessSetReserveFactorFresh', [evmosMantissa(.01)]);
        await send(nToken, 'harnessExchangeRateDetails', [1, 1, 0]);
        await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(1)]);
        // Full utilization (Over the kink so jump is included), 1% reserves
        const borrowRate = baseRate + multiplier * kink + jump * .05;
        const expectedSuplyRate = borrowRate * .99;
  
        const blocksPerYear = await call(nToken.interestRateModel, 'blocksPerYear');
        const perBlock = await call(nToken, 'supplyRatePerBlock');
        expect(Math.abs(perBlock * blocksPerYear - expectedSuplyRate * 1e18)).toBeLessThanOrEqual(1e8);
      });
    });
  
    describe("borrowBalanceCurrent", () => {
      let borrower;
      let nToken;
  
      beforeEach(async () => {
        borrower = accounts[0];
        nToken = await makenToken();
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
      });
  
      beforeEach(async () => {
        await setBorrowRate(nToken, .001)
        await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
      });
  
      it("reverts if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        // make sure we accrue interest
        await send(nToken, 'harnessFastForward', [1]);
        await expect(send(nToken, 'borrowBalanceCurrent', [borrower])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns successful result from borrowBalanceStored with no interest", async () => {
        await setBorrowRate(nToken, 0);
        await pretendBorrow(nToken, borrower, 1, 1, 5e18);
        expect(await call(nToken, 'borrowBalanceCurrent', [borrower])).toEqualNumber(5e18)
      });
  
      it("returns successful result from borrowBalanceCurrent with no interest", async () => {
        await setBorrowRate(nToken, 0);
        await pretendBorrow(nToken, borrower, 1, 3, 5e18);
        expect(await send(nToken, 'harnessFastForward', [5])).toSucceed();
        expect(await call(nToken, 'borrowBalanceCurrent', [borrower])).toEqualNumber(5e18 * 3)
      });
    });
  
    describe("borrowBalanceStored", () => {
      let borrower;
      let nToken;
  
      beforeEach(async () => {
        borrower = accounts[0];
        nToken = await makeNToken({ comptrollerOpts: { kind: 'bool' } });
      });
  
      it("returns 0 for account with no borrows", async () => {
        expect(await call(nToken, 'borrowBalanceStored', [borrower])).toEqualNumber(0)
      });
  
      it("returns stored principal when account and market indexes are the same", async () => {
        await pretendBorrow(nToken, borrower, 1, 1, 5e18);
        expect(await call(nToken, 'borrowBalanceStored', [borrower])).toEqualNumber(5e18);
      });
  
      it("returns calculated balance when market index is higher than account index", async () => {
        await pretendBorrow(nToken, borrower, 1, 3, 5e18);
        expect(await call(nToken, 'borrowBalanceStored', [borrower])).toEqualNumber(5e18 * 3);
      });
  
      it("has undefined behavior when market index is lower than account index", async () => {
        // The market index < account index should NEVER happen, so we don't test this case
      });
  
      it("reverts on overflow of principal", async () => {
        await pretendBorrow(nToken, borrower, 1, 3, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
        await expect(call(nToken, 'borrowBalanceStored', [borrower])).rejects.toRevert("revert borrowBalanceStored: borrowBalanceStoredInternal failed");
      });
  
      it("reverts on non-zero stored principal with zero account index", async () => {
        await pretendBorrow(nToken, borrower, 0, 3, 5);
        await expect(call(nToken, 'borrowBalanceStored', [borrower])).rejects.toRevert("revert borrowBalanceStored: borrowBalanceStoredInternal failed");
      });
    });
  
    describe('exchangeRateStored', () => {
      let nToken, exchangeRate = 2;
  
      beforeEach(async () => {
        nToken = await makeNToken({ exchangeRate });
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
      });
  
      it("returns initial exchange rate with zero nTokenSupply", async () => {
        const result = await call(nToken, 'exchangeRateStored');
        expect(result).toEqualNumber(evmosMantissa(exchangeRate));
      });
  
      it("calculates with single nTokenSupply and single total borrow", async () => {
        const nTokenSupply = 1, totalBorrows = 1, totalReserves = 0;
        await send(nToken, 'harnessExchangeRateDetails', [nTokenSupply, totalBorrows, totalReserves]);
        const result = await call(nToken, 'exchangeRateStored');
        expect(result).toEqualNumber(evmosMantissa(1));
      });
  
      it("calculates with nTokenSupply and total borrows", async () => {
        const nTokenSupply = 100e18, totalBorrows = 10e18, totalReserves = 0;
        await send(nToken, 'harnessExchangeRateDetails', [nTokenSupply, totalBorrows, totalReserves].map(evmosUnsigned));
        const result = await call(nToken, 'exchangeRateStored');
        expect(result).toEqualNumber(evmosMantissa(.1));
      });
  
      it("calculates with cash and nTokenSupply", async () => {
        const nTokenSupply = 5e18, totalBorrows = 0, totalReserves = 0;
        expect(
          await send(nToken.underlying, 'transfer', [nToken._address, evmosMantissa(500)])
        ).toSucceed();
        await send(nToken, 'harnessExchangeRateDetails', [nTokenSupply, totalBorrows, totalReserves].map(evmosUnsigned));
        const result = await call(nToken, 'exchangeRateStored');
        expect(result).toEqualNumber(evmosMantissa(100));
      });
  
      it("calculates with cash, borrows, reserves and nTokenSupply", async () => {
        const nTokenSupply = 500e18, totalBorrows = 500e18, totalReserves = 5e18;
        expect(
          await send(nToken.underlying, 'transfer', [nToken._address, evmosMantissa(500)])
        ).toSucceed();
        await send(nToken, 'harnessExchangeRateDetails', [nTokenSupply, totalBorrows, totalReserves].map(evmosUnsigned));
        const result = await call(nToken, 'exchangeRateStored');
        expect(result).toEqualNumber(evmosMantissa(1.99));
      });
    });
  
    describe('getCash', () => {
      it("gets the cash", async () => {
        const nToken = await makeNToken();
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        const result = await call(nToken, 'getCash');
        expect(result).toEqualNumber(0);
      });
    });
  });