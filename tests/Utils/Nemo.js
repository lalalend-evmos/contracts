"use strict";

const { dfn } = require('./JS');
const { 
  encodeParameters,
  evmosBalance,
  evmosMantissa,
  evmosUnsigned,
  mergeInterface
} = require('./EVMOS');

async function makeComptroller(opts = {}) {
  const {
    root = saddle.account,
    treasuryGuardian = saddle.accounts[4],
    treasuryAddress = saddle.accounts[4],
    kind = 'unitroller'
  } = opts || {};

  if (kind == 'bool') {
    const comptroller = await deploy('BoolComptroller');

    const mia = opts.mia || await deploy('MIA', [opts.miaOwner || root]);
    const seb = opts.seb || await makeSEB();

    const sebunitroller = await deploy('SEBUnitroller');
    const sebcontroller = await deploy('SEBControllerHarness');
    
    await send(sebunitroller, '_setPendingImplementation', [sebcontroller._address]);
    await send(sebcontroller, '_become', [sebunitroller._address]);
    mergeInterface(sebunitroller, sebcontroller);

    await send(sebunitroller, '_setComptroller', [comptroller._address]);
    await send(sebunitroller, 'setSEBAddress', [seb._address]);
    await send(sebunitroller, 'initialize');
    await send(seb, 'rely', [sebunitroller._address]);

    //await send(unitroller, '_setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);

    return Object.assign(comptroller, { mia, seb, sebcontroller: sebunitroller });
  }

  if (kind == 'boolFee') {
    const comptroller = await deploy('BoolComptroller');
    await send(comptroller, 'setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);
    return comptroller;
  }

  if (kind == 'false-marker') {
    return await deploy('FalseMarkerMethodComptroller');
  }

  if (kind == 'v1-no-proxy') {
    const comptrollerLens = await deploy('ComptrollerLens');
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = evmosMantissa(dfn(opts.closeFactor, .051));

    await send(comptroller, '_setCloseFactor', [closeFactor]);
    await send(comptroller, '_setPriceOracle', [priceOracle._address]);
    await send(comptroller, '_setComptrollerLens', [comptrollerLens._address]);

    return Object.assign(comptroller, { priceOracle });
  }

  if (kind == 'unitroller-g2') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerScenarioG2');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = evmosMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = evmosMantissa(1);
    const mia = opts.mia || await deploy('MIA', [opts.compOwner || root]);
    const miaRate = evmosUnsigned(dfn(opts.miaRate, 1e18));

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, 'harnessSetNemoRate', [miaRate]);
    await send(unitroller, 'setMIAAddress', [mia._address]); // harness only

    return Object.assign(unitroller, { priceOracle, mia });
  }

  if (kind == 'unitroller') {
    const comptrollerLens = await deploy('ComptrollerLens');
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = evmosMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = evmosMantissa(1);
    const mia = opts.mia || await deploy('MIA', [opts.miaOwner || root]);
    const seb = opts.seb || await makeSEB();
    const miaRate = evmosUnsigned(dfn(opts.miaRate, 1e18));

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);

    const sebunitroller = await deploy('SEBUnitroller');
    const sebcontroller = await deploy('SEBControllerHarness');
    
    await send(sebunitroller, '_setPendingImplementation', [sebcontroller._address]);
    await send(sebcontroller, '_become', [sebunitroller._address]);
    mergeInterface(sebunitroller, sebcontroller);

    await send(unitroller, '_setSEBController', [sebunitroller._address]);
    await send(sebunitroller, '_setComptroller', [unitroller._address]);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, '_setComptrollerLens', [comptrollerLens._address]);
    await send(unitroller, 'setMIAAddress', [mia._address]); // harness only
    await send(sebunitroller, 'setSEBAddress', [seb._address]); // harness only
    await send(unitroller, 'harnessSetNemoRate', [miaRate]);
    await send(sebunitroller, 'initialize');
    await send(seb, 'rely', [sebunitroller._address]);

    await send(unitroller, '_setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);

    return Object.assign(unitroller, { priceOracle, mia, seb, sebunitroller });
  }
}

