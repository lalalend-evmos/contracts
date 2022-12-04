const {
    makeChainlinkOracle,
    makeNToken,
  } = require("./Utils/Nemo");
  
  const {
    increaseTime, evmosMantissa
  } = require('./Utils/EVMOS');
  
  describe("MiaOracleMock", () => {
    let root, accounts;
    let usdcFeed, usdtFeed, evmosFeed; //daiFeed
    let oracle, nEvmos, nExampleSet, nExampleUnset, nToken, nUsdc, nUsdt, seb, mia; //nDai
  
    //const MAX_STALE_PERIOD = 100 * 60; // 100min, just for test
   
    beforeEach(async () => {
      [root, ...accounts] = saddle.accounts;
      nToken = await makeNToken();
      nEvmos = await makeNToken({kind: "nevmos",
        comptrollerOpts: {kind: "v1-no-proxy"},
        supportMarket: true
      });
      seb = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
        symbol: "SEB"
      });
      mia = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
        symbol: "MIA"
      });
      nExampleSet = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
      });
      nExampleUnset = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
      });
      nUsdc = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
        underlyingOpts: {
          decimals: 6,
          symbol: "USDC"
        }
      });
      nUsdt = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
        underlyingOpts: {
          decimals: 6,
          symbol: "USDT"
        }
      });
      /*nDai = await makeNToken({
        comptroller: nEvmos.comptroller,
        supportMarket: true,
        underlyingOpts: {
          decimals: 18,
          symbol: "DAI"
        }
      });*/
      evmosFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 30000000000});
      usdcFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
      usdtFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
      //daiFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
      oracle = await deploy("NemoChainlinkOracle");
    });
  
    describe("constructor", () => {
      it("sets address of admin", async () => {
        let admin = await call(oracle, "admin");
        expect(admin).toEqual(root);
      });
    });
  
    describe("setFeed", () => {
      it("only admin may set a feed", async () => {
        await expect(
          send(oracle, "setFeed", ["nEVMOS", evmosFeed._address], {from: accounts[0]})
        ).rejects.toRevert("revert only admin may call");
      });
  
      it("cannot set feed to self address", async () => {
        await expect(
          send(oracle, "setFeed", ["nEVMOS", oracle._address], {from: root})
        ).rejects.toRevert("revert invalid feed address");
      });
  
      it("cannot set feed to zero address", async () => {
        await expect(
          send(
            oracle,
            "setFeed",
            ["nEVMOS", "0x0000000000000000000000000000000000000000"],
            {from: root}
          )
        ).rejects.toRevert("revert invalid feed address");
      });
  
      it("sets a feed", async () => {
        await send(oracle, "setFeed", ["nEVMOS", evmosFeed._address], {from: root});
        let feed = await call(oracle, "getFeed", ["nEVMOS"]);
        expect(feed).toEqual(evmosFeed._address);
      });
    });
  
    describe("getUnderlyingPrice", () => {
      beforeEach(async () => {
        await send(oracle, "setFeed", ["nEVMOS", evmosFeed._address], {from: root});
        await send(oracle, "setFeed", ["USDC", usdcFeed._address], {from: root});
        await send(oracle, "setFeed", ["USDT", usdtFeed._address], {from: root});
        //await send(oracle, "setFeed", ["DAI", daiFeed._address], {from: root});
        await send(oracle, "setDirectPrice", [mia._address, 7], {from: root});
        await send(oracle, "setUnderlyingPrice", [nExampleSet._address, 1], {from: root});
      });
  
      it("gets the price from Chainlink for nEVMOS", async () => {
        let price = await call(oracle, "getUnderlyingPrice", [nEvmos._address], {from: root});
        expect(price).toEqual("300000000000000000000");
      });
  
      it("gets the price from Chainlink for USDC", async () => {
        let price = await call(oracle, "getUnderlyingPrice", [nUsdc._address], {from: root});
        expect(price).toEqual("1000000000000000000000000000000");
      });
  
      it("gets the price from Chainlink for USDT", async () => {
        let price = await call(oracle, "getUnderlyingPrice", [nUsdt._address], {from: root});
        expect(price).toEqual("1000000000000000000000000000000");
      });
  
      /*it("gets the price from Chainlink for DAI", async () => {
        let price = await call(oracle, "getUnderlyingPrice", [nDai._address], {from: root});
        expect(price).toEqual("1000000000000000000");
      });*/
  
      it("gets the direct price of SEB", async () => {
        let price = await call(
          oracle,
          "getUnderlyingPrice",
          [seb._address],
          {from: root}
        );
        expect(price).toEqual("1000000000000000000");
      });
  
      it("gets the constant price of MIA", async () => {
        let price = await call(
          oracle,
          "getUnderlyingPrice",
          [mia._address],
          {from: root}
        );
        expect(price).toEqual("7");
      });
  
      it("gets the direct price of a set asset", async () => {
        let price = await call(
          oracle,
          "getUnderlyingPrice",
          [nExampleSet._address],
          {from: root}
        );
        expect(price).toEqual("1");
      });
  
      it("reverts if no price or feed has been set", async () => {
        await expect(
          send(oracle, "getUnderlyingPrice", [nExampleUnset._address], {from: root})
        ).rejects.toRevert();
      });
    });
  
    describe("setUnderlyingPrice", () => {
      it("only admin may set an underlying price", async () => {
        await expect(
          send(oracle, "setUnderlyingPrice", [nExampleSet._address, 1], {from: accounts[0]})
        ).rejects.toRevert("revert only admin may call");
      });
  
      it("sets the underlying price", async () => {
        await send(oracle, "setUnderlyingPrice", [nExampleSet._address, 1], {from: root});
        let underlying = await call(nExampleSet, "underlying", []);
        let price = await call(oracle, "assetPrices", [underlying], {from: root});
        expect(price).toEqual("1");
      });
    });
  
    describe("setDirectPrice", () => {
      it("only admin may set an underlying price", async () => {
        await expect(
          send(oracle, "setDirectPrice", [mia._address, 7], {from: accounts[0]})
        ).rejects.toRevert("revert only admin may call");
      });
  
      it("sets the direct price", async () => {
        await send(oracle, "setDirectPrice", [mia._address, 7], {from: root});
        let price = await call(oracle, "assetPrices", [mia._address], {from: root});
        expect(price).toEqual("7");
      });
    });
  
    /*describe('stale price validation', () => {
      beforeEach(async () => {
        await send(oracle, "setFeed", ["nEVMOS", evmosFeed._address], {from: root})
      });
  
      it('only admin can set stale price period', async () => {
        await expect(
          send(oracle, 'setMaxStalePeriod', [999], {from: accounts[0]})
        ).rejects.toRevert('revert only admin may call');
      });
  
      it('stale price period cannot be 0', async () => {
        await expect(
          send(oracle, 'setMaxStalePeriod', [0], {from: root})
        ).rejects.toRevert('revert stale period can\'t be zero');
      });
  
      it('modify stale price period will emit an event', async () => {
        const result = await send(oracle, 'setMaxStalePeriod', [100], {from: root})
        expect(result).toHaveLog('MaxStalePeriodUpdated', {
          oldMaxStalePeriod: 6000,
          newMaxStalePeriod: 100
        });
      });
  
      it('get underlying will return 0 if price stale', async () => {
        const ADVANCE_SECONDS = 90000;
        let price = await call(oracle, "getUnderlyingPrice", [nEvmos._address], {from: root});
        expect(price).toEqual('300000000000000000000');
        await increaseTime(ADVANCE_SECONDS);
        price = await call(oracle, "getUnderlyingPrice", [nEvmos._address], {from: root});
        expect(price).toEqual('0');
        // update round data
        const nowSeconds = Math.floor(Date.now() / 1000);
        await send(evmosFeed, 'updateRoundData', [1111, 12345, nowSeconds + ADVANCE_SECONDS, nowSeconds]); // decimal delta: 18 - 8
        price = await call(oracle, "getUnderlyingPrice", [nEvmos._address], {from: root});
        expect(price).toEqual(evmosMantissa(12345, 1e10).toFixed(0));
      });
  
      it('if updatedAt is some time in the future, revert it', async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        await send(evmosFeed, 'updateRoundData', [1111, 12345, nowSeconds + 900000, nowSeconds]); // decimal delta: 18 - 8
        await expect(
          call(oracle, "getUnderlyingPrice", [nEvmos._address], {from: root})
        ).rejects.toRevert('revert SafeMath: subtraction overflow');
      });
    })*/
  });