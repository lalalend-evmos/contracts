const {
    evmosBalance,
    evmosGasCost,
    getContract,
    evmosUnsigned, evmosMantissa
  } = require('./utils/EVMOS');
  
  const { dfn } = require('./utils/JS');

  const {
    makeComptroller,
    makeNToken,
    makePriceOracle,
    pretendBorrow,
    borrowSnapshot
  } = require('./utils/Lalalend');

const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require('hardhat');
  
  describe('Maximillion', () => {
    let owner, borrower;
    let maximillion, nEvmos;
    beforeEach(async () => {
      [owner, borrower] = await ethers.getSigners();


      // SIMPLE PRICE ORACLE
      const SimplePriceOracle = await ethers.getContractFactory('SimplePriceOracle');
      const simplePriceOracle = await SimplePriceOracle.deploy();
      await simplePriceOracle.deployed();
      //console.log(simplePriceOracle.address);

      // COMPTROLLER HARNESS
      const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
      const comptrollerLens = await ComptrollerLens.deploy();
      await comptrollerLens.deployed();

      const Comptroller = await ethers.getContractFactory("ComptrollerHarness");
      const comptroller_ = await Comptroller.deploy();
      await comptroller_.deployed();

      const priceOracle = simplePriceOracle;
      const closeFactor = String(evmosMantissa(dfn(.051)));

      await comptroller_._setCloseFactor(closeFactor);
      await comptroller_._setPriceOracle(priceOracle.address);
      await comptroller_._setComptrollerLens(comptrollerLens.address);

      // IR MODEL 
      const borrowRate = String(evmosMantissa(0));
      const InterestRateModelHarness = await ethers.getContractFactory("InterestRateModelHarness");
      const irModel = await InterestRateModelHarness.deploy(borrowRate);
      await irModel.deployed();

      const exchangeRate = String(evmosMantissa(1));
      const decimals = String(evmosUnsigned(8));
      const symbol = "nEVMOS";
      const name = `NToken ${symbol}`;

      const NToken = await ethers.getContractFactory("NEvmosHarness");
      nEvmos = await NToken.deploy(
          comptroller_.address,
          irModel.address,
          exchangeRate,
          name,
          symbol,
          decimals,
          owner.address
      )
      await nEvmos.deployed();
      await comptroller_._supportMarket(nEvmos.address);

      const Maximillion = await ethers.getContractFactory("Maximillion");

      maximillion = await Maximillion.deploy(nEvmos.address);

    });
  
    describe("constructor", () => {
      it("sets address of nEvmos", async () => {
        expect(await maximillion.nEvmos()).to.equal(nEvmos.address);
      });
    });
  
    describe("repayBehalf", () => {
      it("refunds the entire amount with no borrows", async () => {
        const beforeBalance = await evmosBalance(owner.address);
        const result = await maximillion.repayBehalf(borrower, {value: 100});
        const gasCost = await evmosGasCost(result);
        const afterBalance = await evmosBalance(owner.address);
        //expect(result).toSucceed();
        expect(afterBalance).to.equal(beforeBalance.sub(gasCost));
      });
      /*
  
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
      */
    });
  });