const {
    makeNToken,setMarketSupplyCap
  } = require('../Utils/Nemo');
    
  describe('NNemoLikeDelegate', function () {
    describe("_delegateNemoLikeTo", () => {
      it("does not delegate if not the admin", async () => {
        const [root, a1] = saddle.accounts;
        const nToken = await makeNToken({kind: 'nmia'});
        await setMarketSupplyCap(nToken.comptroller, [nToken._address], [100000000000]);
        await expect(send(nToken, '_delegateNemoLikeTo', [a1], {from: a1})).rejects.toRevert('revert only the admin may set the mia-like delegate');
      });
  
      it("delegates successfully if the admin", async () => {
        const [root, a1] = saddle.accounts, amount = 1;
        const nMIA = await makeNToken({kind: 'nmia'}), MIA = nMIA.underlying;
        const tx1 = await send(nMIA, '_delegateNemoLikeTo', [a1]);
        const tx2 = await send(MIA, 'transfer', [nMIA._address, amount]);
        await expect(await call(MIA, 'getCurrentVotes', [a1])).toEqualNumber(amount);
      });
    });
  });