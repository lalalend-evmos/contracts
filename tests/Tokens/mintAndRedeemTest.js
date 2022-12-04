const {
    evmosUnsigned,
    evmosMantissa
  } = require('../Utils/EVMOS');
  
  const {
    makeNToken,
    balanceOf,
    fastForward,
    setBalance,
    getBalances,
    adjustBalances,
    preApprove,
    quickMint,
    preSupply,
    quickRedeem,
    quickRedeemUnderlying
  } = require('../Utils/Nemo');
  
  const exchangeRate = 50e3;
  const mintAmount = evmos(10e4);
  const mintTokens = mintAmount.div(exchangeRate);
  const redeemTokens = evmos(10e3);
  const redeemAmount = redeemTokens.mul(exchangeRate);
  
  async function preMint(nToken, minter, mintAmount, mintTokens, exchangeRate) {
    await preApprove(nToken, minter, mintAmount);
    await send(nToken.comptroller, 'setMintAllowed', [true]);
    await send(nToken.comptroller, 'setMintVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [minter, false]);
    await send(nToken, 'harnessSetBalance', [minter, 0]);
    await send(nToken, 'harnessSetExchangeRate', [bnbMantissa(exchangeRate)]);
  }
  
  async function mintFresh(nToken, minter, mintAmount) {
    return send(nToken, 'harnessMintFresh', [minter, mintAmount]);
  }
  
  async function preMintBehalf(nToken, payer, mintAmount, mintTokens, exchangeRate) {
    await preApprove(nToken, payer, mintAmount);
    await send(nToken.comptroller, 'setMintAllowed', [true]);
    await send(nToken.comptroller, 'setMintVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [payer, false]);
    await send(nToken, 'harnessSetBalance', [payer, 0]);
    await send(nToken, 'harnessSetExchangeRate', [bnbMantissa(exchangeRate)]);
  }
  
  async function mintBehalfFresh(nToken, payer, receiver, mintAmount) {
    return send(nToken, 'harnessMintBehalfFresh', [payer, receiver, mintAmount]);
  }
  
  async function preRedeem(nToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
    await preSupply(nToken, redeemer, redeemTokens);
    await send(nToken.comptroller, 'setRedeemAllowed', [true]);
    await send(nToken.comptroller, 'setRedeemVerify', [true]);
    await send(nToken.interestRateModel, 'setFailBorrowRate', [false]);
    await send(nToken.underlying, 'harnessSetBalance', [nToken._address, redeemAmount]);
    await send(nToken.underlying, 'harnessSetBalance', [redeemer, 0]);
    await send(nToken.underlying, 'harnessSetFailTransferToAddress', [redeemer, false]);
    await send(nToken, 'harnessSetExchangeRate', [bnbMantissa(exchangeRate)]);
  }
  
  async function redeemFreshTokens(nToken, redeemer, redeemTokens, redeemAmount) {
    return send(nToken, 'harnessRedeemFresh', [redeemer, redeemTokens, 0]);
  }
  
  async function redeemFreshAmount(nToken, redeemer, redeemTokens, redeemAmount) {
    return send(nToken, 'harnessRedeemFresh', [redeemer, 0, redeemAmount]);
  }
  
  describe('NToken', function () {
    let root, minter, redeemer, accounts, payer, receiver;
    let nToken;
    beforeEach(async () => {
      [root, minter, redeemer, receiver, ...accounts] = saddle.accounts;
      payer = minter;
      nToken = await makeNToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
    });
  
    describe('mintFresh', () => {
      beforeEach(async () => {
        await preMint(nToken, minter, mintAmount, mintTokens, exchangeRate);
      });
  
      it("fails if comptroller tells it to", async () => {
        await send(nToken.comptroller, 'setMintAllowed', [false]);
        expect(await mintFresh(nToken, minter, mintAmount)).toHaveTrollReject('MINT_COMPTROLLER_REJECTION', 'MATH_ERROR');
      });
  
      it("proceeds if comptroller tells it to", async () => {
        await expect(await mintFresh(nToken, minter, mintAmount)).toSucceed();
      });
  
      it("fails if not fresh", async () => {
        await fastForward(nToken);
        expect(await mintFresh(nToken, minter, mintAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'MINT_FRESHNESS_CHECK');
      });
  
      it("continues if fresh", async () => {
        await expect(await send(nToken, 'accrueInterest')).toSucceed();
        expect(await mintFresh(nToken, minter, mintAmount)).toSucceed();
      });
  
      it("fails if insufficient approval", async () => {
        expect(
          await send(nToken.underlying, 'approve', [nToken._address, 1], {from: minter})
        ).toSucceed();
        await expect(mintFresh(nToken, minter, mintAmount)).rejects.toRevert('revert Insufficient allowance');
      });
  
      it("fails if insufficient balance", async() => {
        await setBalance(nToken.underlying, minter, 1);
        await expect(mintFresh(nToken, minter, mintAmount)).rejects.toRevert('revert Insufficient balance');
      });
  
      it("proceeds if sufficient approval and balance", async () =>{
        expect(await mintFresh(nToken, minter, mintAmount)).toSucceed();
      });
  
      it("fails if exchange calculation fails", async () => {
        expect(await send(nToken, 'harnessSetExchangeRate', [0])).toSucceed();
        await expect(mintFresh(nToken, minter, mintAmount)).rejects.toRevert('revert MINT_EXCHANGE_CALCULATION_FAILED');
      });
  
      it("fails if transferring in fails", async () => {
        await send(nToken.underlying, 'harnessSetFailTransferFromAddress', [minter, true]);
        await expect(mintFresh(nToken, minter, mintAmount)).rejects.toRevert('revert TOKEN_TRANSFER_IN_FAILED');
      });
  
      it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
        const beforeBalances = await getBalances([nToken], [minter]);
        const result = await mintFresh(nToken, minter, mintAmount);
        const afterBalances = await getBalances([nToken], [minter]);
        expect(result).toSucceed();
        expect(result).toHaveLog('Mint', {
          minter,
          mintAmount: mintAmount.toString(),
          mintTokens: mintTokens.toString()
        });
        expect(result).toHaveLog(['Transfer', 1], {
          from: nToken._address,
          to: minter,
          amount: mintTokens.toString()
        });
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [nToken, minter, 'cash', -mintAmount],
          [nToken, minter, 'tokens', mintTokens],
          [nToken, 'cash', mintAmount],
          [nToken, 'tokens', mintTokens]
        ]));
      });
  
      it("transfers the underlying cash from payer, tokens to receiver, and emits MintBehalf, Transfer events", async () => {
        const payerBeforeBalances = await getBalances([nToken], [payer]);
        const receiverBeforeBalances = await getBalances([nToken], [receiver]);
        const result = await mintBehalfFresh(nToken, payer, receiver, mintAmount);
        const payerAfterBalances = await getBalances([nToken], [payer]);
        const receiverAfterBalances = await getBalances([nToken], [receiver]);
        expect(result).toSucceed();
        expect(result).toHaveLog('MintBehalf', {
          payer,
          receiver,
          mintAmount: mintAmount.toString(),
          mintTokens: mintTokens.toString()
        });
        expect(result).toHaveLog(['Transfer', 1], {
          from: nToken._address,
          to: receiver,
          amount: mintTokens.toString()
        });
        expect(payerAfterBalances).toEqual(await adjustBalances(payerBeforeBalances, [
          [nToken, payer, 'cash', -mintAmount],
          [nToken, payer, 'tokens', 0],
          [nToken, 'cash', mintAmount],
          [nToken, 'tokens', mintTokens]
        ]));
        expect(receiverAfterBalances).toEqual(await adjustBalances(receiverBeforeBalances, [
          [nToken, receiver, 'cash', 0],
          [nToken, receiver, 'tokens', mintTokens],
          [nToken, 'cash', mintAmount],
          [nToken, 'tokens', mintTokens]
        ]));
      });
    });
  
    describe('mint', () => {
      beforeEach(async () => {
        await preMint(nToken, minter, mintAmount, mintTokens, exchangeRate);
      });
  
      it("emits a mint failure if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(quickMint(nToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from mintFresh without emitting any extra logs", async () => {
        await send(nToken.underlying, 'harnessSetBalance', [minter, 1]);
        await expect(mintFresh(nToken, minter, mintAmount)).rejects.toRevert('revert Insufficient balance');
      });
  
      it("returns success from mintFresh and mints the correct number of tokens", async () => {
        expect(await quickMint(nToken, minter, mintAmount)).toSucceed();
        expect(mintTokens).not.toEqualNumber(0);
        expect(await balanceOf(nToken, minter)).toEqualNumber(mintTokens);
      });
  
      it("emits an AccrueInterest event", async () => {
        expect(await quickMint(nToken, minter, mintAmount)).toHaveLog('AccrueInterest', {
          borrowIndex: "1000000000000000000",
          cashPrior: "0",
          interestAccumulated: "0",
          totalBorrows: "0",
        });
      });
    });
  
    [redeemFreshTokens, redeemFreshAmount].forEach((redeemFresh) => {
      describe(redeemFresh.name, () => {
        beforeEach(async () => {
          await preRedeem(nToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
        });
  
        it("fails if comptroller tells it to", async () =>{
          await send(nToken.comptroller, 'setRedeemAllowed', [false]);
          expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTrollReject('REDEEM_COMPTROLLER_REJECTION');
        });
  
        it("fails if not fresh", async () => {
          await fastForward(nToken);
          expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'REDEEM_FRESHNESS_CHECK');
        });
  
        it("continues if fresh", async () => {
          await expect(await send(nToken, 'accrueInterest')).toSucceed();
          expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toSucceed();
        });
  
        it("fails if insufficient protocol cash to transfer out", async() => {
          await send(nToken.underlying, 'harnessSetBalance', [nToken._address, 1]);
          expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDEEM_TRANSFER_OUT_NOT_POSSIBLE');
        });
  
        it("fails if exchange calculation fails", async () => {
          if (redeemFresh == redeemFreshTokens) {
            expect(await send(nToken, 'harnessSetExchangeRate', ['0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'])).toSucceed();
            expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_EXCHANGE_TOKENS_CALCULATION_FAILED');
          } else {
            expect(await send(nToken, 'harnessSetExchangeRate', [0])).toSucceed();
            expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_EXCHANGE_AMOUNT_CALCULATION_FAILED');
          }
        });
  
        it("fails if transferring out fails", async () => {
          await send(nToken.underlying, 'harnessSetFailTransferToAddress', [redeemer, true]);
          await expect(redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
        });
  
        it("fails if total supply < redemption amount", async () => {
          await send(nToken, 'harnessExchangeRateDetails', [0, 0, 0]);
          expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED');
        });
  
        it("reverts if new account balance underflows", async () => {
          await send(nToken, 'harnessSetBalance', [redeemer, 0]);
          expect(await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_ACCOUNT_BALANCE_CALCULATION_FAILED');
        });
  
        it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
          const beforeBalances = await getBalances([nToken], [redeemer]);
          const result = await redeemFresh(nToken, redeemer, redeemTokens, redeemAmount);
          const afterBalances = await getBalances([nToken], [redeemer]);
          expect(result).toSucceed();
          expect(result).toHaveLog('Redeem', {
            redeemer,
            redeemAmount: redeemAmount.toString(),
            redeemTokens: redeemTokens.toString()
          });
          expect(result).toHaveLog(['Transfer', 1], {
            from: redeemer,
            to: nToken._address,
            amount: redeemTokens.toString()
          });
          expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
            [nToken, redeemer, 'cash', redeemAmount],
            [nToken, redeemer, 'tokens', -redeemTokens],
            [nToken, 'cash', -redeemAmount],
            [nToken, 'tokens', -redeemTokens]
          ]));
        });
      });
    });
  
    describe('redeem', () => {
      beforeEach(async () => {
        await preRedeem(nToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });
  
      it("emits a redeem failure if interest accrual fails", async () => {
        await send(nToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(quickRedeem(nToken, redeemer, redeemTokens)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });
  
      it("returns error from redeemFresh without emitting any extra logs", async () => {
        await setBalance(nToken.underlying, nToken._address, 0);
        expect(await quickRedeem(nToken, redeemer, redeemTokens, {exchangeRate})).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDEEM_TRANSFER_OUT_NOT_POSSIBLE');
      });
  
      it("returns success from redeemFresh and redeems the right amount", async () => {
        expect(
          await send(nToken.underlying, 'harnessSetBalance', [nToken._address, redeemAmount])
        ).toSucceed();
        expect(await quickRedeem(nToken, redeemer, redeemTokens, {exchangeRate})).toSucceed();
        expect(redeemAmount).not.toEqualNumber(0);
        expect(await balanceOf(nToken.underlying, redeemer)).toEqualNumber(redeemAmount);
      });
  
      it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
        expect(
          await send(nToken.underlying, 'harnessSetBalance', [nToken._address, redeemAmount])
        ).toSucceed();
        expect(
          await quickRedeemUnderlying(nToken, redeemer, redeemAmount, {exchangeRate})
        ).toSucceed();
        expect(redeemAmount).not.toEqualNumber(0);
        expect(await balanceOf(nToken.underlying, redeemer)).toEqualNumber(redeemAmount);
      });
  
      it("emits an AccrueInterest event", async () => {
        expect(await quickMint(nToken, minter, mintAmount)).toHaveLog('AccrueInterest', {
          borrowIndex: "1000000000000000000",
          cashPrior: "500000000",
          interestAccumulated: "0",
          totalBorrows: "0",
        });
      });
    });
  });