const {
    evmosBalance,
    evmosGasCost,
    getContract
  } = require('./Utils/EVMOS');
  
  const {
    makeComptroller,
    makeNToken,
    makePriceOracle,
    pretendBorrow,
    borrowSnapshot
  } = require('./Utils/Nemo');
  
  describe('Maximillion', () => {
    let root, borrower;
    let maximillion, nEvmos;
    beforeEach(async () => {
      [root, borrower] = saddle.accounts;
      
      nEvmos = await makeNToken({kind: "nEvmos", supportMarket: true});
      maximillion = await deploy('Maximillion', [nEvmos._address]);
    });
  
    describe("constructor", () => {
      it("sets address of nEvmos", async () => {
        expect(await call(maximillion, "nEvmos")).toEqual(nEvmos._address);
      });
    });
  
    describe("repayBehalf", () => {
      it("refunds the entire amount with no borrows", async () => {
        const beforeBalance = await evmosBalance(root);
        const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
        const gasCost = await evmosGasCost(result);
        const afterBalance = await evmosBalance(root);
        expect(result).toSucceed();
        expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost));
      });
  
      it("repays part of a borrow", async () => {
        await pretendBorrow(nEvmos, borrower, 1, 1, 150);
        const beforeBalance = await evmosBalance(root);
        const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
        const gasCost = await evmosGasCost(result);
        const afterBalance = await evmosBalance(root);
        const afterBorrowSnap = await borrowSnapshot(nEvmos, borrower);
        expect(result).toSucceed();
        expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost).sub(100));
        expect(afterBorrowSnap.principal).toEqualNumber(50);
      });
  
      it("repays a full borrow and refunds the rest", async () => {
        await pretendBorrow(nEvmos, borrower, 1, 1, 90);
        const beforeBalance = await evmosBalance(root);
        const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
        const gasCost = await evmosGasCost(result);
        const afterBalance = await evmosBalance(root);
        const afterBorrowSnap = await borrowSnapshot(nEvmos, borrower);
        expect(result).toSucceed();
        expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost).sub(90));
        expect(afterBorrowSnap.principal).toEqualNumber(0);
      });
    });
  });