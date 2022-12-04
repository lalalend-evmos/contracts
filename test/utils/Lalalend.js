const hre = require("hardhat");
const ethers = hre.ethers;

const { dfn } = require('./JS');

const { 
    encodeParameters,
    evmosBalance,
    evmosMantissa,
    evmosUnsigned,
    mergeInterface
  } = require('./EVMOS');


async function makeComptroller(opts = {}) {
    const [owner,addr1, addr2] = await ethers.getSigners();

    const {
      root = owner,
      treasuryGuardian = addr1,
      treasuryAddress = addr1,
      kind = 'unitroller'
    } = opts || {};
  
    if (kind == 'bool') {
      const Comptroller = await ethers.getContractFactory('BoolComptroller');
      const comptroller = await Comptroller.deploy();
      await comptroller.deployed();

      const MIA = await ethers.getContractFactory("MIA");
      const mia = opts.mia || await MIA.deploy(opts.miaOwner || root.address);
      await mia.deployed();

      const seb = opts.seb || await makeSEB();
  
    
      const SEBUnitroller = await ethers.getContractFactory("SEBUnitroller");
      let sebUnitroller = await SEBUnitroller.deploy();
      await sebUnitroller.deployed();

      const SEBController = await ethers.getContractFactory("SEBControllerHarness");
      const sebController = await SEBController.deploy();
      await sebController.deployed();

      await sebUnitroller.setPendingImplementation(sebController.address);
      await sebController.become(sebUnitroller.address);
      mergeInterface(sebUnitroller, sebController);

      sebUnitroller = await SEBController.attach(sebUnitroller.address);
  
      await sebUnitroller.setComptroller(comptroller.address);
      await sebUnitroller.setSEBAddress(seb.address);
      await sebUnitroller.initialize();
      await seb.rely(sebUnitroller.address);
  
      //await unitroller, '_setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);
  
      return Object.assign(comptroller, { mia, seb, sebcontroller: sebUnitroller });
    }
  
    if (kind == 'boolFee') {
      const Comptroller = await ethers.getContractFactory('BoolComptroller');
      const comptroller = await Comptroller.deploy();
      await comptroller.deployed();
      await comptroller.setTreasuryData(treasuryGuardian, treasuryAddress, 1e14);
      return comptroller;
    }
  
    if (kind == 'false-marker') {
      const FalseMaker = await ethers.getContractFactory("FalseMarkerMethodComptroller");
      const falseMaker = await FalseMaker.deploy();
      await falseMaker.deployed();
      return falseMaker;
    }
  
    if (kind == 'v1-no-proxy') {
      const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
      const comptrollerLens = await ComptrollerLens.deploy();
      await comptrollerLens.deployed();

      const Comptroller = await ethers.getContractFactory("ComptrollerHarness");
      const comptroller = await Comptroller.deploy();
      await comptroller.deployed();

      const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
      const closeFactor = evmosMantissa(dfn(opts.closeFactor, .051));
  
      await comptroller.setCloseFactor(closeFactor);
      await comptroller.setPriceOracle(priceOracle.address);
      await comptroller.setComptrollerLens(comptrollerLens.address);
  
      return Object.assign(comptroller, { priceOracle });
    }
  
    /*if (kind == 'unitroller-g2') {
      const unitroller = opts.unitroller || await deploy('Unitroller');
      const comptroller = await deploy('ComptrollerScenarioG2');
      const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
      const closeFactor = evmosMantissa(dfn(opts.closeFactor, .051));
      const liquidationIncentive = evmosMantissa(1);
      const mia = opts.mia || await deploy('MIA', [opts.compOwner || root]);
      const miaRate = evmosUnsigned(dfn(opts.miaRate, 1e18));
  
      await unitroller, '_setPendingImplementation', [comptroller._address]);
      await comptroller, '_become', [unitroller._address]);
      mergeInterface(unitroller, comptroller);
      await unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
      await unitroller, '_setCloseFactor', [closeFactor]);
      await unitroller, '_setPriceOracle', [priceOracle._address]);
      await unitroller, 'harnessSetNemoRate', [miaRate]);
      await unitroller, 'setMIAAddress', [mia._address]); // harness only
  
      return Object.assign(unitroller, { priceOracle, mia });
    }*/
  
    if (kind == 'unitroller') {
      const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
      const comptrollerLens = await ComptrollerLens.deploy();
      await comptrollerLens.deployed();

      const Unitroller = await ethers.getContractFactory("Unitroller")
      const unitroller = opts.unitroller || await Unitroller.deploy();
      await unitroller.deployed();

      const Comptroller = await ethers.getContractFactory("ComptrollerHarness");
      const comptroller = await Comptroller.deploy();
      await comptroller.deployed();

      const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
      const closeFactor = evmosMantissa(dfn(opts.closeFactor, .051));
      const liquidationIncentive = evmosMantissa(1);

      const MIA = await ethers.getContractFactory("MIA");
      const mia = opts.mia || await MIA.deploy(opts.miaOwner || root);
      await mia.deployed();

      const seb = opts.seb || await makeSEB();
      const miaRate = evmosUnsigned(dfn(opts.miaRate, 1e18));
  
      await unitroller.setPendingImplementation(comptroller.address);
      await comptroller.become(unitroller.address);
      mergeInterface(unitroller, comptroller);
        
      const SEBUnitroller = await ethers.getContractFactory("SEBUnitroller");
      const sebUnitroller = await SEBUnitroller.deploy();
      await sebUnitroller.deployed();

      const SEBController = await ethers.getContractFactory("SEBControllerHarness");
      const sebController = await SEBController.deploy();
      await sebController.deployed();

      await sebUnitroller.setPendingImplementation(sebController.address);
      await sebController.become(sebUnitroller.address);
      mergeInterface(sebUnitroller, sebController);
  
      unitroller = await Comptroller.attach(unitroller.address);
      sebUnitroller = await SEBController.attach(sebUnitroller.address);

      await unitroller.setSEBController(sebUnitroller.address);
      await sebUnitroller.setComptroller(unitroller.address);
      await unitroller.setLiquidationIncentive(liquidationIncentive);
      await unitroller.setCloseFactor(closeFactor);
      await unitroller.setPriceOracle(priceOracle.address);
      await unitroller.setComptrollerLens(comptrollerLens.address);
      await unitroller.setMIAAddress(mia.address); // harness only
      await sebUnitroller.setSEBAddress(seb.address); // harness only
      await unitroller.harnessSetNemoRate(miaRate);
      await sebUnitroller.initialize();
      await seb.rely(sebUnitroller.address);
  
      await unitroller.setTreasuryData(treasuryGuardian, treasuryAddress, 1e14);
  
      return Object.assign(unitroller, { priceOracle, mia, seb, sebUnitroller });
    }
}

