const {
    evmosUnsigned,
    evmosMantissa,
    evmosExp,
  } = require('./Utils/EVMOS');
  
  const {
    makeComptroller,
    makeNToken,
    preApprove,
    preSupply,
    quickRedeem,
  } = require('./Utils/Nemo');
  
  async function miaBalance(comptroller, user) {
    return evmosUnsigned(await call(comptroller.mia, 'balanceOf', [user]))
  }
  
  async function miaAccrued(comptroller, user) {
    return evmosUnsigned(await call(comptroller, 'miaAccrued', [user]));
  }
  
  async function fastForwardPatch(patch, comptroller, blocks) {
    if (patch == 'unitroller') {
      return await send(comptroller, 'harnessFastForward', [blocks]);
    } else {
      return await send(comptroller, 'fastForward', [blocks]);
    }
  }
  
  const fs = require('fs');
  const util = require('util');
  const diffStringsUnified = require('jest-diff').default;
  
  
  async function preRedeem(
    nToken,
    redeemer,
    redeemTokens,
    redeemAmount,
    exchangeRate
  ) {
    await preSupply(nToken, redeemer, redeemTokens);
    await send(nToken.underlying, 'harnessSetBalance', [
      nToken._address,
      redeemAmount
    ]);
  }
  
  const sortOpcodes = (opcodesMap) => {
    return Object.values(opcodesMap)
      .map(elem => [elem.fee, elem.name])
      .sort((a, b) => b[0] - a[0]);
  };
  
  const getGasCostFile = name => {
    try {
      const jsonString = fs.readFileSync(name);
      return JSON.parse(jsonString);
    } catch (err) {
      console.log(err);
      return {};
    }
  };
  
  const recordGasCost = (totalFee, key, filename, opcodes = {}) => {
    let fileObj = getGasCostFile(filename);
    const newCost = {fee: totalFee, opcodes: opcodes};
    console.log(diffStringsUnified(fileObj[key], newCost));
    fileObj[key] = newCost;
    fs.writeFileSync(filename, JSON.stringify(fileObj, null, ' '), 'utf-8');
  };
  
  async function mint(nToken, minter, mintAmount, exchangeRate) {
    expect(await preApprove(nToken, minter, mintAmount, {})).toSucceed();
    return send(nToken, 'mint', [mintAmount], { from: minter });
  }
  
  async function claimNemo(comptroller, holder) {
    return send(comptroller, 'claimNemo', [holder], { from: holder });
  }
  
  /// GAS PROFILER: saves a digest of the gas prices of common NToken operations
  /// transiently fails, not sure why
  
  describe('Gas report', () => {
    let root, minter, redeemer, accounts, nToken;
    const exchangeRate = 50e3;
    const preMintAmount = evmosUnsigned(30e4);
    const mintAmount = evmosUnsigned(10e4);
    const mintTokens = mintAmount.div(exchangeRate);
    const redeemTokens = evmosUnsigned(10e3);
    const redeemAmount = redeemTokens.multipliedBy(exchangeRate);
    const filename = './gasCosts.json';
  
    describe('NToken', () => {
      beforeEach(async () => {
        [root, minter, redeemer, ...accounts] = saddle.accounts;
        nToken = await makeNToken({
          comptrollerOpts: { kind: 'bool'}, 
          interestRateModelOpts: { kind: 'white-paper'},
          exchangeRate
        });
      });
  
      it('first mint', async () => {
        await send(nToken, 'harnessSetAccrualBlockNumber', [40]);
        await send(nToken, 'harnessSetBlockNumber', [41]);
  
        const trxReceipt = await mint(nToken, minter, mintAmount, exchangeRate);
        recordGasCost(trxReceipt.gasUsed, 'first mint', filename);
      });
  
      it('second mint', async () => {
        await mint(nToken, minter, mintAmount, exchangeRate);
  
        await send(nToken, 'harnessSetAccrualBlockNumber', [40]);
        await send(nToken, 'harnessSetBlockNumber', [41]);
  
        const mint2Receipt = await mint(nToken, minter, mintAmount, exchangeRate);
        expect(Object.keys(mint2Receipt.events)).toEqual(['AccrueInterest', 'Transfer', 'Mint']);
  
        console.log(mint2Receipt.gasUsed);
        const opcodeCount = {};
  
        await saddle.trace(mint2Receipt, {
          execLog: log => {
            if (log.lastLog != undefined) {
              const key = `${log.op} @ ${log.gasCost}`;
              opcodeCount[key] = (opcodeCount[key] || 0) + 1;
            }
          }
        });
  
        recordGasCost(mint2Receipt.gasUsed, 'second mint', filename, opcodeCount);
      });
  
      it('second mint, no interest accrued', async () => {
        await mint(nToken, minter, mintAmount, exchangeRate);
  
        await send(nToken, 'harnessSetAccrualBlockNumber', [40]);
        await send(nToken, 'harnessSetBlockNumber', [40]);
  
        const mint2Receipt = await mint(nToken, minter, mintAmount, exchangeRate);
        expect(Object.keys(mint2Receipt.events)).toEqual(['Transfer', 'Mint']);
        recordGasCost(mint2Receipt.gasUsed, 'second mint, no interest accrued', filename);
  
        // console.log("NO ACCRUED");
        // const opcodeCount = {};
        // await saddle.trace(mint2Receipt, {
        //   execLog: log => {
        //     opcodeCount[log.op] = (opcodeCount[log.op] || 0) + 1;
        //   }
        // });
        // console.log(getOpcodeDigest(opcodeCount));
      });
  
      it('redeem', async () => {
        await preRedeem(nToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
        const trxReceipt = await quickRedeem(nToken, redeemer, redeemTokens);
        recordGasCost(trxReceipt.gasUsed, 'redeem', filename);
      });
  
      it.skip('print mint opcode list', async () => {
        await preMint(nToken, minter, mintAmount, mintTokens, exchangeRate);
        const trxReceipt = await quickMint(nToken, minter, mintAmount);
        const opcodeCount = {};
        await saddle.trace(trxReceipt, {
          execLog: log => {
            opcodeCount[log.op] = (opcodeCount[log.op] || 0) + 1;
          }
        });
        console.log(getOpcodeDigest(opcodeCount));
      });
    });
  
    describe.each([
      ['unitroller-g2'],
      ['unitroller']
    ])('MIA claims %s', (patch) => {
      beforeEach(async () => {
        [root, minter, redeemer, ...accounts] = saddle.accounts;
        comptroller = await makeComptroller({ kind: patch });
        let interestRateModelOpts = {borrowRate: 0.000001};
        nToken = await makeNToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
        if (patch == 'unitroller') {
          await send(comptroller, '_setNemoSpeed', [nToken._address, evmosExp(0.05)]);
        } else {
          await send(comptroller, '_addNemoMarkets', [[nToken].map(c => c._address)]);
          await send(comptroller, 'setNemoSpeed', [nToken._address, evmosExp(0.05)]);
        }
        await send(comptroller.mia, 'transfer', [comptroller._address, evmosUnsigned(50e18)], {from: root});
      });
  
      it(`${patch} second mint with mia accrued`, async () => {
        await mint(nToken, minter, mintAmount, exchangeRate);
  
        await fastForwardPatch(patch, comptroller, 10);
  
        console.log('MIA balance before mint', (await miaBalance(comptroller, minter)).toString());
        console.log('MIA accrued before mint', (await miaAccrued(comptroller, minter)).toString());
        const mint2Receipt = await mint(nToken, minter, mintAmount, exchangeRate);
        console.log('MIA balance after mint', (await miaBalance(comptroller, minter)).toString());
        console.log('MIA accrued after mint', (await miaAccrued(comptroller, minter)).toString());
        recordGasCost(mint2Receipt.gasUsed, `${patch} second mint with mia accrued`, filename);
      });
  
      it(`${patch} claim mia`, async () => {
        await mint(nToken, minter, mintAmount, exchangeRate);
  
        await fastForwardPatch(patch, comptroller, 10);
  
        console.log('MIA balance before claim', (await miaBalance(comptroller, minter)).toString());
        console.log('MIA accrued before claim', (await miaAccrued(comptroller, minter)).toString());
        const claimReceipt = await claimNemo(comptroller, minter);
        console.log('MIA balance after claim', (await miaBalance(comptroller, minter)).toString());
        console.log('MIA accrued after claim', (await miaAccrued(comptroller, minter)).toString());
        recordGasCost(claimReceipt.gasUsed, `${patch} claim mia`, filename);
      });
    });
  });