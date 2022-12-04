const {makeNToken, setMarketSupplyCap} = require('../Utils/Nemo');

describe('NToken', function () {
  let root, accounts;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      const nToken = await makeNToken({supportMarket: true});
      await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
      expect(await call(nToken, 'balanceOf', [root])).toEqualNumber(0);
      expect(await send(nToken, 'transfer', [accounts[0], 100])).toHaveTokenFailure('MATH_ERROR', 'TRANSFER_NOT_ENOUGH');
    });

    it("transfers 50 tokens", async () => {
      const nToken = await makeNToken({supportMarket: true});
      await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
      await send(nToken, 'harnessSetBalance', [root, 100]);
      expect(await call(nToken, 'balanceOf', [root])).toEqualNumber(100);
      await send(nToken, 'transfer', [accounts[0], 50]);
      expect(await call(nToken, 'balanceOf', [root])).toEqualNumber(50);
      expect(await call(nToken, 'balanceOf', [accounts[0]])).toEqualNumber(50);
    });

    it("doesn't transfer when src == dst", async () => {
      const nToken = await makeNToken({supportMarket: true});
      await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
      await send(nToken, 'harnessSetBalance', [root, 100]);
      expect(await call(nToken, 'balanceOf', [root])).toEqualNumber(100);
      expect(await send(nToken, 'transfer', [root, 50])).toHaveTokenFailure('BAD_INPUT', 'TRANSFER_NOT_ALLOWED');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      const nToken = await makeNToken({comptrollerOpts: {kind: 'bool'}});
      await send(nToken, 'harnessSetBalance', [root, 100]);
      expect(await call(nToken, 'balanceOf', [root])).toEqualNumber(100);

      await send(nToken.comptroller, 'setTransferAllowed', [false])
      expect(await send(nToken, 'transfer', [root, 50])).toHaveTrollReject('TRANSFER_COMPTROLLER_REJECTION');

      await send(nToken.comptroller, 'setTransferAllowed', [true])
      await send(nToken.comptroller, 'setTransferVerify', [false])
      await expect(send(nToken, 'transfer', [accounts[0], 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });
  });
});