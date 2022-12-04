const BigNumber = require('bignumber.js');
const {
  evmosUnsigned,
  evmosMantissa,
} = require('../Utils/EVMOS');
const {
  makeNToken,
  setBalance,
} = require('../Utils/Nemo');

const repayAmount = evmosUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.mul(4); // forced
const announcedIncentive = evmosMantissa('1.10');
const treasuryPercent = evmosMantissa('0.05');

// There are fractional divisions in corresponding calculation in Liquidator.sol, which is 
// equivalate to `toFixed(0, ROUND_FLOOR)` when the results are positive, so we must reproduce this effect
function calculateSplitSeizedTokens(amount) {
  const seizedForRepayment = evmosUnsigned(amount.mul(evmosMantissa('1')).div(announcedIncentive).toFixed(0, BigNumber.ROUND_FLOOR));
  const treasuryDelta = evmosUnsigned(seizedForRepayment.mul(treasuryPercent).div(evmosMantissa('1')).toFixed(0, BigNumber.ROUND_FLOOR));
  const liquidatorDelta = amount.sub(treasuryDelta);
  return { treasuryDelta, liquidatorDelta };
}

describe('Liquidator', function () {
  let root, liquidator, borrower, treasury, accounts;
  let nToken, nTokenCollateral, liquidatorContract, nEvmos;

  beforeEach(async () => {
    [root, liquidator, borrower, treasury, ...accounts] = saddle.accounts;
    nToken = await makeNToken({ comptrollerOpts: { kind: 'bool' } });
    nTokenCollateral = await makeNToken({ comptroller: nToken.comptroller });
    nEvmos = await makeNToken({ kind: 'nevmos', comptroller: nToken.comptroller });
    liquidatorContract = await deploy(
      'LiquidatorHarness', [
      root,
      nEvmos._address,
      nToken.comptroller._address,
      nToken.comptroller.sebcontroller._address,
      treasury,
      treasuryPercent
    ]
    );
  });

  describe('splitLiquidationIncentive', () => {

    it('split liquidationIncentive between Treasury and Liquidator with correct amounts', async () => {
      const splitResponse = await call(liquidatorContract, 'splitLiquidationIncentive', [seizeTokens]);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(splitResponse["ours"]).toEqual(expectedData.treasuryDelta.toString());
      expect(splitResponse["theirs"]).toEqual(expectedData.liquidatorDelta.toString());
    });
  });

  describe('distributeLiquidationIncentive', () => {
    
    it('distribute the liquidationIncentive between Treasury and Liquidator with correct amounts', async () => {
      await setBalance(nTokenCollateral, liquidatorContract._address, seizeTokens.add(4e5));
      const distributeLiquidationIncentiveResponse = 
      await send(liquidatorContract, 'distributeLiquidationIncentive', [nTokenCollateral._address, seizeTokens]);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(distributeLiquidationIncentiveResponse).toHaveLog('DistributeLiquidationIncentive', {
        seizeTokensForTreasury: expectedData.treasuryDelta.toString(),
        seizeTokensForLiquidator: expectedData.liquidatorDelta.toString()
      });
    });

  });

  describe('Fails to distribute LiquidationIncentive', () => {
    
    it('Insufficient Collateral in LiquidatorContract - Error for transfer to Liquidator', async () => {

      await expect(send(liquidatorContract, 'distributeLiquidationIncentive', [nTokenCollateral._address, seizeTokens]))
      .rejects.toRevert("revert failed to transfer to liquidator");

    });

    it('Insufficient Collateral in LiquidatorContract - Error for transfer to Treasury', async () => {
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      await setBalance(nTokenCollateral, liquidatorContract._address, expectedData.liquidatorDelta);
      await expect(send(liquidatorContract, 'distributeLiquidationIncentive', [nTokenCollateral._address, seizeTokens]))
      .rejects.toRevert("revert failed to transfer to treasury");

    });

  });

});