async function makeNToken(opts = {}) {
  const {
    root = saddle.account,
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
  let nDelegator, nDelegatee, nDaiMaker;

  switch (kind) {
    case 'nevmos':
      nToken = await deploy('NEVMOSHarness',
        [
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin
        ])
      break;

    case 'ndai':
      nDaiMaker  = await deploy('NDaiDelegateMakerHarness');
      underlying = nDaiMaker;
      nDelegatee = await deploy('NDaiDelegateHarness');
      nDelegator = await deploy('NErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          nDelegatee._address,
          encodeParameters(['address', 'address'], [nDaiMaker._address, nDaiMaker._address])
        ]
      );
      nToken = await saddle.getContractAt('NDaiDelegateHarness', nDelegator._address);
      break;

    case 'nmia':
      underlying = await deploy('MIA', [opts.compHolder || root]);
      nDelegatee = await deploy('NMiaLikeDelegate');
      nDelegator = await deploy('NErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          nDelegatee._address,
          "0x0"
        ]
      );
      nToken = await saddle.getContractAt('NNemoLikeDelegate', nDelegator._address);
      break;

    case 'nerc20':
    default:
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      nDelegatee = await deploy('NErc20DelegateHarness');
      nDelegator = await deploy('NErc20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          nDelegatee._address,
          "0x0"
        ]
      );
      nToken = await saddle.getContractAt('NErc20DelegateHarness', nDelegator._address);
      break;
  }

  if (opts.supportMarket) {
    await send(comptroller, '_supportMarket', [nToken._address]);
  }

  if (opts.addNemoMarket) {
    await send(comptroller, '_addMiaMarket', [nToken._address]);
  }

  if (opts.underlyingPrice) {
    const price = evmosMantissa(opts.underlyingPrice);
    await send(comptroller.priceOracle, 'setUnderlyingPrice', [nToken._address, price]);
  }

  if (opts.collateralFactor) {
    const factor = evmosMantissa(opts.collateralFactor);
    expect(await send(comptroller, '_setCollateralFactor', [nToken._address, factor])).toSucceed();
  }

  return Object.assign(nToken, { name, symbol, underlying, comptroller, interestRateModel });
}

async function makeSEB(opts = {}) {
  const {
    chainId = 9000
  } = opts || {};

  let seb;

  seb = await deploy('SEBScenario',
    [
      chainId
    ]
  );

  return Object.assign(seb);
}

async function makeInterestRateModel(opts = {}) {
  const {
    root = saddle.account,
    kind = 'harnessed'
  } = opts || {};

  if (kind == 'harnessed') {
    const borrowRate = evmosMantissa(dfn(opts.borrowRate, 0));
    return await deploy('InterestRateModelHarness', [borrowRate]);
  }

  if (kind == 'false-marker') {
    const borrowRate = evmosMantissa(dfn(opts.borrowRate, 0));
    return await deploy('FalseMarkerMethodInterestRateModel', [borrowRate]);
  }

  if (kind == 'white-paper') {
    const baseRate = evmosMantissa(dfn(opts.baseRate, 0));
    const multiplier = evmosMantissa(dfn(opts.multiplier, 1e-18));
    return await deploy('WhitePaperInterestRateModel', [baseRate, multiplier]);
  }

  if (kind == 'jump-rate') {
    const baseRate = evmosMantissa(dfn(opts.baseRate, 0));
    const multiplier = evmosMantissa(dfn(opts.multiplier, 1e-18));
    const jump = evmosMantissa(dfn(opts.jump, 0));
    const kink = evmosMantissa(dfn(opts.kink, 0));
    return await deploy('JumpRateModel', [baseRate, multiplier, jump, kink]);
  }
}

async function makePriceOracle(opts = {}) {
  const {
    root = saddle.account,
    kind = 'simple'
  } = opts || {};

  if (kind == 'simple') {
    return await deploy('SimplePriceOracle');
  }
}

async function makeChainlinkOracle(opts = {}) {
  const {
    root = saddle.account
  } = opts || {};

  return await deploy('MockV3Aggregator', [opts.decimals, opts.initialAnswer]);
}

async function makeToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'erc20'
  } = opts || {};

  if (kind == 'erc20') {
    const quantity = evmosUnsigned(dfn(opts.quantity, 1e25));
    const decimals = evmosUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'OMG';
    const name = opts.name || `Erc20 ${symbol}`;
    return await deploy('ERC20Harness', [quantity, name, decimals, symbol]);
  }
}

async function balanceOf(token, account) {
  return evmosUnsigned(await call(token, 'balanceOf', [account]));
}

async function totalSupply(token) {
  return evmosUnsigned(await call(token, 'totalSupply'));
}

async function borrowSnapshot(nToken, account) {
  const { principal, interestIndex } = await call(nToken, 'harnessAccountBorrows', [account]);
  return { principal: evmosUnsigned(principal), interestIndex: evmosUnsigned(interestIndex) };
}

async function totalBorrows(nToken) {
  return evmosUnsigned(await call(nToken, 'totalBorrows'));
}

async function totalReserves(nToken) {
  return evmosUnsigned(await call(nToken, 'totalReserves'));
}

async function enterMarkets(nTokens, from) {
  return await send(nTokens[0].comptroller, 'enterMarkets', [nTokens.map(c => c._address)], { from });
}

async function fastForward(nToken, blocks = 5) {
  return await send(nToken, 'harnessFastForward', [blocks]);
}

async function setBalance(nToken, account, balance) {
  return await send(nToken, 'harnessSetBalance', [account, balance]);
}

async function setMintedSEBOf(comptroller, account, balance) {
  return await send(comptroller, 'harnessSetMintedSEBOf', [account, balance]);
}

async function setSEBBalance(seb, account, balance) {
  return await send(seb, 'harnessSetBalanceOf', [account, balance]);
}

async function setEVMOSBalance(nEvmos, balance) {
  const current = await evmosBalance(nEvmos._address);
  const root = saddle.account;
  expect(await send(nEvmos, 'harnessDoTransferOut', [root, current])).toSucceed();
  expect(await send(nEvmos, 'harnessDoTransferIn', [root, balance], { value: balance })).toSucceed();
}