async function makeNToken(opts = {}) {
    const [owner,addr1, addr2] = await ethers.getSigners();

    const {
      root = owner,
      kind = 'nerc20'
    } = opts || {};
    const comptroller = opts.comptroller || await makeComptroller(opts.comptrollerOpts);
    const interestRateModel = opts.interestRateModel || await makeInterestRateModel(opts.interestRateModelOpts);
    const exchangeRate = evmosMantissa(dfn(opts.exchangeRate, 1));
    const decimals = evmosUnsigned(dfn(opts.decimals, 8));
    const symbol = opts.symbol || (kind === 'nevmos' ? 'nEVMOS' : 'nOMG');
    const name = opts.name || `NToken ${symbol}`;
    const admin = opts.admin || root;
  
    let nToken, underlying;
    let nDelegator, nDelegatee;
    let NToken, NDelegator, NDelegatee, Underlying;
  
    switch (kind) {
      case 'nevmos':
        NToken = await ethers.getContractFactory("NEVMOSHarness");
        nToken = await NToken.deploy(
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin
        )
        await nToken.deployed();
        break;
  
      case 'nmia':
        Underlying = await ethers.getContractFactory("MIA");
        underlying = await Underlying.deploy(root);
        await underlying.deployed();
        NDelegatee = await ethers.getContractFactory("NMiaLikeDelegate");
        NDelegator = await ethers.getContractFactory("NErc20Delegator");
        nDelegatee = await NDelegatee.deploy();
        await nDelegatee.deployed();
        nDelegator = await NDelegator.deploy(
            underlying.address,
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin,
            nDelegatee.address,
            "0x0"
        );
        await nDelegator.deployed();
        nToken = await NDelegatee.attach(nDelegator.address); 
        //nToken = await saddle.getContractAt('NNemoLikeDelegate', nDelegator._address);
        break;
  
      case 'nerc20':
      default:
        NDelegator = await ethers.getContractFactory("NErc20Delegator");
        NDelegatee = await ethers.getContractFactory("NErc20DelegateHarness");
        underlying = opts.underlying || await makeToken(opts.underlyingOpts);
        nDelegatee = await NDelegatee.deploy();
        await nDelegatee.deployed();
        nDelegator = await NDelegator.deploy(
            underlying.address,
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin,
            nDelegatee.address,
            "0x0"
        );
        await nDelegator.deployed();
        nToken = await NDelegatee.attach(nDelegator.address); //await saddle.getContractAt('NErc20DelegateHarness', nDelegator._address);
        break;
    }
  
    if (opts.supportMarket) {
      await comptroller.supportMarket(nToken.address);
    }
  
    if (opts.addNemoMarket) {
      await comptroller.addMiaMarket(nToken.address);
    }
  
    if (opts.underlyingPrice) {
      const price = evmosMantissa(opts.underlyingPrice);
      await comptroller.priceOracle.setUnderlyingPrice(nToken.address, price);
    }
  
    if (opts.collateralFactor) {
      const factor = evmosMantissa(opts.collateralFactor);
      expect(await comptroller.setCollateralFactor(nToken.address, factor)).toSucceed();
    }
  
    return Object.assign(nToken, { name, symbol, underlying, comptroller, interestRateModel });
}

