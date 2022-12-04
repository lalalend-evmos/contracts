const {
    evmosUnsigned,
    freezeTime,
    address,
    minerStart,
    minerStop,
    mineBlock
  } = require('../Utils/EVMOS');
  
  const rewardPerBlock = evmosUnsigned(1e16);
  const defaultLockPeriod = 300;
  const tokenAmount = evmosUnsigned(1e22);
  
  describe('miaVault', () => {
    let root, notAdmin, a1, a2, a3;
    let blockTimestamp;
    let miaVault;
    let miaStore;
    let mia;
    let sxp;
  
    beforeEach(async () => {
      [root, notAdmin, a1, a2, a3] = accounts;
  
      miaVault = await deploy('MIAVault', []);
      miaStore = await deploy('MIAStore', []);
      mia = await deploy('MIAScenario', [root]);
      sxp = await deploy('SXP', [root]);
  
      await send(miaStore, 'setNewOwner', [miaVault._address], { from: root });
      await send(miaVault, 'setNemoStore', [mia._address, miaStore._address], { from: root });
      await send(mia, 'transfer', [miaStore._address, tokenAmount], { from: root });
      await send(sxp, 'transfer', [miaStore._address, tokenAmount], { from: root });
  
      blockTimestamp = evmosUnsigned(100);
      await freezeTime(blockTimestamp.toNumber())
    });
  
    describe('mia store', () => {
      it('check mia balance', async () => {
        let miaBalanceOfStore = await call(mia, 'balanceOf', [miaStore._address]);
        expect(miaBalanceOfStore).toEqual('10000000000000000000000');
      });
  
      it('set new reward token', async () => {
        await send(miaStore, 'setRewardToken', [mia._address, true], { from: root });
        expect(await call(miaStore, 'rewardTokens', [mia._address])).toEqual(true);
        expect(await call(miaStore, 'rewardTokens', [miaVault._address])).toEqual(false);
        expect(await call(miaStore, 'rewardTokens', [miaStore._address])).toEqual(false);
  
        await send(miaStore, 'setRewardToken', [mia._address, false], { from: root });
        expect(await call(miaStore, 'rewardTokens', [miaStore._address])).toEqual(false);
      });
  
      it('tranfer reward token', async () => {
        await expect(
          send(miaStore, 'safeRewardTransfer', [mia._address, root, tokenAmount], { from: root })
        ).rejects.toRevert('revert only owner can');
      });
    });
  
    describe('check mia vault config', () => {
      it('check mia vault admin', async () => {
        expect(await call(miaVault, 'getAdmin', [])).toEqual(root);
      });
  
      it('check mia token address', async () => {
        expect(await call(miaVault, 'miaAddress', [])).toEqual(mia._address);
      });
  
      it('check mia store address', async () => {
        expect(await call(miaVault, 'miaStore', [])).toEqual(miaStore._address);
      });
    });
  
    describe('test to manage reward pool config', () => {
      it('add mia pool', async () => {
        const addTx = await send(
          miaVault,
          'add',
          [mia._address, 100, mia._address, rewardPerBlock, defaultLockPeriod],
          { from: root }
        );
  
        expect(addTx).toHaveLog('PoolAdded', {
          rewardToken: mia._address,
          pid: '0',
          token: mia._address,
          allocPoints: '100',
          rewardPerBlock: rewardPerBlock.toString(),
          lockPeriod: '300'
        });
  
        const poolInfo = await call(miaVault, 'poolInfos', [mia._address, 0]);
        expect(poolInfo['token']).toEqual(mia._address);
        expect(poolInfo['allocPoint']).toEqual('100');
        expect(poolInfo['accRewardPerShare']).toEqual('0');
        expect(poolInfo['lockPeriod']).toEqual('300');
  
        expect(await call(miaStore, 'rewardTokens', [mia._address])).toEqual(true);
      });
  
      it('update mia pool alloc config', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
          ], { from: root });
  
        let poolInfo = await call(miaVault, 'poolInfos', [mia._address, 0]);
        expect(poolInfo['allocPoint']).toEqual('100');
  
        const setTx = await send(
          miaVault, 'set',
          [mia._address, 0, 1000 ],
          { from: root }
        );
  
        expect(setTx).toHaveLog('PoolUpdated', {
          rewardToken: mia._address,
          pid: '0',
          oldAllocPoints: '100',
          newAllocPoints: '1000'
        });
  
        poolInfo = await call(miaVault, 'poolInfos', [mia._address, 0]);
        expect(poolInfo['token']).toEqual(mia._address);
        expect(poolInfo['allocPoint']).toEqual('1000');
        expect(poolInfo['accRewardPerShare']).toEqual('0');
  
        expect(await call(miaStore, 'rewardTokens', [mia._address])).toEqual(true);
      });
  
      it('sets the reward amount per block', async () => {
        await send(
          miaVault,
          'add',
          [mia._address, 100, mia._address, rewardPerBlock, defaultLockPeriod],
          { from: root }
        );
  
        const tx = await send(
          miaVault,
          'setRewardAmountPerBlock',
          [mia._address, rewardPerBlock.mul(2)],
          { from: root }
        );
  
        expect(tx).toHaveLog('RewardAmountUpdated', {
          rewardToken: mia._address,
          oldReward: rewardPerBlock.toString(),
          newReward: rewardPerBlock.mul(2).toString(),
        });
      });
  
      it('fails to update config for nonexistent pools', async () => {
        await expect(
          send(miaVault, 'set', [mia._address, 0, 1000 ], { from: root })
        ).rejects.toRevert('revert vault: pool exists?');
      });
    });
  
    describe('deposit mia token', () => {
      it('add mia pool', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(mia, 'transfer', [notAdmin, tokenAmount], { from: root });
  
        const notAdminmiaBal = await call(mia, 'balanceOf', [notAdmin]);
        expect(notAdminmiaBal).toEqual('10000000000000000000000');
  
        await send(mia, 'approve', [miaVault._address, tokenAmount], { from: notAdmin });
  
        const notAdminAppr = await call(mia, 'allowance', [notAdmin, miaVault._address]);
        expect(notAdminAppr).toEqual('10000000000000000000000');
  
        await send(miaVault, 'deposit', [mia._address, 0, tokenAmount], { from: notAdmin });
  
        const depositedAmount = await call(mia, 'balanceOf', [miaVault._address]);
        expect(depositedAmount).toEqual('10000000000000000000000');
  
        let userInfo = await call(miaVault, 'getUserInfo', [mia._address, 0, notAdmin]);
        expect(userInfo['amount']).toEqual('10000000000000000000000');
        expect(userInfo['rewardDebt']).toEqual('0');
  
        await expect(
          call(miaVault, 'getUserInfo', [sxp._address, 0, notAdmin])
        ).rejects.toRevert('revert vault: pool exists?');
      });
    });
  
    describe('claim mia reward', () => {
      it('deposit and claim', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(mia, 'transfer', [notAdmin, tokenAmount], { from: root });
        await send(mia, 'approve', [miaVault._address, tokenAmount], { from: notAdmin });
        await send(miaVault, 'deposit', [mia._address, 0, tokenAmount], { from: notAdmin });
  
        await freezeTime(200);
  
        let miaBalance = await call(mia, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('0');
  
        await send(miaVault, 'deposit', [mia._address, 0, 0], { from: notAdmin });
  
        miaBalance = await call(mia, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('20000000000000000');
      });
  
      it('reverts when trying to deposit to a nonexisting pool', async () => {
        await expect(
          send(miaVault, 'deposit', [mia._address, 0, tokenAmount], { from: notAdmin })
        ).rejects.toRevert('revert vault: pool exists?');
      });
    });
  
    describe('withdrawals', () => {
      async function deposit() {
        await send(miaVault, 'add', [
          mia._address,
          100,
          sxp._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(sxp, 'transfer', [notAdmin, tokenAmount], { from: root });
        await send(sxp, 'approve', [miaVault._address, tokenAmount], { from: notAdmin });
        await send(miaVault, 'deposit', [mia._address, 0, tokenAmount], { from: notAdmin });
      }
  
      // To make sure updates to lock period do not affect the existing withdrawal requests,
      // and to correctly test the order of requests, we need to arbitrarily set the lock period.
      // This function makes our tests a bit more concise.
      async function requestWithdrawalWithLockPeriod({ amount, lockPeriod }) {
        await send(miaVault, 'setWithdrawalLockingPeriod',  [mia._address, 0, lockPeriod], { from: root });
        await send( miaVault, 'requestWithdrawal', [mia._address, 0, amount], { from: notAdmin });
      }
  
      describe('request withdrawal', () => {
        it('reverts when trying to request a withdrawal from a nonexisting pool', async () => {
          await deposit();
          await expect(
            send(miaVault, 'requestWithdrawal', [mia._address, 1, 0], { from: notAdmin })
          ).rejects.toRevert('revert vault: pool exists?');
        });
  
        it('prohibits requests with zero amount', async () => {
          await deposit();
          await expect(
            send(miaVault, 'requestWithdrawal', [mia._address, 0, 0], { from: notAdmin })
          ).rejects.toRevert('revert requested amount cannot be zero');
        });
  
        it('orders the requests by unlock times', async () => {
          // Insert withdrawal requests in arbitrary order
          await deposit();
          // now = 100; lockedUntil = now + lock period
          await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
          await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
          await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
          await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800
  
          // We should get the requests ordered by lockedUntil desc (800, 600, 400, 200)
          const requests = await call(miaVault, 'getWithdrawalRequests', [mia._address, 0, notAdmin]);
          expect(requests.map(v => v.lockedUntil)).toEqual(['800', '600', '400', '200']);
          expect(requests.map(v => v.amount)).toEqual(['100', '1000', '1', '10']);
        });
  
        it('increases pending withdrawals', async () => {
          // Insert withdrawal requests in arbitrary order
          await deposit();
          // now = 100; lockedUntil = now + lock period
          await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
          await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
          await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
          await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800
  
          expect(
            await call(miaVault, 'getRequestedAmount', [mia._address, 0, notAdmin])
          ).toEqual('1111');
        });
  
        it('does not allow to request more than the current amount', async () => {
          await deposit();
          await send(miaVault, 'requestWithdrawal', [mia._address, 0, tokenAmount], { from: notAdmin });
          await expect(
            send(miaVault, 'requestWithdrawal', [mia._address, 0, '1'], { from: notAdmin })
          ).rejects.toRevert('revert requested amount is invalid');
        });
      });
  
      describe('execute withdrawal', () => {
        it('fails with "nothing to withdraw" if there are no requests', async () => {
          await deposit();
          await expect(
            send(miaVault, 'executeWithdrawal', [mia._address, 0], { from: notAdmin })
          ).rejects.toRevert('revert nothing to withdraw');
        });
  
        it('reverts when trying to withdraw from a nonexisting pool', async () => {
          await deposit();
          await expect(
            send(miaVault, 'executeWithdrawal', [mia._address, 1], { from: notAdmin })
          ).rejects.toRevert('revert vault: pool exists?');
        });
  
        it('fails with "nothing to withdraw" if the requests are still pending', async () => {
          await deposit();
          await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
          await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
          await expect(
            send(miaVault, 'executeWithdrawal', [mia._address, 0], { from: notAdmin })
          ).rejects.toRevert('revert nothing to withdraw');
        });
  
        it('correctly computes the withdrawal amount for multiple withdrawal requests', async () => {
          await deposit();
          await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
          await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
          await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
          await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800
  
          await freezeTime(400); // requests locked until 200 & 400 should be unlocked now
  
          const eligibleAmount = await call(miaVault, 'getEligibleWithdrawalAmount', [mia._address, 0, notAdmin]);
          const requestedAmount = await call(miaVault, 'getRequestedAmount', [mia._address, 0, notAdmin]);
          expect(eligibleAmount).toEqual('11');
          expect(requestedAmount).toEqual('1111');
  
          let sxpBalance = await call(sxp, 'balanceOf', [notAdmin]);
          expect(sxpBalance).toEqual('0');
          await send(miaVault, 'executeWithdrawal', [mia._address, 0], { from: notAdmin });
          sxpBalance = await call(sxp, 'balanceOf', [notAdmin]);
          expect(sxpBalance).toEqual('11');
        });
  
        it('reverts when trying to compute the withdrawal amounts for a nonexisting pool', async () => {
          await deposit();
  
          await expect(
            call(miaVault, 'getEligibleWithdrawalAmount', [mia._address, 1, notAdmin])
          ).rejects.toRevert('revert vault: pool exists?');
  
          await expect(
            call(miaVault, 'getRequestedAmount', [mia._address, 1, notAdmin])
          ).rejects.toRevert('revert vault: pool exists?');
        });
  
        it('clears the eligible withdrawals from the queue', async () => {
          await deposit();
          await requestWithdrawalWithLockPeriod({ amount: '1000', lockPeriod: '500' }); // lockedUntil = 600
          await requestWithdrawalWithLockPeriod({ amount: '10', lockPeriod: '100' }); // lockedUntil = 200
          await requestWithdrawalWithLockPeriod({ amount: '1', lockPeriod: '300' }); // lockedUntil = 400
          await requestWithdrawalWithLockPeriod({ amount: '100', lockPeriod: '700' }); // lockedUntil = 800
  
          await freezeTime(400); // requests locked until 200 & 400 should be unlocked now
          await send(miaVault, 'executeWithdrawal', [mia._address, 0], { from: notAdmin });
  
          const requests = await call(miaVault, 'getWithdrawalRequests', [mia._address, 0, notAdmin]);
          const requestedAmount = await call(miaVault, 'getRequestedAmount', [mia._address, 0, notAdmin]);
  
          // requests locked until 600 and 800 should still be in the requests array
          expect(requests.map(v => v.lockedUntil)).toEqual(['800', '600']);
          expect(requests.map(v => v.amount)).toEqual(['100', '1000']);
          expect(requestedAmount).toEqual('1100');
        });
      });
  
      describe('lock period', () => {
        it('is possible to set lock period when a new pool is created', async () => {
          const lockPeriod1 = '123456';
          await send(
              miaVault,
              'add',
              [mia._address, 100, sxp._address, rewardPerBlock, lockPeriod1],
              { from: root }
          );
          const lockPeriod2 = '654321';
          await send(
            miaVault,
            'add',
            [sxp._address, 100, mia._address, rewardPerBlock, lockPeriod2],
            { from: root }
          );
          const pool1 = await call(miaVault, 'poolInfos', [mia._address, 0]);
          const pool2 = await call(miaVault, 'poolInfos', [sxp._address, 0]);
          expect(pool1.lockPeriod).toEqual('123456');
          expect(pool2.lockPeriod).toEqual('654321');
        });
  
        it('reverts when trying to set lock period for a nonexisting pool', async () => {
          await expect(
            send(miaVault, 'setWithdrawalLockingPeriod', [mia._address, 0, 42], { from: root })
          ).rejects.toRevert('revert vault: pool exists?');
        });
  
        it('sets the lock period for a pool', async () => {
          await send(
            miaVault,
            'add',
            [sxp._address, 100, mia._address, rewardPerBlock, 0],
            { from: root }
          );
  
          const tx = await send(
            miaVault,
            'setWithdrawalLockingPeriod',
            [sxp._address, 0, '1111111'],
            { from: root }
          );
  
          expect(tx).toHaveLog('WithdrawalLockingPeriodUpdated', {
            rewardToken: sxp._address,
            pid: '0',
            oldPeriod: '0',
            newPeriod: '1111111'
          });
  
          const pool = await call(miaVault, 'poolInfos', [sxp._address, 0]);
          expect(pool.lockPeriod).toEqual('1111111');
        })
  
        it('sets lock period separately for each pool', async () => {
          async function newPool(stakingToken, rewardToken, pid) {
            await send(
              miaVault,
              'add',
              [rewardToken._address, 100, stakingToken._address, rewardPerBlock, 0],
              { from: root }
            );
            // pair (reward token, pid) uniquely identifies a pool
            return [rewardToken._address, pid];
          }
          const pool1Id = await newPool(mia, mia, 0);
          const pool2Id = await newPool(mia, sxp, 0);
          const pool3Id = await newPool(sxp, mia, 1);
          const pool4Id = await newPool(sxp, sxp, 1);
  
          await send(miaVault, 'setWithdrawalLockingPeriod',  [...pool1Id, '1111111'], { from: root });
          await send(miaVault, 'setWithdrawalLockingPeriod',  [...pool2Id, '2222222'], { from: root });
          await send(miaVault, 'setWithdrawalLockingPeriod',  [...pool3Id, '3333333'], { from: root });
          await send(miaVault, 'setWithdrawalLockingPeriod',  [...pool4Id, '4444444'], { from: root });
  
          const pool1 = await call(miaVault, 'poolInfos', pool1Id);
          const pool2 = await call(miaVault, 'poolInfos', pool2Id);
          const pool3 = await call(miaVault, 'poolInfos', pool3Id);
          const pool4 = await call(miaVault, 'poolInfos', pool4Id);
  
          expect(pool1.lockPeriod).toEqual('1111111');
          expect(pool2.lockPeriod).toEqual('2222222');
          expect(pool3.lockPeriod).toEqual('3333333');
          expect(pool4.lockPeriod).toEqual('4444444');
        });
      })
    });
  
    describe('withdraw mia token', () => {
      it('request and execute withdrawal', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(mia, 'transfer', [notAdmin, tokenAmount], { from: root });
        await send(mia, 'approve', [miaVault._address, tokenAmount], { from: notAdmin });
        await send(miaVault, 'deposit', [mia._address, 0, tokenAmount], { from: notAdmin });
  
        await send(miaVault, 'requestWithdrawal', [mia._address, 0, tokenAmount.div(2)], { from: notAdmin });
  
        let eligibleAmount = await call(miaVault, 'getEligibleWithdrawalAmount', [mia._address, 0, notAdmin]);
        let requestAmount = await call(miaVault, 'getRequestedAmount', [mia._address, 0, notAdmin]);
        let withdrawalRequests = await call(miaVault, 'getWithdrawalRequests', [mia._address, 0, notAdmin]);
  
        expect(eligibleAmount).toEqual('0');
        expect(requestAmount).toEqual('5000000000000000000000');
  
        expect(withdrawalRequests.length).toEqual(1);
        expect(withdrawalRequests[0]['amount']).toEqual('5000000000000000000000');
        expect(withdrawalRequests[0]['lockedUntil']).toEqual('400');
  
        await freezeTime(300);
  
        eligibleAmount = await call(miaVault, 'getEligibleWithdrawalAmount', [mia._address, 0, notAdmin]);
        requestAmount = await call(miaVault, 'getRequestedAmount', [mia._address, 0, notAdmin]);
        expect(eligibleAmount).toEqual('0');
        expect(requestAmount).toEqual('5000000000000000000000');
  
        await freezeTime(400);
  
        eligibleAmount = await call(miaVault, 'getEligibleWithdrawalAmount', [mia._address, 0, notAdmin]);
        requestAmount = await call(miaVault, 'getRequestedAmount', [mia._address, 0, notAdmin]);
        expect(eligibleAmount).toEqual('5000000000000000000000');
        expect(requestAmount).toEqual('5000000000000000000000');
  
        let miaBalance = await call(mia, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('0');
  
        await send(miaVault, 'executeWithdrawal', [mia._address, 0], { from: notAdmin });
  
        miaBalance = await call(mia, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('5000040000000000000000');
      });
    });
  
    describe('multiple pools', () => {
      it('add mia and sxp reward pools', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(miaVault, 'add', [
          mia._address,
          100,
          sxp._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
  
        await send(miaVault, 'add', [
          sxp._address,
          200,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(miaVault, 'add', [
          sxp._address,
          200,
          sxp._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
  
        const totalAllocPoint1 = await call(miaVault, 'totalAllocPoints', [mia._address]);
        expect(totalAllocPoint1).toEqual('200');
  
        const totalAllocPoint2 = await call(miaVault, 'totalAllocPoints', [sxp._address]);
        expect(totalAllocPoint2).toEqual('400');
      });
  
      it('deposit mia and sxp reward pools', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(miaVault, 'add', [
          mia._address,
          100,
          sxp._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
  
        await send(miaVault, 'add', [
          sxp._address,
          200,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
        await send(miaVault, 'add', [
          sxp._address,
          200,
          sxp._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
  
        await send(mia, 'transfer', [notAdmin, tokenAmount], { from: root });
        await send(mia, 'approve', [miaVault._address, tokenAmount], { from: notAdmin });
        await send(miaVault, 'deposit', [mia._address, 0, tokenAmount], { from: notAdmin });
  
        await send(sxp, 'transfer', [notAdmin, tokenAmount], { from: root });
        await send(sxp, 'approve', [miaVault._address, tokenAmount], { from: notAdmin });
        await send(miaVault, 'deposit', [sxp._address, 1, tokenAmount], { from: notAdmin });
  
        let miaBalance = await call(mia, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('0');
  
        await send(miaVault, 'deposit', [mia._address, 0, 0], { from: notAdmin });
  
        miaBalance = await call(mia, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('20000000000000000');
  
        let sxpBalance = await call(sxp, 'balanceOf', [notAdmin]);
        expect(sxpBalance).toEqual('0');
  
        await send(miaVault, 'deposit', [sxp._address, 1, 0], { from: notAdmin });
  
        miaBalance = await call(sxp, 'balanceOf', [notAdmin]);
        expect(miaBalance).toEqual('10000000000000000');
      });
  
      it('fails when a pool does not exist', async () => {
        await send(miaVault, 'add', [
          mia._address,
          100,
          mia._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
  
        await send(miaVault, 'add', [
          mia._address,
          100,
          sxp._address,
          rewardPerBlock,
          defaultLockPeriod
        ], { from: root });
  
        await expect(
          send(miaVault, 'deposit', [mia._address, 2, tokenAmount], { from: notAdmin })
        ).rejects.toRevert('revert vault: pool exists?');
      })
    });
  
    describe('voting power', () => {
      beforeEach(async () => {
        await send(
          miaVault,
          'add',
          [mia._address, 100, mia._address, rewardPerBlock, defaultLockPeriod],
          { from: root }
        );
        await send(mia, 'transfer', [a1, evmosUnsigned('29000000000000000000000000')], { from: root });
        await send(mia, 'approve', [miaVault._address, evmosUnsigned('29000000000000000000000000')], { from: a1 });
      });
  
      async function deposit(amount, { from }) {
        return await send(miaVault, 'deposit', [mia._address, 0, amount], { from });
      }
  
      async function requestWithdrawal(amount, { from }) {
        return await send(miaVault, 'requestWithdrawal', [mia._address, 0, amount], { from });
      }
  
      async function delegate(delegatee, { from }) {
        return await send(miaVault, 'delegate', [delegatee], { from });
      }
  
      describe('checkpoints', () => {
        it('correctly computes checkpoints', async () => {
          await deposit(1000, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a1])).resolves.toEqual('0');
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('0');
  
          const t1 = await delegate(a2, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a1])).resolves.toEqual('0');
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('1');
  
          const t2 = await requestWithdrawal(900, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a1])).resolves.toEqual('0');
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('2');
  
          const t3 = await requestWithdrawal(90, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a1])).resolves.toEqual('0');
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('3');
  
          const t4 = await deposit(42, { from: a1 });;
          await expect(call(miaVault, 'numCheckpoints', [a1])).resolves.toEqual('0');
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('4');
  
          await expect(call(miaVault, 'checkpoints', [a2, 0])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '1000' })
          );
          await expect(call(miaVault, 'checkpoints', [a2, 1])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t2.blockNumber.toString(), votes: '100' })
          );
          await expect(call(miaVault, 'checkpoints', [a2, 2])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t3.blockNumber.toString(), votes: '10' })
          );
          await expect(call(miaVault, 'checkpoints', [a2, 3])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '52' })
          );
        });
  
        it('correctly computes checkpoints for multiple delegators', async () => {
          await send(mia, 'transfer', [a2, tokenAmount], { from: root });
          await send(mia, 'approve', [miaVault._address, tokenAmount], { from: a2 });
  
          await deposit(4444, { from: a1 });
          await deposit(5555, { from: a2 });
  
          const t1 = await delegate(a3, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a3])).resolves.toEqual('1');
  
          const t2 = await delegate(a3, { from: a2 });
          await expect(call(miaVault, 'numCheckpoints', [a3])).resolves.toEqual('2');
  
          const t3 = await requestWithdrawal(444, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a3])).resolves.toEqual('3');
  
          const t4 = await requestWithdrawal(555, { from: a2 });
          await expect(call(miaVault, 'numCheckpoints', [a3])).resolves.toEqual('4');
  
          const t5 = await deposit(10, { from: a2 });
          await expect(call(miaVault, 'numCheckpoints', [a3])).resolves.toEqual('5');
  
          const t6 = await delegate(address(0), { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a3])).resolves.toEqual('6');
  
          await expect(call(miaVault, 'checkpoints', [a3, 0])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '4444' })
          );
          await expect(call(miaVault, 'checkpoints', [a3, 1])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t2.blockNumber.toString(), votes: '9999' })
          );
          await expect(call(miaVault, 'checkpoints', [a3, 2])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t3.blockNumber.toString(), votes: '9555' })
          );
          await expect(call(miaVault, 'checkpoints', [a3, 3])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '9000' })
          );
          await expect(call(miaVault, 'checkpoints', [a3, 4])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t5.blockNumber.toString(), votes: '9010' })
          );
          await expect(call(miaVault, 'checkpoints', [a3, 5])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t6.blockNumber.toString(), votes: '5010' })
          );
        });
  
        it('does not add more than one checkpoint in a block', async () => {
          await minerStop();
  
          let t1 = delegate(a2, { from: a1 });
          let t2 = deposit(100, { from: a1 });
          let t3 = requestWithdrawal(10, { from: a1 });
  
          await minerStart();
          t1 = await t1;
          t2 = await t2;
          t3 = await t3;
  
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('1');
  
          await expect(call(miaVault, 'checkpoints', [a2, 0])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '90' })
          );
          await expect(call(miaVault, 'checkpoints', [a2, 1])).resolves.toEqual(
            expect.objectContaining({ fromBlock: '0', votes: '0' })
          );
          await expect(call(miaVault, 'checkpoints', [a2, 2])).resolves.toEqual(
            expect.objectContaining({ fromBlock: '0', votes: '0' })
          );
  
          const t4 = await deposit(20, { from: a1 });
          await expect(call(miaVault, 'numCheckpoints', [a2])).resolves.toEqual('2');
          await expect(call(miaVault, 'checkpoints', [a2, 1])).resolves.toEqual(
            expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '110' })
          );
        });
      });
  
      describe('getPriorVotes', () => {
        it('reverts if block number >= current block', async () => {
          await expect(call(miaVault, 'getPriorVotes', [a1, 5e10])).rejects.toRevert("revert miaVault::getPriorVotes: not yet determined");
        });
  
        it('returns 0 if there are no checkpoints', async () => {
          expect(await call(miaVault, 'getPriorVotes', [a1, 0])).toEqual('0');
        });
  
        it('returns the latest block if >= last checkpoint block', async () => {
          await deposit('20000000000000000000000000', { from: a1 });
          const t1 = await delegate(a1, { from: a1 });
          await mineBlock();
          await mineBlock();
  
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber])).toEqual('20000000000000000000000000');
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('20000000000000000000000000');
        });
  
        it('returns zero if < first checkpoint block', async () => {
          await deposit('20000000000000000000000000', { from: a1 });
          await mineBlock();
          const t1 = await delegate(a1, { from: a1 });
          await mineBlock();
          await mineBlock();
  
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber - 1])).toEqual('0');
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('20000000000000000000000000');
        });
  
        it('generally returns the voting balance at the appropriate checkpoint', async () => {
          await deposit('20000000000000000000000000', { from: a1 });
  
          await send(mia, 'transfer', [a2, '20'], { from: root });
          await send(mia, 'approve', [miaVault._address, '20'], { from: a2 });
          await deposit('20', { from: a2 });
  
          const t1 = await delegate(a1, { from: a1 });
          await mineBlock();
          await mineBlock();
          const t2 = await requestWithdrawal('30', { from: a1 });
          await mineBlock();
          await mineBlock();
          const t3 = await delegate(a1, { from: a2 });
          await mineBlock();
          await mineBlock();
          const t4 = await deposit('10', { from: a1 });
          await mineBlock();
          await mineBlock();
  
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber - 1])).toEqual('0');
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber])).toEqual('20000000000000000000000000');
          expect(await call(miaVault, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('20000000000000000000000000');
          expect(await call(miaVault, 'getPriorVotes', [a1, t2.blockNumber])).toEqual('19999999999999999999999970');
          expect(await call(miaVault, 'getPriorVotes', [a1, t2.blockNumber + 1])).toEqual('19999999999999999999999970');
          expect(await call(miaVault, 'getPriorVotes', [a1, t3.blockNumber])).toEqual('19999999999999999999999990');
          expect(await call(miaVault, 'getPriorVotes', [a1, t3.blockNumber + 1])).toEqual('19999999999999999999999990');
          expect(await call(miaVault, 'getPriorVotes', [a1, t4.blockNumber])).toEqual('20000000000000000000000000');
          expect(await call(miaVault, 'getPriorVotes', [a1, t4.blockNumber + 1])).toEqual('20000000000000000000000000');
        });
      });
    });
  });