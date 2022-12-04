const { address, evmosMantissa } = require('../Utils/EVMOS');

const { makeComptroller, makeNToken, makePriceOracle } = require('../Utils/Nemo');

describe('Comptroller', function() {
  let root, accounts;
  let unitroller;
  let brains;
  let oracle;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    oracle = await makePriceOracle();
    brains = await deploy('Comptroller');
    unitroller = await deploy('Unitroller');
  });

  let initializeBrains = async (priceOracle, closeFactor) => {
    await send(unitroller, '_setPendingImplementation', [brains._address]);
    await send(brains, '_become', [unitroller._address]);
    const unitrollerAsBrain = await saddle.getContractAt('Comptroller', unitroller._address);
    await send(unitrollerAsBrain, '_setPriceOracle', [priceOracle._address]);
    await send(unitrollerAsBrain, '_setCloseFactor', [closeFactor]);
    await send(unitrollerAsBrain, '_setLiquidationIncentive', [evmosMantissa(1)]);
    return unitrollerAsBrain;
  };

  describe('delegating to comptroller', () => {
    const closeFactor = evmosMantissa(0.051);
    let unitrollerAsComptroller, nToken;

    beforeEach(async () => {
      unitrollerAsComptroller = await initializeBrains(oracle, evmosMantissa(0.06));
      nToken = await makeNToken({ comptroller: unitrollerAsComptroller });
    });

    describe('becoming brains sets initial state', () => {
      it('reverts if this is not the pending implementation', async () => {
        await expect(
          send(brains, '_become', [unitroller._address])
        ).rejects.toRevert('revert not authorized');
      });

      it('on success it sets admin to caller of constructor', async () => {
        expect(await call(unitrollerAsComptroller, 'admin')).toEqual(root);
        expect(await call(unitrollerAsComptroller, 'pendingAdmin')).toBeAddressZero();
      });

      it('on success it sets closeFactor as specified', async () => {
        const comptroller = await initializeBrains(oracle, closeFactor);
        expect(await call(comptroller, 'closeFactorMantissa')).toEqualNumber(closeFactor);
      });
    });

    describe('_setCollateralFactor', () => {
      const half = evmosMantissa(0.5),
        one = evmosMantissa(1);

      it('fails if not called by admin', async () => {
        await expect(
          send(unitrollerAsComptroller, '_setCollateralFactor', [nToken._address, half], {
            from: accounts[1]
          })
        ).rejects.toRevert('revert only admin can');
      });

      it('fails if asset is not listed', async () => {
        await expect(
          send(unitrollerAsComptroller, '_setCollateralFactor', [nToken._address, half])
        ).rejects.toRevert('revert market not listed');
      });

      it('fails if factor is too high', async () => {
        const nToken = await makeNToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [nToken._address, one])
        ).toHaveTrollFailure('INVALID_COLLATERAL_FACTOR', 'SET_COLLATERAL_FACTOR_VALIDATION');
      });

      it('fails if factor is set without an underlying price', async () => {
        const nToken = await makeNToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [nToken._address, half])
        ).toHaveTrollFailure('PRICE_ERROR', 'SET_COLLATERAL_FACTOR_WITHOUT_PRICE');
      });

      it('succeeds and sets market', async () => {
        const nToken = await makeNToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        await send(oracle, 'setUnderlyingPrice', [nToken._address, 1]);
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [nToken._address, half])
        ).toHaveLog('NewCollateralFactor', {
          nToken: nToken._address,
          oldCollateralFactorMantissa: '0',
          newCollateralFactorMantissa: half.toString()
        });
      });
    });

    describe('_supportMarket', () => {
      it('fails if not called by admin', async () => {
        await expect(
          send(unitrollerAsComptroller, '_supportMarket', [nToken._address], { from: accounts[1] })
        ).rejects.toRevert('revert only admin can');
      });

      it('fails if asset is not a NToken', async () => {
        const notAnToken = await makePriceOracle();
        await expect(send(unitrollerAsComptroller, '_supportMarket', [notAnToken._address])).rejects.toRevert();
      });

      it('succeeds and sets market', async () => {
        const result = await send(unitrollerAsComptroller, '_supportMarket', [nToken._address]);
        expect(result).toHaveLog('MarketListed', { nToken: nToken._address });
      });

      it('cannot list a market a second time', async () => {
        const result1 = await send(unitrollerAsComptroller, '_supportMarket', [nToken._address]);
        const result2 = await send(unitrollerAsComptroller, '_supportMarket', [nToken._address]);
        expect(result1).toHaveLog('MarketListed', { nToken: nToken._address });
        expect(result2).toHaveTrollFailure('MARKET_ALREADY_LISTED', 'SUPPORT_MARKET_EXISTS');
      });

      it('can list two different markets', async () => {
        const nToken1 = await makeNToken({ comptroller: unitroller });
        const nToken2 = await makeNToken({ comptroller: unitroller });
        const result1 = await send(unitrollerAsComptroller, '_supportMarket', [nToken1._address]);
        const result2 = await send(unitrollerAsComptroller, '_supportMarket', [nToken2._address]);
        expect(result1).toHaveLog('MarketListed', { nToken: nToken1._address });
        expect(result2).toHaveLog('MarketListed', { nToken: nToken2._address });
      });
    });
  });
});