async function makeSEB(opts = {}) {
    const {
      chainId = 9000
    } = opts || {};
    
    const SEB = await ethers.getContractFactory("SEBScenario");
    let seb;
  
    seb = await SEB.deploy(chainId);
    await seb.deployed();
  
    return Object.assign(seb);
}

async function makeInterestRateModel(opts = {}) {
const [owner,addr1, addr2] = await ethers.getSigners();

const {
    root = owner,
    kind = 'harnessed'
} = opts || {};

if (kind == 'harnessed') {
    const borrowRate = evmosMantissa(dfn(opts.borrowRate, 0));
    const InterestRateModelHarness = await ethers.getContractFactory("InterestRateModelHarness");
    const irModel = await InterestRateModelHarness.deploy(borrowRate);
    await irModel.deployed();
    return irModel;
}

if (kind == 'false-marker') {
    const borrowRate = evmosMantissa(dfn(opts.borrowRate, 0));
    const FalseMarkerMethodInterestRateModel = await ethers.getContractFactory("FalseMarkerMethodInterestRateModel");
    const falseMarkerMethodInterestRateModel = await FalseMarkerMethodInterestRateModel.deploy(borrowRate);
    await falseMarkerMethodInterestRateModel.deployed();
    return falseMarkerMethodInterestRateModel;
}

if (kind == 'white-paper') {
    const baseRate = evmosMantissa(dfn(opts.baseRate, 0));
    const multiplier = evmosMantissa(dfn(opts.multiplier, 1e-18));
    const WhitePaperInterestRateModel = await ethers.getContractFactory("WhitePaperInterestRateModel");
    const whitePaperInterestRateModel = await WhitePaperInterestRateModel.deploy(baseRate, multiplier);
    await whitePaperInterestRateModel.deployed();
    return whitePaperInterestRateModel;
}

if (kind == 'jump-rate') {
    const baseRate = evmosMantissa(dfn(opts.baseRate, 0));
    const multiplier = evmosMantissa(dfn(opts.multiplier, 1e-18));
    const jump = evmosMantissa(dfn(opts.jump, 0));
    const kink = evmosMantissa(dfn(opts.kink, 0));
    const JumpRateModel = await ethers.getContractFactory("JumpRateModel");
    const jumpRateModel = await JumpRateModel.deploy(baseRate, multiplier, jump, kink);
    await jumpRateModel.deployed();
    return jumpRateModel;
}

}

