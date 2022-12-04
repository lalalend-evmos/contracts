const {evmosUnsigned} = require('../Utils/EVMOS');
const {
  makeComptroller,
  makeNToken,
  setOraclePrice,
  setOraclePriceFromMantissa
} = require('../Utils/Nemo');

const borrowedPrice = 1e18;
const collateralPrice = 1e18;
const repayAmount = evmosUnsigned(1e18);

async function sebCalculateSeizeTokens(comptroller, nTokenCollateral, repayAmount) {
  return call(comptroller, 'liquidateSEBCalculateSeizeTokens', [nTokenCollateral._address, repayAmount]);
}

function rando(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe('Comptroller', () => {
  let root, accounts;
  let comptroller, sebcontroller, seb, nTokenCollateral;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    sebcontroller = comptroller.sebcontroller;
    seb = comptroller.seb;
    nTokenCollateral = await makeNToken({comptroller: comptroller, underlyingPrice: 0});
  });

  beforeEach(async () => {
    await setOraclePrice(nTokenCollateral, collateralPrice);
    await send(nTokenCollateral, 'harnessExchangeRateDetails', [8e10, 4e10, 0]);
  });

  describe('liquidateSEBCalculateAmountSeize', () => {
    it("fails if either asset price is 0", async () => {
      await setOraclePrice(nTokenCollateral, 0);
      expect(
        await sebCalculateSeizeTokens(comptroller, nTokenCollateral, repayAmount)
      ).toHaveTrollErrorTuple(['PRICE_ERROR', 0]);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(
        sebCalculateSeizeTokens(comptroller, nTokenCollateral, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      await send(nTokenCollateral, 'harnessExchangeRateDetails', [1, 0, 10]); // (1 - 10) -> underflow
      await expect(
        send(comptroller, 'liquidateSEBCalculateSeizeTokens', [nTokenCollateral._address, repayAmount])
      ).rejects.toRevert("revert exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 1e18, 771.32e18, 1.3e18, 10002.45e18],
      [ 7.009232529961056e+24,1e18,2.6177112093242585e+23,1179713989619784000,7.790468414639561e+24 ],
      [rando(0, 1e25), 1e18, rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)]
    ].forEach((testCase) => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase.map(evmosUnsigned);

        await setOraclePriceFromMantissa(nTokenCollateral, collateralPrice);
        await send(comptroller, '_setLiquidationIncentive', [liquidationIncentive]);
        await send(nTokenCollateral, 'harnessSetExchangeRate', [exchangeRate]);

        const seizeAmount = repayAmount.mul(liquidationIncentive).mul(borrowedPrice).div(collateralPrice);
        const seizeTokens = seizeAmount.div(exchangeRate);

        expect(
          await sebCalculateSeizeTokens(comptroller, nTokenCollateral, repayAmount)
        ).toHaveTrollErrorTuple(
          ['NO_ERROR', Number(seizeTokens)],
          (x, y) => Math.abs(x - y) < 1e7
        );
      });
    });
  });
});