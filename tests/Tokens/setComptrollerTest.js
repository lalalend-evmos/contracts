const {
    makeComptroller,
    makeNToken,
    setMarketSupplyCap
  } = require('../Utils/Nemo');
  
  describe('NToken', function () {
    let root, accounts;
    let nToken, oldComptroller, newComptroller;
    beforeEach(async () => {
      [root, ...accounts] = saddle.accounts;
      nToken = await makeNToken();
      oldComptroller = nToken.comptroller;
      newComptroller = await makeComptroller();
      expect(newComptroller._address).not.toEqual(oldComptroller._address);
      await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
    });
  
    describe('_setComptroller', () => {
      it("should fail if called by non-admin", async () => {
        expect(
          await send(nToken, '_setComptroller', [newComptroller._address], { from: accounts[0] })
        ).toHaveTokenFailure('UNAUTHORIZED', 'SET_COMPTROLLER_OWNER_CHECK');
        expect(await call(nToken, 'comptroller')).toEqual(oldComptroller._address);
      });
  
      it("reverts if passed a contract that doesn't implement isComptroller", async () => {
        await expect(send(nToken, '_setComptroller', [nToken.underlying._address])).rejects.toRevert("revert");
        expect(await call(nToken, 'comptroller')).toEqual(oldComptroller._address);
      });
  
      it("reverts if passed a contract that implements isComptroller as false", async () => {
        // extremely unlikely to occur, of course, but let's be exhaustive
        const badComptroller = await makeComptroller({ kind: 'false-marker' });
        await expect(send(nToken, '_setComptroller', [badComptroller._address])).rejects.toRevert("revert marker method returned false");
        expect(await call(nToken, 'comptroller')).toEqual(oldComptroller._address);
      });
  
      it("updates comptroller and emits log on success", async () => {
        const result = await send(nToken, '_setComptroller', [newComptroller._address]);
        expect(result).toSucceed();
        expect(result).toHaveLog('NewComptroller', {
          oldComptroller: oldComptroller._address,
          newComptroller: newComptroller._address
        });
        expect(await call(nToken, 'comptroller')).toEqual(newComptroller._address);
      });
    });
  });