async function makePriceOracle(opts = {}) {
const [owner,addr1, addr2] = await ethers.getSigners();

const {
    root = owner,
    kind = 'simple'
} = opts || {};

if (kind == 'simple') {
    const SimplePriceOracle = await ethers.getContractFactory('SimplePriceOracle');
    const simplePriceOracle = await SimplePriceOracle.deploy();
    await simplePriceOracle.deployed();
    return simplePriceOracle;
}
}

async function makeChainlinkOracle(opts = {}) {
const [owner,addr1, addr2] = await ethers.getSigners();

const {
    root = owner
} = opts || {};
    const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
    const mockV3Aggregator = await MockV3Aggregator.deploy(opts.decimals, opts.initialAnswer);
    await mockV3Aggregator.deployed();
    return mockV3Aggregator;
}

async function makeToken(opts = {}) {
    const [owner,addr1, addr2] = await ethers.getSigners();

const {
    root = owner,
    kind = 'erc20'
} = opts || {};

if (kind == 'erc20') {
    const quantity = evmosUnsigned(dfn(opts.quantity, 1e25));
    const decimals = evmosUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'OMG';
    const name = opts.name || `Erc20 ${symbol}`;
    const ERC20Harness = await ethers.getContractFactory("ERC20Harness");
    const erc20Harness = await ERC20Harness.deploy(quantity, name, decimals, symbol);
    return erc20Harness;
}
}

async function balanceOf(token, account) {
    return evmosUnsigned(await token.balanceOf(account));
}
  
async function totalSupply(token) {
    return evmosUnsigned(await token.totalSupply());
}

async function borrowSnapshot(nToken, account) {
    const { principal, interestIndex } = await nToken.harnessAccountBorrows(account);
    return { principal: evmosUnsigned(principal), interestIndex: evmosUnsigned(interestIndex) };
}

async function totalBorrows(nToken) {
    return evmosUnsigned(await nToken.totalBorrows());
}

async function totalReserves(nToken) {
    return evmosUnsigned(await nToken.totalReserves());
}

async function enterMarkets(nTokens, from) {
    // tocheck
    return await nTokens[0].comptroller.enterMarkets(nTokens.map(c => c._address), { from });
}

async function fastForward(nToken, blocks = 5) {
    return await nToken.harnessFastForward(blocks);
}

async function setBalance(nToken, account, balance) {
    return await nToken.harnessSetBalance(account, balance);
}

async function setMintedSEBOf(comptroller, account, balance) {
    return await comptroller.harnessSetMintedSEBOf(account, balance);
}

async function setSEBBalance(seb, account, balance) {
    return await seb.harnessSetBalanceOf(account, balance);
}

async function setEVMOSBalance(nEvmos, balance) {
    const [owner,addr1, addr2] = await ethers.getSigners();

    const current = await evmosBalance(nEvmos._address);
    const root = owner;
    expect(await nEvmos.harnessDoTransferOut(root, current)).toSucceed();
    //tocheck
    expect(await nEvmos.harnessDoTransferIn(root, balance, { value: balance })).toSucceed();
}

async function getBalances(nTokens, accounts) {
    const balances = {};
    for (let nToken of nTokens) {
        const nBalances = balances[nToken.address] = {};
        for (let account of accounts) {
        nBalances[account] = {
            evmos: await evmosBalance(account),
            cash: nToken.underlying && await balanceOf(nToken.underlying, account),
            tokens: await balanceOf(nToken, account),
            borrows: (await borrowSnapshot(nToken, account)).principal
        };
        }
        nBalances[nToken.address] = {
        evmos: await evmosBalance(nToken.address),
        cash: nToken.underlying && await balanceOf(nToken.underlying, nToken.address),
        tokens: await totalSupply(nToken),
        borrows: await totalBorrows(nToken),
        reserves: await totalReserves(nToken)
        };
    }
    return balances;
}