async function getBalances(nTokens, accounts) {
  const balances = {};
  for (let nToken of nTokens) {
    const nBalances = balances[nToken._address] = {};
    for (let account of accounts) {
      nBalances[account] = {
        evmos: await evmosBalance(account),
        cash: nToken.underlying && await balanceOf(nToken.underlying, account),
        tokens: await balanceOf(nToken, account),
        borrows: (await borrowSnapshot(nToken, account)).principal
      };
    }
    nBalances[nToken._address] = {
      evmos: await evmosBalance(nToken._address),
      cash: nToken.underlying && await balanceOf(nToken.underlying, nToken._address),
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
    const nBalances = balances[nToken._address] = {};
    const sebBalancesData = balances[seb._address] = {};
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
    nBalances[nToken._address] = {
      evmos: await evmosBalance(nToken._address),
      cash: nToken.underlying && await balanceOf(nToken.underlying, nToken._address),
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
      account = nToken._address;
    }
    balances[nToken._address][account][key] = balances[nToken._address][account][key].add(diff);
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
        account = nToken._address;
      }
      balances[nToken._address][account][key] = balances[nToken._address][account][key].add(diff);
    } else {
      [nToken, account, key, diff] = delta;
      balances[seb._address][account][key] = balances[seb._address][account][key].add(diff);
    }
  }
  return balances;
}

async function preApprove(nToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(nToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(nToken.underlying, 'approve', [nToken._address, amount], { from });
}

async function preApproveSEB(comptroller, seb, from, to, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(seb, 'harnessSetBalanceOf', [from, amount], { from })).toSucceed();
    await send(comptroller, 'harnessSetMintedSEBOf', [from, amount]);
  }

  return send(seb, 'approve', [to, amount], { from });
}

async function quickMint(nToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(nToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(nToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(nToken, 'mint', [mintAmount], { from: minter });
}

async function quickMintSEB(comptroller, seb, sebMinter, sebMintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(seb, 1);

  expect(await send(seb, 'harnessSetBalanceOf', [sebMinter, sebMintAmount], { sebMinter })).toSucceed();
  expect(await send(comptroller, 'harnessSetMintedsebs', [sebMinter, sebMintAmount], { sebMinter })).toSucceed();
  expect(await send(seb, 'harnessIncrementTotalSupply', [sebMintAmount], { sebMinter })).toSucceed();
}

async function preSupply(nToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(nToken, 'harnessSetTotalSupply', [tokens])).toSucceed();
  }
  return send(nToken, 'harnessSetBalance', [account, tokens]);
}

async function quickRedeem(nToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(nToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(nToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(nToken, 'redeem', [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(nToken, redeemer, redeemAmount, opts = {}) {
  await fastForward(nToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(await send(nToken, 'harnessSetExchangeRate', [evmosMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(nToken, 'redeemUnderlying', [redeemAmount], { from: redeemer });
}

async function setOraclePrice(nToken, price) {
  return send(nToken.comptroller.priceOracle, 'setUnderlyingPrice', [nToken._address, evmosMantissa(price)]);
}

async function setOraclePriceFromMantissa(nToken, price) {
  return send(nToken.comptroller.priceOracle, 'setUnderlyingPrice', [nToken._address, price]);
}

async function setBorrowRate(nToken, rate) {
  return send(nToken.interestRateModel, 'setBorrowRate', [evmosMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
  return call(interestRateModel, 'getBorrowRate', [cash, borrows, reserves].map(evmosUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
  return call(interestRateModel, 'getSupplyRate', [cash, borrows, reserves, reserveFactor].map(evmosUnsigned));
}

async function pretendBorrow(nToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await send(nToken, 'harnessSetTotalBorrows', [evmosUnsigned(principalRaw)]);
  await send(nToken, 'harnessSetAccountBorrows', [borrower, evmosUnsigned(principalRaw), evmosMantissa(accountIndex)]);
  await send(nToken, 'harnessSetBorrowIndex', [evmosMantissa(marketIndex)]);
  await send(nToken, 'harnessSetAccrualBlockNumber', [evmosUnsigned(blockNumber)]);
  await send(nToken, 'harnessSetBlockNumber', [evmosUnsigned(blockNumber)]);
}

async function pretendSEBMint(comptroller, sebcontroller, seb, sebMinter, principalRaw, totalSupply, blockNumber = 2e7) {
  await send(comptroller, 'harnessSetMintedSEBOf', [sebMinter, evmosUnsigned(principalRaw)]);
  await send(seb, 'harnessIncrementTotalSupply', [evmosUnsigned(principalRaw)]);
  await send(seb, 'harnessSetBalanceOf', [sebMinter, evmosUnsigned(principalRaw)]);
  await send(sebcontroller, 'harnessSetBlockNumber', [evmosUnsigned(blockNumber)]);
}

async function setMarketSupplyCap(comptroller, nTokens, supplyCaps) {
  await send(comptroller, '_setMarketSupplyCaps', [nTokens, supplyCaps]);
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