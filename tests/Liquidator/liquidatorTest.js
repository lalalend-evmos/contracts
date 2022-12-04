const BigNumber = require('bignumber.js');
const {
  evmosGasCost,
  evmosUnsigned,
  evmosMantissa
} = require('../Utils/EVMOS');

const { dfn } = require('../Utils/JS');
const {
  makeNToken,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  pretendBorrow
} = require('../Utils/Nemo');

const repayAmount = evmosUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.mul(4); // forced
const announcedIncentive = evmosMantissa('1.10');
const treasuryPercent = evmosMantissa('0.05');

async function preApprove(nToken, from, spender, amount, opts = {}) {

  if (dfn(opts.faucet, true)) {
    expect(await send(nToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(nToken.underlying, 'approve', [spender, amount], { from });
}

async function preLiquidate(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral) {
  // setup for success in liquidating
  await send(nToken.comptroller, 'setLiquidateBorrowAllowed', [true]);
  await send(nToken.comptroller, 'setLiquidateBorrowVerify', [true]);
  await send(nToken.comptroller, 'setRepayBorrowAllowed', [true]);
  await send(nToken.comptroller, 'setRepayBorrowVerify', [true]);
  await send(nToken.comptroller, 'setSeizeAllowed', [true]);
  await send(nToken.comptroller, 'setSeizeVerify', [true]);
  await send(nToken.comptroller, 'setFailCalculateSeizeTokens', [false]);
  await send(nToken.comptroller, 'setAnnouncedLiquidationIncentiveMantissa', [announcedIncentive]);

  if (nToken.underlying) {
    await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [liquidator, false]);
  }
  await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(nTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
  await send(nTokenCollateral.comptroller, 'setCalculatedSeizeTokens', [seizeTokens]);
  await setBalance(nTokenCollateral, liquidator, 0);
  await setBalance(nTokenCollateral, borrower, seizeTokens);
  await pretendBorrow(nTokenCollateral, borrower, 0, 1, 0);
  await pretendBorrow(nToken, borrower, 1, 1, repayAmount);
  if (nToken.underlying) {
    await preApprove(nToken, liquidator, liquidatorContract._address, repayAmount);
  }
}

async function liquidate(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(nToken, 1);
  await fastForward(nTokenCollateral, 1);
  return send(
    liquidatorContract,
    'liquidateBorrow',
    [nToken._address, borrower, repayAmount, nTokenCollateral._address],
    { from: liquidator }
  );
}

async function liquidatevEvmos(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(nToken, 1);
  await fastForward(nTokenCollateral, 1);
  return send(
    liquidatorContract,
    'liquidateBorrow',
    [nToken._address, borrower, repayAmount, nTokenCollateral._address],
    { from: liquidator, value: repayAmount }
  );
}

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
      'Liquidator', [
      root,
      nEvmos._address,
      nToken.comptroller._address,
      nToken.comptroller.sebcontroller._address,
      treasury,
      treasuryPercent
    ]
    );
  });

  describe('liquidateBorrow', () => {

    beforeEach(async () => {
      await preLiquidate(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral);
    });

    it('returns success from liquidateBorrow and transfers the correct amounts', async () => {
      await send(nToken.comptroller, '_setLiquidatorContract', [liquidatorContract._address]);
      const beforeBalances = await getBalances([nToken, nTokenCollateral], [treasury, liquidator, borrower]);
      const result = await liquidate(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral);
      const gasCost = await evmosGasCost(result);
      const afterBalances = await getBalances([nToken, nTokenCollateral], [treasury, liquidator, borrower]);

      const { treasuryDelta, liquidatorDelta } = calculateSplitSeizedTokens(seizeTokens);

      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        nTokenCollateral: nTokenCollateral._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });

      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [nToken, 'cash', repayAmount],
        [nToken, 'borrows', -repayAmount],
        [nToken, liquidator, 'evmos', -gasCost],
        [nToken, liquidator, 'cash', -repayAmount],
        [nTokenCollateral, liquidator, 'evmos', -gasCost],
        [nTokenCollateral, liquidator, 'tokens', liquidatorDelta],
        [nTokenCollateral, treasury, 'tokens', treasuryDelta],
        [nToken, borrower, 'borrows', -repayAmount],
        [nTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });

  });

  describe('liquidate nEVMOS-Borrow', () => {

    beforeEach(async () => {
      await preLiquidate(liquidatorContract, vevmos, liquidator, borrower, repayAmount, nTokenCollateral);
      await send(nToken.comptroller, '_setLiquidatorContract', [liquidatorContract._address]);
    });

    it('liquidate-nEVMOS and returns success from liquidateBorrow and transfers the correct amounts', async () => {
      const beforeBalances = await getBalances([nEvmos, nTokenCollateral], [treasury, liquidator, borrower]);
      const result = await liquidatevevmos(liquidatorContract, nEvmos, liquidator, borrower, repayAmount, nTokenCollateral);
      const gasCost = await evmosGasCost(result);
      const afterBalances = await getBalances([nEvmos, nTokenCollateral], [treasury, liquidator, borrower]);

      const { treasuryDelta, liquidatorDelta } = calculateSplitSeizedTokens(seizeTokens);
      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        nTokenCollateral: nTokenCollateral._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });

      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [nEvmos, 'evmos', repayAmount],
        [nEvmos, 'borrows', -repayAmount],
        [nEvmos, liquidator, 'evmos', -(gasCost.add(repayAmount))],
        [nTokenCollateral, liquidator, 'evmos', -(gasCost.add(repayAmount))],
        [nTokenCollateral, liquidator, 'tokens', liquidatorDelta],
        [nTokenCollateral, treasury, 'tokens', treasuryDelta],
        [nEvmos, borrower, 'borrows', -repayAmount],
        [nTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });

    it('liquidate-nEVMOS and repay-EVMOS should return success from liquidateBorrow and transfers the correct amounts', async () => {
      await setBalance(nEvmos, borrower, seizeTokens.add(1000));
      const beforeBalances = await getBalances([nEvmos, nEvmos], [treasury, liquidator, borrower]);
      const result = await liquidatevevmos(liquidatorContract, nEvmos, liquidator, borrower, repayAmount, vevmos);
      const gasCost = await evmosGasCost(result);
      const afterBalances = await getBalances([nEvmos], [treasury, liquidator, borrower]);

      const { treasuryDelta, liquidatorDelta } = calculateSplitSeizedTokens(seizeTokens);
      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        nTokenCollateral: nEvmos._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });

      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [nEvmos, 'evmos', repayAmount],
        [nEvmos, 'borrows', -repayAmount],
        [nEvmos, liquidator, 'evmos', -(gasCost.add(repayAmount))],
        [nEvmos, liquidator, 'tokens', liquidatorDelta],
        [nEvmos, treasury, 'tokens', treasuryDelta],
        [nEvmos, borrower, 'borrows', -repayAmount],
        [nEvmos, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });

  describe('setTreasuryPercent', () => {
    it('updates treasury percent in storage', async () => {
      const result =
        await liquidatorContract.methods.setTreasuryPercent(evmosMantissa('0.08')).send({ from: root });
      expect(result).toHaveLog('NewLiquidationTreasuryPercent', {
        oldPercent: treasuryPercent,
        newPercent: evmosMantissa('0.08')
      });
      const newPercent = await liquidatorContract.methods.treasuryPercentMantissa().call();
      expect(newPercent).toEqual(evmosMantissa('0.08').toString());
    });

    it('fails when called from non-admin', async () => {
      await expect(
        liquidatorContract.methods.setTreasuryPercent(evmosMantissa('0.08')).send({ from: borrower })
      ).rejects.toRevert("revert only admin allowed");
    });

    it('uses the new treasury percent during distributions', async () => {
      await send(nToken.comptroller, '_setLiquidatorContract', [liquidatorContract._address]);
      await preLiquidate(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral);
      await liquidatorContract.methods.setTreasuryPercent(evmosMantissa('0.08')).send({ from: root });
      const result = await liquidate(liquidatorContract, nToken, liquidator, borrower, repayAmount, nTokenCollateral);
      const treasuryDelta =
        seizeTokens
          .mul(evmosMantissa('1')).div(announcedIncentive)  // / 1.1
          .mul(evmosMantissa('0.08')).div(evmosMantissa('1')) // * 0.08
          .toFixed(0, BigNumber.ROUND_FLOOR);
      const liquidatorDelta = seizeTokens.sub(treasuryDelta);
      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        nTokenCollateral: nTokenCollateral._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });
    });
  });

  describe('_setPendingAdmin', () => {
    it('updates pending admin', async () => {
      const result =
        await liquidatorContract.methods._setPendingAdmin(borrower).send({ from: root });
      expect(await liquidatorContract.methods.pendingAdmin().call()).toEqual(borrower);
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: '0x0000000000000000000000000000000000000000',
        newPendingAdmin: borrower
      });
    });

    it('fails when called from non-admin', async () => {
      await expect(
        liquidatorContract.methods._setPendingAdmin(borrower).send({ from: borrower })
      ).rejects.toRevert("revert only admin allowed");
    });
  })
});