const {evmosUnsigned} = require('../Utils/EVMOS');
const {
  makeComptroller,
  makeNToken,
  setOraclePrice
} = require('../Utils/Nemo');

const borrowedPrice = 2e10;
const collateralPrice = 1e18;
const repayAmount = evmosUnsigned(1e18);

async function calculateSeizeTokens(comptroller, nTokenBorrowed, nTokenCollateral, repayAmount) {
  return call(comptroller, 'liquidateCalculateSeizeTokens', [nTokenBorrowed._address, nTokenCollateral._address, repayAmount]);
}

function rando(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe('Comptroller', () => {
  let root, accounts;
  let comptroller, nTokenBorrowed, nTokenCollateral;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    nTokenBorrowed = await makeNToken({comptroller: comptroller, underlyingPrice: 0});
    nTokenCollateral = await makeNToken({comptroller: comptroller, underlyingPrice: 0});
  });

  beforeEach(async () => {
    await setOraclePrice(nTokenBorrowed, borrowedPrice);
    await setOraclePrice(nTokenCollateral, collateralPrice);
    await send(nTokenCollateral, 'harnessExchangeRateDetails', [8e10, 4e10, 0]);
  });

  describe('liquidateCalculateAmountSeize', () => {
    it("fails if either asset price is 0", async () => {
      await setOraclePrice(nTokenBorrowed, 0);
      expect(
        await calculateSeizeTokens(comptroller, nTokenBorrowed, nTokenCollateral, repayAmount)
      ).toHaveTrollErrorTuple(['PRICE_ERROR', 0]);

      await setOraclePrice(nTokenCollateral, 0);
      expect(
        await calculateSeizeTokens(comptroller, nTokenBorrowed, nTokenCollateral, repayAmount)
      ).toHaveTrollErrorTuple(['PRICE_ERROR', 0]);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(
        calculateSeizeTokens(comptroller, nTokenBorrowed, nTokenCollateral, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("fails if the borrowed asset price causes overflow ", async () => {
      await setOraclePrice(nTokenBorrowed, -1);
      await expect(
        calculateSeizeTokens(comptroller, nTokenBorrowed, nTokenCollateral, repayAmount)
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      await send(nTokenCollateral, 'harnessExchangeRateDetails', [1, 0, 10]); // (1 - 10) -> underflow
      await expect(
        send(comptroller, 'liquidateCalculateSeizeTokens', [nTokenBorrowed._address, nTokenCollateral._address, repayAmount])
      ).rejects.toRevert("revert exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 2e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 5.230480842e18, 771.32e18, 1.3e18, 10002.45e18],
      [ 7.009232529961056e+24,2.5278726317240445e+24,2.6177112093242585e+23,1179713989619784000,7.790468414639561e+24 ],
      [rando(0, 1e25), rando(0, 1e25), rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)]
    ].forEach((testCase) => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase.map(evmosUnsigned);
        
        await setOraclePrice(nTokenCollateral, collateralPrice);
        await setOraclePrice(nTokenBorrowed, borrowedPrice);
        await send(comptroller, '_setLiquidationIncentive', [liquidationIncentive]);
        await send(nTokenCollateral, 'harnessSetExchangeRate', [exchangeRate]);

        const seizeAmount = repayAmount.mul(liquidationIncentive).mul(borrowedPrice).div(collateralPrice);
        const seizeTokens = seizeAmount.div(exchangeRate);

        expect(
          await calculateSeizeTokens(comptroller, nTokenBorrowed, nTokenCollateral, repayAmount)
        ).toHaveTrollErrorTuple(
          ['NO_ERROR', Number(seizeTokens)],
          (x, y) => Math.abs(x - y) < 1e7
        );
      });
    });
  });
});