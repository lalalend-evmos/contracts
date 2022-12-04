const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { dfn } = require('./utils/JS');

const {
    evmosUnsigned, evmosMantissa
  } = require('./utils/EVMOS');

describe("Mia Oracle", function () {
    let nEvmos, miaPriceOracle, evmosFeed,usdcFeed, usdtFeed, nExampleSet, nExampleUnSet, nToken, nUsdc, nUsdt, seb, nMia;
    let owner, addr1, addr2 ;
    beforeEach(async ()=> {
        [owner, addr1, addr2] = await ethers.getSigners();

        const MiaPriceOracleMock = await ethers.getContractFactory("MiaPriceOracleMock");

        miaPriceOracle = await MiaPriceOracleMock.deploy();

        await miaPriceOracle.deployed();


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

        // DEPLOY nUSDT, nUSDC, nExampleSet, nExampleUnSet, MIA, SEB

        //nMIA
        const MIA = await ethers.getContractFactory("MIA");
        const mia = await MIA.deploy(owner.address);
        await mia.deployed();

        const NDelegatee = await ethers.getContractFactory("NMiaLikeDelegate");
        const NDelegator = await ethers.getContractFactory("NErc20Delegator");

        const nDelegatee = await NDelegatee.deploy();
        await nDelegatee.deployed();
        const nDelegator = await NDelegator.deploy(
            mia.address,
            comptroller_.address,
            irModel.address,
            exchangeRate,
            "Lalalend MIA",
            "MIA",
            8,
            owner.address,
            nDelegatee.address,
            "0x00"
        );
        await nDelegator.deployed();
        nMia = await NDelegatee.attach(nDelegator.address); 
        await comptroller_._supportMarket(nMia.address)

        
        //SEB
        const SEB = await ethers.getContractFactory("SEBScenario");
        seb = await SEB.deploy(9000);
        await seb.deployed();
       // await comptroller_._supportMarket(seb.address)



        // USDC & nUSDC
        const NDelegateeHarness = await ethers.getContractFactory("NErc20DelegateHarness");

        const USDC = await ethers.getContractFactory("ERC20Harness");
        const amount = await ethers.utils.parseUnits("1", 25);
        const usdc = await USDC.deploy(amount, "USDC", 18, "USDC");
        await usdc.deployed();

        const nDelegateHarness = await NDelegateeHarness.deploy();
        await nDelegateHarness.deployed();

        const nDelegatorUsdc = await NDelegator.deploy(
            usdc.address,
            comptroller_.address,
            irModel.address,
            exchangeRate,
            "Lalalend USDC",
            "nUSDC",
            6,
            owner.address,
            nDelegateHarness.address,
            "0x00"
        );
        await nDelegatorUsdc.deployed();
        nUsdc = await NDelegateeHarness.attach(nDelegatorUsdc.address);
        await comptroller_._supportMarket(nUsdc.address)


        // USDT & nUSDT
        const USDT = await ethers.getContractFactory("ERC20Harness");
        const usdt = await USDT.deploy(amount, "USDT", 18, "USDT");
        await usdt.deployed();

        const nDelegatorUsdt = await NDelegator.deploy(
            usdt.address,
            comptroller_.address,
            irModel.address,
            exchangeRate,
            "Lalalend USDT",
            "nUSDT",
            6,
            owner.address,
            nDelegateHarness.address,
            "0x00"
        );
        await nDelegatorUsdt.deployed();
        nUsdt = await NDelegateeHarness.attach(nDelegatorUsdt.address);
        await comptroller_._supportMarket(nUsdt.address)


        // exampleSet & exampleUnSet
        const ExampleSetUnderlying = await ethers.getContractFactory("ERC20Harness");
        const exampleSetUnderlying = await ExampleSetUnderlying.deploy(amount, "Example set Underlying", 18, "Eset");
        await exampleSetUnderlying.deployed();

        const nDelegatorESet = await NDelegator.deploy(
            exampleSetUnderlying.address,
            comptroller_.address,
            irModel.address,
            exchangeRate,
            "Lalalend Example Set",
            "nESet",
            8,
            owner.address,
            nDelegateHarness.address,
            "0x00"
        );
        await nDelegatorESet.deployed();
        nExampleSet = await NDelegateeHarness.attach(nDelegatorESet.address);
        await comptroller_._supportMarket(nExampleSet.address)


        const ExampleUnSetUnderlying = await ethers.getContractFactory("ERC20Harness");
        const exampleUnSetUnderlying = await ExampleUnSetUnderlying.deploy(amount, "Example Unset Underlying", 18, "EUset");
        await exampleUnSetUnderlying.deployed();

        const nDelegatorEUnset = await NDelegator.deploy(
            exampleUnSetUnderlying.address,
            comptroller_.address,
            irModel.address,
            exchangeRate,
            "Lalalend Example UnSet",
            "nEUnSet",
            8,
            owner.address,
            nDelegateHarness.address,
            "0x00"
        );
        await nDelegatorEUnset.deployed();
        nExampleUnSet = await NDelegateeHarness.attach(nDelegatorEUnset.address);
        await comptroller_._supportMarket(nExampleUnSet.address)

        

        const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
        evmosFeed = await MockV3Aggregator.deploy(8, "30000000000");
        await evmosFeed.deployed();
        usdcFeed = await MockV3Aggregator.deploy(8,"100000000000000000000");
        await usdcFeed.deployed();
        usdtFeed = await MockV3Aggregator.deploy(8,"100000000000000000000");
        await usdtFeed.deployed();

    })

    async function deployOracleFixture() {
        const [owner, addr1, addr2] = await ethers.getSigners();

        const MiaPriceOracleMock = await ethers.getContractFactory("MiaPriceOracleMock");

        const miaPriceOracle = await MiaPriceOracleMock.deploy();

        await miaPriceOracle.deployed();

        // Fixtures can return anything you consider useful for your tests
        return { MiaPriceOracleMock, miaPriceOracle, owner, addr1, addr2 };
    }
    async function deployNEvmosFixture() {

        const [owner, addr1, addr2] = await ethers.getSigners();

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
        const nEvmos = await NToken.deploy(
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


        const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
        const evmosFeed = await MockV3Aggregator.deploy(8, "30000000000");
        await evmosFeed.deployed();
        return { simplePriceOracle, comptroller_, owner, addr1, addr2, evmosFeed, nEvmos};

    }
  
  it("should deploy mia oracle mock with owner as admin", async function () {
    const { miaPriceOracle, owner } = await loadFixture(deployOracleFixture);

    const ownerOfOracle = await miaPriceOracle.admin();
    expect(owner.address).to.equal(ownerOfOracle);
  });

  describe("setFeed", () => {
    it("only admin may set a feed", async ()=> {
        const { miaPriceOracle, owner, addr1 } = await loadFixture(deployOracleFixture);
        const { evmosFeed } = await loadFixture(deployNEvmosFixture);
        await expect(miaPriceOracle.connect(addr1).setFeed("nEVMOS",evmosFeed.address)).to.be.reverted;
    })

    it("cannot set feed to self address", async () => {
        const { miaPriceOracle, owner, addr1 } = await loadFixture(deployOracleFixture);
        await expect(miaPriceOracle.setFeed("nEVMOS",miaPriceOracle.address)).to.be.reverted;
      });
  
      it("cannot set feed to zero address", async () => {
        const { miaPriceOracle, owner, addr1 } = await loadFixture(deployOracleFixture);
        await expect(miaPriceOracle.setFeed("nEVMOS","0x0000000000000000000000000000000000000000")).to.be.reverted;
      });
  
      it("sets a feed", async () => {
        await miaPriceOracle.setFeed("nEVMOS", evmosFeed.address);
        const feed = await miaPriceOracle.getFeed("nEVMOS");
        await expect(feed).to.equal(evmosFeed.address);
      });
  })

  describe("get underlying price", ()=> {
    beforeEach(async () => {
        await miaPriceOracle.setFeed("USDC", usdcFeed.address);
        await miaPriceOracle.setFeed("USDT", usdtFeed.address);
        await miaPriceOracle.setFeed("nEVMOS", evmosFeed.address);

        await miaPriceOracle.setDirectPrice(nMia.address, 7);
        await miaPriceOracle.setUnderlyingPrice(nExampleSet.address, 1);
      });
  
      it("gets the price from Chainlink for nEVMOS", async () => {
        let price = await miaPriceOracle.getUnderlyingPrice(nEvmos.address);
        expect(price).to.equal("300000000000000000000");
      });
  
      it("gets the price from Chainlink for USDC", async () => {
        let price = await miaPriceOracle.getUnderlyingPrice(nUsdc.address);
        expect(price).to.equal("1000000000000000000000000000000");
      });
  
      it("gets the price from Chainlink for USDT", async () => {
        let price = await miaPriceOracle.getUnderlyingPrice(nUsdt.address);
        expect(price).to.equal("1000000000000000000000000000000");
      });

      it("gets the direct price of SEB", async () => {
        let price = await miaPriceOracle.getUnderlyingPrice(seb.address);
        expect(price).to.equal("1000000000000000000");
      });
  
      it("gets the constant price of MIA", async () => {
        let price = await miaPriceOracle.getUnderlyingPrice(nMia.address);
        expect(price).to.equal("7");
      });
  
      it("gets the direct price of a set asset", async () => {
        let price = await miaPriceOracle.getUnderlyingPrice(nExampleSet.address);
        expect(price).to.equal("1");
      });
  
      it("reverts if no price or feed has been set", async () => {
        await expect(miaPriceOracle.getUnderlyingPrice(nExampleUnSet.address)).to.be.reverted;
      });
  })
});