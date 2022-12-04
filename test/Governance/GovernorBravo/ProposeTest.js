const {
    address,
    evmosMantissa,
    encodeParameters,
    mineBlock,
    evmosUnsigned
  } = require('../../utils/EVMOS');

  const { ethers } = require('hardhat');
const { expect } = require("chai");
  const votingDelay = 1;
  const votingPeriod = 86400;
  
  describe('GovernorBravo#propose/5', () => {
    let gov, owner, guardian, acct, mia, miaVault, MIA, MIAVault, MIAStore, miaStore, GOV;
    let trivialProposal, targets, values, signatures, callDatas;
    let proposalBlock;

    async function enfranchise(actor, amount) {
      await miaVault.connect(actor).delegate(actor.address);
      await mia.connect(actor).approve(miaVault.address, ethers.utils.parseEther("1e10"));
      // in test cases, we transfer enough token to actor for convenience
      await mia.transfer(actor.address, String(evmosMantissa(amount)));
      await miaVault.connect(actor).deposit(mia.address, 0, String(evmosMantissa(amount)));
    }
  
    beforeEach(async () => {
      [owner, acct, guardian] = await ethers.getSigners();
      MIA = await ethers.getContractFactory("MIA");
      mia = await MIA.deploy(owner.address);

      MIAVault = await ethers.getContractFactory("MIAVault");
      miaVault = await MIAVault.deploy([]);

      MIAStore = await ethers.getContractFactory("MIAStore");
      miaStore = await MIAStore.deploy([]);

      await miaStore.setNewOwner(miaVault.address);
      await miaVault.setMIAStore(mia.address, miaStore.address);
      await miaVault.add(mia.address, 100, mia.address, ethers.utils.parseEther("1e16"), 300); // lock period 300s
  
      GOV = await ethers.getContractFactory("GovernorBravoImmutable");
      gov = await GOV.deploy(address(0), miaVault.address, owner.address, votingPeriod, votingDelay, String("100000000000000000000000"), guardian.address);
      await gov.deployed();
      //await gov._initiate();

      targets = [owner.address];
      values = ["0"];
      signatures = ["getBalanceOf(address)"];
      callDatas = [encodeParameters(['address'], [acct.address])];
      await enfranchise(owner, 400000);
      await gov.propose(targets, values, signatures, callDatas, "do nothing");
      proposalBlock = +(await web3.eth.getBlockNumber());
      proposalId = await gov.latestProposalIds(owner.address);
      trivialProposal = await gov.proposals(proposalId);
    });
  
  
    it("Given the sender's GetPriorVotes for the immediately previous block is above the Proposal Threshold (e.g. 2%), the given proposal is added to all proposals, given the following settings", async () => {
      test.todo('depends on get prior votes and delegation and voting');
    });
  
    describe("simple initialization", () => {
      it("ID is set to a globally unique identifier", async () => {
        expect(trivialProposal.id).to.equal(proposalId);
      });
  
      it("Proposer is set to the sender", async () => {
        expect(trivialProposal.proposer).to.equal(owner.address);
      });
  
      it("Start block is set to the current block number plus vote delay", async () => {
        expect(trivialProposal.startBlock).to.equal(proposalBlock + 1 + "");
      });
  
      it("End block is set to the current block number plus the sum of vote delay and vote period", async () => {
        expect(trivialProposal.endBlock).to.equal(proposalBlock + 1 + 86400 + "");
      });
  
      it("ForVotes and AgainstVotes are initialized to zero", async () => {
        expect(trivialProposal.forVotes).to.equal("0");
        expect(trivialProposal.againstVotes).to.equal("0");
      });
  
      it("Voters is initialized to the empty set", async () => {
        test.todo('mmm probably nothing to prove here unless we add a counter or something');
      });
  
      it("Executed and Canceled flags are initialized to false", async () => {
        expect(trivialProposal.canceled).to.equal(false);
        expect(trivialProposal.executed).to.equal(false);
      });
  
      it("ETA is initialized to zero", async () => {
        expect(trivialProposal.eta).to.equal("0");
      });
  
      it("Targets, Values, Signatures, Calldatas are set according to parameters", async () => {
        let dynamicFields = await gov.getActions(trivialProposal.id);
        expect(dynamicFields.targets).to.equal(targets);
        expect(dynamicFields.values).to.equal(values);
        expect(dynamicFields.signatures).to.equal(signatures);
        expect(dynamicFields.calldatas).to.equal(callDatas);
      });
      
      /*
      describe("This function must revert if", () => {
        it("the length of the values, signatures or calldatas arrays are not the same length,", async () => {
          await expect(
            call(gov, 'propose', [targets.concat(root), values, signatures, callDatas, "do nothing"])
          ).rejects.toRevert("revert GovernorBravo::propose: proposal function information arity mismatch");
  
          await expect(
            call(gov, 'propose', [targets, values.concat(values), signatures, callDatas, "do nothing"])
          ).rejects.toRevert("revert GovernorBravo::propose: proposal function information arity mismatch");
  
          await expect(
            call(gov, 'propose', [targets, values, signatures.concat(signatures), callDatas, "do nothing"])
          ).rejects.toRevert("revert GovernorBravo::propose: proposal function information arity mismatch");
  
          await expect(
            call(gov, 'propose', [targets, values, signatures, callDatas.concat(callDatas), "do nothing"])
          ).rejects.toRevert("revert GovernorBravo::propose: proposal function information arity mismatch");
        });
  
        it("or if that length is zero or greater than Max Operations.", async () => {
          await expect(
            call(gov, 'propose', [[], [], [], [], "do nothing"])
          ).rejects.toRevert("revert GovernorBravo::propose: must provide actions");
        });
  
        describe("Additionally, if there exists a pending or active proposal from the same proposer, we must revert.", () => {
          it("reverts with pending", async () => {
            await expect(
              call(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"])
            ).rejects.toRevert("revert GovernorBravo::propose: one live proposal per proposer, found an already pending proposal");
          });
  
          it("reverts with active", async () => {
            await mineBlock();
            await mineBlock();
  
            await expect(
              call(gov, 'propose', [targets, values, signatures, callDatas, "do nothing"])
            ).rejects.toRevert("revert GovernorBravo::propose: one live proposal per proposer, found an already active proposal");
          });
        });
      });
  
      it("This function returns the id of the newly created proposal. # proposalId(n) = succ(proposalId(n-1))", async () => {
        await enfranchise(accounts[2], 400001);
  
        await mineBlock();
        let nextProposalId = await gov.methods['propose'](targets, values, signatures, callDatas, "yoot").call({ from: accounts[2] });
        // let nextProposalId = await call(gov, 'propose', [targets, values, signatures, callDatas, "second proposal"], { from: accounts[2] });
  
        expect(+nextProposalId).toEqual(+trivialProposal.id + 1);
      });
  
      it("emits log with id and description", async () => {
        await enfranchise(accounts[3], 400001);
  
        await mineBlock();
        let nextProposalId = await gov.methods['propose'](targets, values, signatures, callDatas, "yoot").call({ from: accounts[3] });
        const currentBlockNumber = await web3.eth.getBlockNumber();
        const proposeStartBlock = currentBlockNumber + votingDelay + 1;
        expect(
          await send(gov, 'propose', [targets, values, signatures, callDatas, "second proposal"], { from: accounts[3] })
        ).toHaveLog("ProposalCreated", {
          id: nextProposalId,
          targets: targets,
          values: values,
          signatures: signatures,
          calldatas: callDatas,
          startBlock: proposeStartBlock,
          endBlock: proposeStartBlock + votingPeriod,
          description: "second proposal",
          proposer: accounts[3]
        });
      });
      */
    });
  });