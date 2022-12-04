const {
    makeComptroller,
    makeNToken,
    enterMarkets,
    quickMint,
    setMarketSupplyCap
  } = require('../Utils/Nemo');
  
  describe('Comptroller', () => {
    let root, accounts;
  
    beforeEach(async () => {
      [root, ...accounts] = saddle.accounts;
    });
  
    describe('liquidity', () => {
      it("fails if a price has not been set", async () => {
        const nToken = await makeNToken({supportMarket: true});
        await enterMarkets([nToken], accounts[1]);
        let result = await call(nToken.comptroller, 'getAccountLiquidity', [accounts[1]]);
        expect(result).toHaveTrollError('PRICE_ERROR');
      });
  
      it("allows a borrow up to collateralFactor, but not more", async () => {
        const collateralFactor = 0.5, underlyingPrice = 1, user = accounts[1], amount = 1e6;
        const nToken = await makeNToken({supportMarket: true, collateralFactor, underlyingPrice});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
  
        let error, liquidity, shortfall;
  
        // not in market yet, hypothetical borrow should have no effect
        ({1: liquidity, 2: shortfall} = await call(nToken.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken._address, 0, amount]));
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber(0);
  
        await enterMarkets([nToken], user);
        await quickMint(nToken, user, amount);
  
        // total account liquidity after supplying `amount`
        ({1: liquidity, 2: shortfall} = await call(nToken.comptroller, 'getAccountLiquidity', [user]));
        expect(liquidity).toEqualNumber(amount * collateralFactor);
        expect(shortfall).toEqualNumber(0);
  
        // hypothetically borrow `amount`, should shortfall over collateralFactor
        ({1: liquidity, 2: shortfall} = await call(nToken.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken._address, 0, amount]));
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber(amount * (1 - collateralFactor));
  
        // hypothetically redeem `amount`, should be back to even
        ({1: liquidity, 2: shortfall} = await call(nToken.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken._address, amount, 0]));
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber(0);
      }, 300000);
  
      it("allows entering 3 markets, supplying to 2 and borrowing up to collateralFactor in the 3rd", async () => {
        const amount1 = 1e6, amount2 = 1e3, user = accounts[1];
        const cf1 = 0.5, cf2 = 0.666, cf3 = 0, up1 = 3, up2 = 2.718, up3 = 1;
        const c1 = amount1 * cf1 * up1, c2 = amount2 * cf2 * up2, collateral = Math.floor(c1 + c2);
        const nToken1 = await makeNToken({supportMarket: true, collateralFactor: cf1, underlyingPrice: up1});
        await setMarketSupplyCap(nToken1.comptroller, [nToken1._address], [100000000000]);
        const nToken2 = await makeNToken({supportMarket: true, comptroller: nToken1.comptroller, collateralFactor: cf2, underlyingPrice: up2});
        await setMarketSupplyCap(nToken2.comptroller, [nToken2._address], [100000000000]);
        const nToken3 = await makeNToken({supportMarket: true, comptroller: nToken1.comptroller, collateralFactor: cf3, underlyingPrice: up3});
        await setMarketSupplyCap(nToken3.comptroller, [nToken3._address], [100000000000]);
  
        await enterMarkets([nToken1, nToken2, nToken3], user);
        await quickMint(nToken1, user, amount1);
        await quickMint(nToken2, user, amount2);
  
        let error, liquidity, shortfall;
  
        ({0: error, 1: liquidity, 2: shortfall} = await call(nToken3.comptroller, 'getAccountLiquidity', [user]));
        expect(error).toEqualNumber(0);
        expect(liquidity).toEqualNumber(collateral);
        expect(shortfall).toEqualNumber(0);
  
        ({1: liquidity, 2: shortfall} = await call(nToken3.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken3._address, Math.floor(c2), 0]));
        expect(liquidity).toEqualNumber(collateral);
        expect(shortfall).toEqualNumber(0);
  
        ({1: liquidity, 2: shortfall} = await call(nToken3.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken3._address, 0, Math.floor(c2)]));
        expect(liquidity).toEqualNumber(c1);
        expect(shortfall).toEqualNumber(0);
  
        ({1: liquidity, 2: shortfall} = await call(nToken3.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken3._address, 0, collateral + c1]));
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber(c1);
  
        ({1: liquidity, 2: shortfall} = await call(nToken1.comptroller, 'getHypotheticalAccountLiquidity', [user, nToken1._address, amount1, 0]));
        expect(liquidity).toEqualNumber(Math.floor(c2));
        expect(shortfall).toEqualNumber(0);
      });
    });
  
    describe("getAccountLiquidity", () => {
      it("returns 0 if not 'in' any markets", async () => {
        const comptroller = await makeComptroller();
        const {0: error, 1: liquidity, 2: shortfall} = await call(comptroller, 'getAccountLiquidity', [accounts[0]]);
        expect(error).toEqualNumber(0);
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber(0);
      });
    });
  
    describe("getHypotheticalAccountLiquidity", () => {
      it("returns 0 if not 'in' any markets", async () => {
        const nToken = await makeNToken();
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        const {0: error, 1: liquidity, 2: shortfall} = await call(nToken.comptroller, 'getHypotheticalAccountLiquidity', [accounts[0], nToken._address, 0, 0]);
        expect(error).toEqualNumber(0);
        expect(liquidity).toEqualNumber(0);
        expect(shortfall).toEqualNumber(0);
      });
  
      it("returns collateral factor times dollar amount of tokens minted in a single market", async () => {
        const collateralFactor = 0.5, exchangeRate = 1, underlyingPrice = 1;
        const nToken = await makeNToken({supportMarket: true, collateralFactor, exchangeRate, underlyingPrice});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        const from = accounts[0], balance = 1e7, amount = 1e6;
        await enterMarkets([nToken], from);
        await send(nToken.underlying, 'harnessSetBalance', [from, balance], {from});
        await send(nToken.underlying, 'approve', [nToken._address, balance], {from});
        await send(nToken, 'mint', [amount], {from});
        const {0: error, 1: liquidity, 2: shortfall} = await call(nToken.comptroller, 'getHypotheticalAccountLiquidity', [from, nToken._address, 0, 0]);
        expect(error).toEqualNumber(0);
        expect(liquidity).toEqualNumber(amount * collateralFactor * exchangeRate * underlyingPrice);
        expect(shortfall).toEqualNumber(0);
      });
    });
  });