async function getBalancesWithSEB(seb, nTokens, accounts) {
    const balances = {};
    for (let nToken of nTokens) {
        const nBalances = balances[nToken.address] = {};
        const sebBalancesData = balances[seb.address] = {};
        for (let account of accounts) {
        nBalances[account] = {
            evmos: await evmosBalance(account),
            cash: nToken.underlying && await balanceOf(nToken.underlying, account),
            tokens: await balanceOf(nToken, account),
            borrows: (await borrowSnapshot(nToken, account)).principal
        };
        sebBalancesData[account] = {
            seb: (await balanceOf(seb, account)),
        };
        }
        nBalances[nToken.address] = {
        evmos: await evmosBalance(nToken.address),
        cash: nToken.underlying && await balanceOf(nToken.underlying, nToken.address),
        tokens: await totalSupply(nToken),
        borrows: await totalBorrows(nToken),
        reserves: await totalReserves(nToken),
        };
    }
    return balances;
}

async function adjustBalances(balances, deltas) {
    for (let delta of deltas) {
        let nToken, account, key, diff;
        if (delta.length == 4) {
        ([nToken, account, key, diff] = delta);
        } else {
        ([nToken, key, diff] = delta);
        account = nToken.address;
        }
        balances[nToken.address][account][key] = balances[nToken.address][account][key].add(diff);
    }
    return balances;
}

async function adjustBalancesWithSEB(balances, deltas, seb) {
    for (let delta of deltas) {
        let nToken, account, key, diff;
        if (delta[0]._address != seb._address) {
        if (delta.length == 4) {
            ([nToken, account, key, diff] = delta);
        } else {
            ([nToken, key, diff] = delta);
            account = nToken.address;
        }
        balances[nToken.address][account][key] = balances[nToken.address][account][key].add(diff);
        } else {
        [nToken, account, key, diff] = delta;
        balances[seb.address][account][key] = balances[seb.address][account][key].add(diff);
        }
    }
    return balances;
}

async function preApprove(nToken, from, amount, opts = {}) {
    if (dfn(opts.faucet, true)) {
        expect(await nToken.underlying.harnessSetBalance(from, amount, { from })).toSucceed();
    }

    return nToken.underlying.approve(nToken.address, amount, { from });
}

async function preApproveSEB(comptroller, seb, from, to, amount, opts = {}) {
    if (dfn(opts.faucet, true)) {
        expect(await seb.harnessSetBalanceOf(from, amount, { from })).toSucceed();
        await comptroller.harnessSetMintedSEBOf(from, amount);
    }

    return seb.approve(to, amount, { from });
}

async function quickMint(nToken, minter, mintAmount, opts = {}) {
    // make sure to accrue interest
    await fastForward(nToken, 1);

    if (dfn(opts.approve, true)) {
        expect(await preApprove(nToken, minter, mintAmount, opts)).toSucceed();
    }
    if (dfn(opts.exchangeRate)) {
        expect(await nToken.harnessSetExchangeRate(evmosMantissa(opts.exchangeRate))).toSucceed();
    }
    return nToken.mint(mintAmount, { from: minter });
}

async function quickMintSEB(comptroller, seb, sebMinter, sebMintAmount, opts = {}) {
    // make sure to accrue interest
    await fastForward(seb, 1);

    expect(await seb.harnessSetBalanceOf(sebMinter, sebMintAmount, { sebMinter })).toSucceed();
    expect(await comptroller.harnessSetMintedsebs(sebMinter, sebMintAmount, { sebMinter })).toSucceed();
    expect(await seb.harnessIncrementTotalSupply(sebMintAmount, { sebMinter })).toSucceed();
}

