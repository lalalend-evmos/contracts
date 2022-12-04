const {
    address,
    encodeParameters,
  } = require('../Utils/EVMOS');
  const {
    makeComptroller,
    makeNToken,
  } = require('../Utils/Nemo');
  
  function cullTuple(tuple) {
    return Object.keys(tuple).reduce((acc, key) => {
      if (Number.isNaN(Number(key))) {
        return {
          ...acc,
          [key]: tuple[key]
        };
      } else {
        return acc;
      }
    }, {});
  }
  
  describe('NemoLens', () => {
    let NemoLens;
    let acct;
  
    beforeEach(async () => {
      NemoLens = await deploy('NemoLens');
      acct = accounts[0];
    });
  
    describe('nTokenMetadata', () => {
      it('is correct for a nErc20', async () => {
        let nErc20 = await makeNToken();
        expect(
          cullTuple(await call(NemoLens, 'nTokenMetadata', [nErc20._address]))
        ).toEqual(
          {
            nToken: nErc20._address,
            exchangeRateCurrent: "1000000000000000000",
            supplyRatePerBlock: "0",
            borrowRatePerBlock: "0",
            reserveFactorMantissa: "0",
            totalBorrows: "0",
            totalReserves: "0",
            totalSupply: "0",
            totalCash: "0",
            isListed:false,
            collateralFactorMantissa: "0",
            underlyingAssetAddress: await call(nErc20, 'underlying', []),
            nTokenDecimals: "8",
            underlyingDecimals: "18",
            miaSupplySpeed: "0",
            miaBorrowSpeed: "0",
            dailySupplyNemo: "0",
            dailyBorrowNemo: "0"
          }
        );
      });
  
      it('is correct for nEvmos', async () => {
        let nEvmos = await makeNToken({kind: 'nevmos'});
        expect(
          cullTuple(await call(NemoLens, 'nTokenMetadata', [nEvmos._address]))
        ).toEqual({
          borrowRatePerBlock: "0",
          nToken: nEvmos._address,
          nTokenDecimals: "8",
          collateralFactorMantissa: "0",
          exchangeRateCurrent: "1000000000000000000",
          isListed: false,
          reserveFactorMantissa: "0",
          supplyRatePerBlock: "0",
          totalBorrows: "0",
          totalCash: "0",
          totalReserves: "0",
          totalSupply: "0",
          underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
          underlyingDecimals: "18",
          miaSupplySpeed: "0",
          miaBorrowSpeed: "0",
          dailySupplyNemo: "0",
          dailyBorrowNemo: "0"
        });
      });
    });
  
    describe('nTokenMetadataAll', () => {
      it('is correct for a nErc20 and nEvmos', async () => {
        let nErc20 = await makeNToken();
        let nEvmos = await makeNToken({kind: 'nevmos'});
        expect(
          (await call(NemoLens, 'nTokenMetadataAll', [[nErc20._address, nEvmos._address]])).map(cullTuple)
        ).toEqual([
          {
            nToken: nErc20._address,
            exchangeRateCurrent: "1000000000000000000",
            supplyRatePerBlock: "0",
            borrowRatePerBlock: "0",
            reserveFactorMantissa: "0",
            totalBorrows: "0",
            totalReserves: "0",
            totalSupply: "0",
            totalCash: "0",
            isListed:false,
            collateralFactorMantissa: "0",
            underlyingAssetAddress: await call(nErc20, 'underlying', []),
            nTokenDecimals: "8",
            underlyingDecimals: "18",
            miaSupplySpeed: "0",
            miaBorrowSpeed: "0",
            dailySupplyNemo: "0",
            dailyBorrowNemo: "0",
          },
          {
            borrowRatePerBlock: "0",
            nToken: nErc20._address,
            nTokenDecimals: "8",
            collateralFactorMantissa: "0",
            exchangeRateCurrent: "1000000000000000000",
            isListed: false,
            reserveFactorMantissa: "0",
            supplyRatePerBlock: "0",
            totalBorrows: "0",
            totalCash: "0",
            totalReserves: "0",
            totalSupply: "0",
            underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
            underlyingDecimals: "18",
            miaSupplySpeed: "0",
            miaBorrowSpeed: "0",
            dailySupplyNemo: "0",
            dailyBorrowNemo: "0",
          }
        ]);
      });
    });
  
    describe('nTokenBalances', () => {
      it('is correct for nERC20', async () => {
        let nErc20 = await makeNToken();
        expect(
          cullTuple(await call(NemoLens, 'nTokenBalances', [nErc20._address, acct]))
        ).toEqual(
          {
            balanceOf: "0",
            balanceOfUnderlying: "0",
            borrowBalanceCurrent: "0",
            nToken: nErc20._address,
            tokenAllowance: "0",
            tokenBalance: "10000000000000000000000000",
          }
        );
      });
  
      it('is correct for nEVMOS', async () => {
        let nEvmos = await makeNToken({kind: 'nevmos'});
        let evmosBalance = await web3.eth.getBalance(acct);
        expect(
          cullTuple(await call(NemoLens, 'nTokenBalances', [nErc20._address, acct], {gasPrice: '0'}))
        ).toEqual(
          {
            balanceOf: "0",
            balanceOfUnderlying: "0",
            borrowBalanceCurrent: "0",
            nToken: nEvmos._address,
            tokenAllowance: evmosBalance,
            tokenBalance: evmosBalance,
          }
        );
      });
    });
  
    describe('nTokenBalancesAll', () => {
      it('is correct for nEvmos and nErc20', async () => {
        let nErc20 = await makeNToken();
        // TODO
        let nEvmos = await makeNToken({kind: 'nevmos'});
        let evmosBalance = await web3.eth.getBalance(acct);
        
        expect(
          (await call(NemoLens, 'nTokenBalancesAll', [[nErc20._address, nErc20._address], acct], {gasPrice: '0'})).map(cullTuple)
        ).toEqual([
          {
            balanceOf: "0",
            balanceOfUnderlying: "0",
            borrowBalanceCurrent: "0",
            nToken: nErc20._address,
            tokenAllowance: "0",
            tokenBalance: "10000000000000000000000000",
          },
          {
            balanceOf: "0",
            balanceOfUnderlying: "0",
            borrowBalanceCurrent: "0",
            nToken: nErc20._address,
            tokenAllowance: evmosBalance,
            tokenBalance: evmosBalance,
          }
        ]);
      })
    });
  
    describe('nTokenUnderlyingPrice', () => {
      it('gets correct price for nErc20', async () => {
        let nErc20 = await makeNToken();
        expect(
          cullTuple(await call(NemoLens, 'nTokenUnderlyingPrice', [nErc20._address]))
        ).toEqual(
          {
            nToken: nErc20._address,
            underlyingPrice: "0",
          }
        );
      });
  
      it('gets correct price for nEvmos', async () => {
        //todo
        let nEvmos = await makeNToken({kind: 'nevmos'});
        expect(
          cullTuple(await call(NemoLens, 'nTokenUnderlyingPrice', [nEvmos._address]))
        ).toEqual(
          {
            nToken: nEvmos._address,
            underlyingPrice: "1000000000000000000",
          }
        );
      });
    });
  
    describe('nTokenUnderlyingPriceAll', () => {
      it('gets correct price for both', async () => {
        let nErc20 = await makeNToken();
        let nEvmos = await makeNToken({kind: 'nevmos'});
        expect(
          (await call(NemoLens, 'nTokenUnderlyingPriceAll', [[nErc20._address, nEvmos._address]])).map(cullTuple)
        ).toEqual([
          {
            nToken: nErc20._address,
            underlyingPrice: "0",
          },
          {
            nToken: nEvmos._address,
            underlyingPrice: "1000000000000000000",
          }
        ]);
      });
    });
  
    describe('getAccountLimits', () => {
      it('gets correct values', async () => {
        let comptroller = await makeComptroller();
  
        expect(
          cullTuple(await call(NemoLens, 'getAccountLimits', [comptroller._address, acct]))
        ).toEqual({
          liquidity: "0",
          markets: [],
          shortfall: "0"
        });
      });
    });
  
    describe('governance', () => {
      let mia, gov;
      let targets, values, signatures, callDatas;
      let proposalBlock, proposalId;
      let votingDelay;
      let votingPeriod;
  
      beforeEach(async () => {
        mia = await deploy('MIA', [acct]);
        gov = await deploy('GovernorAlpha', [address(0), mia._address, address(0)]);
        targets = [acct];
        values = ["0"];
        signatures = ["getBalanceOf(address)"];
        callDatas = [encodeParameters(['address'], [acct])];
        await send(mia, 'delegate', [acct]);
        await send(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"]);
        proposalBlock = +(await web3.eth.getBlockNumber());
        proposalId = await call(gov, 'latestProposalIds', [acct]);
        votingDelay = Number(await call(gov, 'votingDelay'));
        votingPeriod = Number(await call(gov, 'votingPeriod'));
      });
  
      describe('getGovReceipts', () => {
        it('gets correct values', async () => {
          expect(
            (await call(NemoLens, 'getGovReceipts', [gov._address, acct, [proposalId]])).map(cullTuple)
          ).toEqual([
            {
              hasVoted: false,
              proposalId: proposalId,
              support: false,
              votes: "0",
            }
          ]);
        })
      });
  
      describe('getGovProposals', () => {
        it('gets correct values', async () => {
          expect(
            (await call(NemoLens, 'getGovProposals', [gov._address, [proposalId]])).map(cullTuple)
          ).toEqual([
            {
              againstVotes: "0",
              calldatas: callDatas,
              canceled: false,
              endBlock: (Number(proposalBlock) + votingDelay + votingPeriod).toString(),
              eta: "0",
              executed: false,
              forVotes: "0",
              proposalId: proposalId,
              proposer: acct,
              signatures: signatures,
              startBlock: (Number(proposalBlock) + votingDelay).toString(),
              targets: targets
            }
          ]);
        })
      });
    });
  
    describe('mia', () => {
      let mia, currentBlock;
  
      beforeEach(async () => {
        currentBlock = +(await web3.eth.getBlockNumber());
        mia = await deploy('MIA', [acct]);
      });
  
      describe('getMIABalanceMetadata', () => {
        it('gets correct values', async () => {
          expect(
            cullTuple(await call(NemoLens, 'getMIABalanceMetadata', [mia._address, acct]))
          ).toEqual({
            balance: "30000000000000000000000000",
            delegate: "0x0000000000000000000000000000000000000000",
            votes: "0",
          });
        });
      });
  
      describe('getMIABalanceMetadataExt', () => {
        it('gets correct values', async () => {
          let comptroller = await makeComptroller();
          await send(comptroller, 'setNemoAccrued', [acct, 5]); // harness only
  
          expect(
            cullTuple(await call(NemoLens, 'getMIABalanceMetadataExt', [mia._address, comptroller._address, acct]))
          ).toEqual({
            balance: "30000000000000000000000000",
            delegate: "0x0000000000000000000000000000000000000000",
            votes: "0",
            allocated: "5"
          });
        });
      });
  
      describe('getNemoVotes', () => {
        it('gets correct values', async () => {
          expect(
            (await call(NemoLens, 'getNemoVotes', [mia._address, acct, [currentBlock, currentBlock - 1]])).map(cullTuple)
          ).toEqual([
            {
              blockNumber: currentBlock.toString(),
              votes: "0",
            },
            {
              blockNumber: (Number(currentBlock) - 1).toString(),
              votes: "0",
            }
          ]);
        });
  
        it('reverts on future value', async () => {
          await expect(
            call(NemoLens, 'getNemoVotes', [mia._address, acct, [currentBlock + 1]])
          ).rejects.toRevert('revert MIA::getPriorVotes: not yet determined')
        });
      });
    });
  
    describe('dailyMIA', () => {
      it('can get dailyMIA for an account', async () => {
        let nErc20 = await makeNToken();
        let comptrollerAddress = await nErc20.comptroller._address;
        expect(
          await call(NemoLens, 'getDailyMIA', [acct, comptrollerAddress])
        ).toEqual("0");
      });
    });
  
  });