const {
    both,
    evmosMantissa,
    encodeParameters,
    advanceBlocks,
    freezeTime,
    mineBlock,
    evmosUnsigned
  } = require('../../Utils/EVMOS');
  
  describe('GovernorBravo#queue/1', () => {
    let root, a1, a2, guardian, accounts;
  
    async function enfranchise(mia, miaVault, actor, amount) {
      await send(miaVault, 'delegate', [actor], { from: actor });
      await send(mia, 'approve', [miaVault._address, evmosMantissa(1e10)], { from: actor });
      // in test cases, we transfer enough token to actor for convenience
      await send(mia, 'transfer', [actor, evmosMantissa(amount)]);
      await send(miaVault, 'deposit', [mia._address, 0, evmosMantissa(amount)], { from: actor });
    }
  
    async function makeVault(mia, actor) {
      const miaVault = await deploy('MIAVault', []);
      const miaStore = await deploy('MIAStore', []);
      await send(miaStore, 'setNewOwner', [miaVault._address], { from: actor });
      await send(miaVault, 'setNemoStore', [mia._address, miaStore._address], { from: actor });
      await send(miaVault, 'add', [mia._address, 100, mia._address, evmosUnsigned(1e16), 300], { from: actor }); // lock period 300s
      return miaVault;
    }
  
    beforeAll(async () => {
      [root, a1, a2, guardian, ...accounts] = saddle.accounts;
    });
  
    describe("overlapping actions", () => {
      it("reverts on queueing overlapping actions in same proposal", async () => {
        const timelock = await deploy('TimelockHarness', [root, 86400 * 2]);
        const mia = await deploy('MIA', [root]);
        const miaVault = await makeVault(mia, root);
        const gov = await deploy(
          'GovernorBravoImmutable',
          [timelock._address, miaVault._address, root, 86400, 1, "100000000000000000000000", guardian]
        );
        await send(gov, '_initiate');
        const txAdmin = await send(timelock, 'harnessSetAdmin', [gov._address]);
  
        await enfranchise(mia, miaVault, a1, 3e6);
        await mineBlock();
  
        const targets = [mia._address, mia._address];
        const values = ["0", "0"];
        const signatures = ["getBalanceOf(address)", "getBalanceOf(address)"];
        const calldatas = [encodeParameters(['address'], [root]), encodeParameters(['address'], [root])];
        const {reply: proposalId1} = await both(gov, 'propose', [targets, values, signatures, calldatas, "do nothing"], {from: a1});
        await mineBlock();
  
        const txVote1 = await send(gov, 'castVote', [proposalId1, 1], {from: a1});
        await advanceBlocks(90000);
  
        await expect(
          send(gov, 'queue', [proposalId1])
        ).rejects.toRevert("revert GovernorBravo::queueOrRevertInternal: identical proposal action already queued at eta");
      });
  
      it("reverts on queueing overlapping actions in different proposals, works if waiting", async () => {
        const timelock = await deploy('TimelockHarness', [root, 86400 * 2]);
        const mia = await deploy('MIA', [root]);
        const miaVault = await makeVault(mia, root);
        const gov = await deploy(
          'GovernorBravoImmutable',
          [timelock._address, miaVault._address, root, 86400, 1, "100000000000000000000000", guardian]
        );
        await send(gov, '_initiate');
        const txAdmin = await send(timelock, 'harnessSetAdmin', [gov._address]);
  
        await enfranchise(mia, miaVault, a1, 3e6);
        await enfranchise(mia, miaVault, a2, 3e6);
        await mineBlock();
  
        const targets = [mia._address];
        const values = ["0"];
        const signatures = ["getBalanceOf(address)"];
        const calldatas = [encodeParameters(['address'], [root])];
        const {reply: proposalId1} = await both(gov, 'propose', [targets, values, signatures, calldatas, "do nothing"], {from: a1});
        const {reply: proposalId2} = await both(gov, 'propose', [targets, values, signatures, calldatas, "do nothing"], {from: a2});
        await mineBlock();
  
        const txVote1 = await send(gov, 'castVote', [proposalId1, 1], {from: a1});
        const txVote2 = await send(gov, 'castVote', [proposalId2, 1], {from: a2});
        await advanceBlocks(90000);
        await freezeTime(100);
  
        const txQueue1 = await send(gov, 'queue', [proposalId1]);
        await expect(
          send(gov, 'queue', [proposalId2])
        ).rejects.toRevert("revert GovernorBravo::queueOrRevertInternal: identical proposal action already queued at eta");
  
        await freezeTime(101);
        const txQueue2 = await send(gov, 'queue', [proposalId2]);
      });
    });
  });