async function preSupply(nToken, account, tokens, opts = {}) {
    if (dfn(opts.total, true)) {
        expect(await nToken.harnessSetTotalSupply(tokens)).toSucceed();
    }
    return nToken.harnessSetBalance(account, tokens);
}

async function quickRedeem(nToken, redeemer, redeemTokens, opts = {}) {
    await fastForward(nToken, 1);

    if (dfn(opts.supply, true)) {
        expect(await preSupply(nToken, redeemer, redeemTokens, opts)).toSucceed();
    }
    if (dfn(opts.exchangeRate)) {
        expect(await nToken.harnessSetExchangeRate(evmosMantissa(opts.exchangeRate))).toSucceed();
    }
    return nToken.redeem(redeemTokens, { from: redeemer });
}

async function quickRedeemUnderlying(nToken, redeemer, redeemAmount, opts = {}) {
    await fastForward(nToken, 1);

    if (dfn(opts.exchangeRate)) {
        expect(await nToken.harnessSetExchangeRate(evmosMantissa(opts.exchangeRate))).toSucceed();
    }
    return nToken.redeemUnderlying(redeemAmount, { from: redeemer });
}

async function setOraclePrice(nToken, price) {
    return nToken.comptroller.priceOracle.setUnderlyingPrice(nToken.address, evmosMantissa(price));
}

async function setOraclePriceFromMantissa(nToken, price) {
    return nToken.comptroller.priceOracle.setUnderlyingPrice(nToken.address, price);
}

async function setBorrowRate(nToken, rate) {
    return nToken.interestRateModel.setBorrowRate(evmosMantissa(rate));
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
    return interestRateModel.getBorrowRate(cash, borrows, reserves.map(evmosUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
    return interestRateModel.getSupplyRate(cash, borrows, reserves, reserveFactor);
}

async function pretendBorrow(nToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
    await nToken.harnessSetTotalBorrows(evmosUnsigned(principalRaw));
    await nToken.harnessSetAccountBorrows(borrower, evmosUnsigned(principalRaw), evmosMantissa(accountIndex));
    await nToken.harnessSetBorrowIndex(evmosMantissa(marketIndex));
    await nToken.harnessSetAccrualBlockNumber(evmosUnsigned(blockNumber));
    await nToken.harnessSetBlockNumber(evmosUnsigned(blockNumber));
}

async function pretendSEBMint(comptroller, sebcontroller, seb, sebMinter, principalRaw, totalSupply, blockNumber = 2e7) {
    await comptroller.harnessSetMintedSEBOf(sebMinter, evmosUnsigned(principalRaw));
    await seb.harnessIncrementTotalSupply(evmosUnsigned(principalRaw));
    await seb.harnessSetBalanceOf(sebMinter, evmosUnsigned(principalRaw));
    await sebcontroller.harnessSetBlockNumber(evmosUnsigned(blockNumber));
}

async function setMarketSupplyCap(comptroller, nTokens, supplyCaps) {
    await comptroller.setMarketSupplyCaps(nTokens, supplyCaps);
}

module.exports = {
    makeComptroller,
    makeNToken,
    makeSEB,
    makeInterestRateModel,
    makePriceOracle,
    makeChainlinkOracle,
    makeToken,

    balanceOf,
    totalSupply,
    borrowSnapshot,
    totalBorrows,
    totalReserves,
    enterMarkets,
    fastForward,
    setBalance,
    setMintedSEBOf,
    setSEBBalance,
    setEVMOSBalance,
    getBalances,
    getBalancesWithSEB,
    adjustBalances,
    adjustBalancesWithSEB,

    preApprove,
    preApproveSEB,
    quickMint,
    quickMintSEB,

    preSupply,
    quickRedeem,
    quickRedeemUnderlying,

    setOraclePrice,
    setOraclePriceFromMantissa,
    setBorrowRate,
    getBorrowRate,
    getSupplyRate,
    pretendBorrow,
    pretendSEBMint,
    setMarketSupplyCap
};