const {
    evmosGasCost,
    evmosMantissa,
    evmosUnsigned,
    sendFallback
  } = require('../Utils/EVMOS');
  
  const {
    makeNToken,
    balanceOf,
    fastForward,
    setBalance,
    setEVMOSBalance,
    getBalances,
    adjustBalances
  } = require('../Utils/Nemo');
  
  const exchangeRate = 5;
  const mintAmount = evmosUnsigned(1e5);
  const mintTokens = mintAmount.div(exchangeRate);
  const redeemTokens = evmosUnsigned(10e3);
  const redeemAmount = redeemTokens.mul(exchangeRate);
  const redeemedAmount = redeemAmount.mul(evmosUnsigned(9999e14)).div(evmosUnsigned(1e18));
  const feeAmount = redeemAmount.mul(evmosUnsigned(1e14)).div(evmosUnsigned(1e18));
  
  async function preMint(nToken, minter, mintAmount, mintTokens, exchangeRate) {
    await send(nToken.comptroller, 'setMintAllowed', [true]);
    await send(nToken.comptroller, 'setMintVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(exchangeRate)]);
  }
  
  async function mintExplicit(nToken, minter, mintAmount) {
    return send(nToken, 'mint', [], {from: minter, value: mintAmount});
  }
  
  async function mintFallback(nToken, minter, mintAmount) {
    return sendFallback(nToken, {from: minter, value: mintAmount});
  }
  
  async function preRedeem(nToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
    await send(nToken.comptroller, 'setRedeemAllowed', [true]);
    await send(nToken.comptroller, 'setRedeemVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(exchangeRate)]);
    await setEVMOSBalance(nToken, redeemAmount);
    await send(nToken, 'harnessSetTotalSupply', [redeemTokens]);
    await setBalance(nToken, redeemer, redeemTokens);
  }
  
  async function redeemNTokens(nToken, redeemer, redeemTokens, redeemAmount) {
    return send(nToken, 'redeem', [redeemTokens], {from: redeemer});
  }
  
  async function redeemUnderlying(nToken, redeemer, redeemTokens, redeemAmount) {
    return send(nToken, 'redeemUnderlying', [redeemAmount], {from: redeemer});
  }
  
  describe('NEVMOS', () => {
    let root, minter, redeemer, accounts;
    let nToken;
  
    beforeEach(async () => {
      [root, minter, redeemer, ...accounts] = saddle.accounts;
      nToken = await makeNToken({kind: 'nevmos', comptrollerOpts: {kind: 'boolFee'}});
      await fastForward(nToken, 1);
    });
  
    [mintExplicit, mintFallback].forEach((mint) => {
      describe(mint.name, () => {
        beforeEach(async () => {
          await preMint(nToken, minter, mintAmount, mintTokens, exchangeRate);
        });
  
        it("reverts if interest accrual fails", async () => {
          await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
          await expect(mint(nToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
        });
  
        it("returns success from mintFresh and mints the correct number of tokens", async () => {
          const beforeBalances = await getBalances([nToken], [minter]);
          const receipt = await mint(nToken, minter, mintAmount);
          const afterBalances = await getBalances([nToken], [minter]);
          expect(receipt).toSucceed();
          expect(mintTokens).not.toEqualNumber(0);
          expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
            [nToken, 'evmos', mintAmount],
            [nToken, 'tokens', mintTokens],
            [nToken, minter, 'evmos', -mintAmount.add(await evmosGasCost(receipt))],
            [nToken, minter, 'tokens', mintTokens]
          ]));
        });
      });
    });
  
    [redeemNTokens, redeemUnderlying].forEach((redeem) => {
      describe(redeem.name, () => {
        beforeEach(async () => {
          await preRedeem(nToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
        });
  
        it("emits a redeem failure if interest accrual fails", async () => {
          await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
          await expect(redeem(nToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
        });
  
        it("returns error from redeemFresh without emitting any extra logs", async () => {
          expect(await redeem(nToken, redeemer, redeemTokens.mul(5), redeemAmount.mul(5))).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED');
        });
  
        it("returns success from redeemFresh and redeems the correct amount", async () => {
          await fastForward(nToken);
          const beforeBalances = await getBalances([nToken], [redeemer]);
          const receipt = await redeem(nToken, redeemer, redeemTokens, redeemAmount);
          expect(receipt).toTokenSucceed();
          const afterBalances = await getBalances([nToken], [redeemer]);
          expect(redeemTokens).not.toEqualNumber(0);
          expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
            [nToken, 'evmos', -redeemAmount],
            [nToken, 'tokens', -redeemTokens],
            [nToken, redeemer, 'evmos', redeemedAmount.sub(await evmosGasCost(receipt))],
            [nToken, redeemer, 'tokens', -redeemTokens]
          ]));
        });
      });
    });
  });