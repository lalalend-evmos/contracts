pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../NTokens/NErc20.sol";
import "../NTokens/NToken.sol";
import "../Oracle/PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Governance/GovernorAlpha.sol";
import "../Governance/MIA.sol";
import "../Comptroller/ComptrollerInterface.sol";
import "../libraries/SafeMath.sol";

contract MiaLens is ExponentialNoError {

    using SafeMath for uint;
 
    /// @notice Blocks Per Day
    uint public constant BLOCKS_PER_DAY = 28800;

    struct MiaMarketState {
        uint224 index;
        uint32 block;
    }

    struct NTokenMetadata {
        address nToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint nTokenDecimals;
        uint underlyingDecimals;
        uint miaSupplySpeed;
        uint miaBorrowSpeed;
        uint dailySupplyMia;
        uint dailyBorrowMia;
    }

    function nTokenMetadata(NToken nToken) public returns (NTokenMetadata memory) {
        uint exchangeRateCurrent = nToken.exchangeRateCurrent();
        address comptrollerAddress = address(nToken.comptroller());
        ComptrollerInterface comptroller = ComptrollerInterface(comptrollerAddress);
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(nToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        if (compareStrings(nToken.symbol(), "nEVMOS")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            NErc20 nErc20 = NErc20(address(nToken));
            underlyingAssetAddress = nErc20.underlying();
            underlyingDecimals = EIP20Interface(nErc20.underlying()).decimals();
        }

        


        uint miaSpeedPerBlock = comptroller.miaSpeeds(address(nToken));

        return NTokenMetadata({
            nToken: address(nToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: nToken.supplyRatePerBlock(),
            borrowRatePerBlock: nToken.borrowRatePerBlock(),
            reserveFactorMantissa: nToken.reserveFactorMantissa(),
            totalBorrows: nToken.totalBorrows(),
            totalReserves: nToken.totalReserves(),
            totalSupply: nToken.totalSupply(),
            totalCash: nToken.getCash(),
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            nTokenDecimals: nToken.decimals(),
            underlyingDecimals: underlyingDecimals,
            miaSupplySpeed: miaSpeedPerBlock,
            miaBorrowSpeed: miaSpeedPerBlock,
            dailySupplyMia: miaSpeedPerBlock.mul(BLOCKS_PER_DAY),
            dailyBorrowMia: miaSpeedPerBlock.mul(BLOCKS_PER_DAY)
        });
    }

    function nTokenMetadataAll(NToken[] calldata nTokens) external returns (NTokenMetadata[] memory) {
        uint nTokenCount = nTokens.length;
        NTokenMetadata[] memory res = new NTokenMetadata[](nTokenCount);
        for (uint i = 0; i < nTokenCount; i++) {
            res[i] = nTokenMetadata(nTokens[i]);
        }
        return res;
    }

    function getDailyMIA(address payable account, address comptrollerAddress) external returns (uint) {
        ComptrollerInterface comptrollerInstance = ComptrollerInterface(comptrollerAddress);
        NToken[] memory nTokens = comptrollerInstance.getAllMarkets();
        uint dailyMiaPerAccount = 0;
        
        for (uint i = 0; i < nTokens.length; i++) {
            NToken nToken = nTokens[i];            
            NTokenMetadata memory metaDataItem = nTokenMetadata(nToken);

            //get balanceOfUnderlying and borrowBalanceCurrent from nTokenBalance
            NTokenBalances memory nTokenBalanceInfo = nTokenBalances(nToken, account);

            NTokenUnderlyingPrice memory underlyingPriceResponse = nTokenUnderlyingPrice(nToken);
            uint underlyingPrice = underlyingPriceResponse.underlyingPrice;
            Exp memory underlyingPriceMantissa = Exp({mantissa: underlyingPrice});

            //get dailyMiaSupplyMarket
            uint dailyMiaSupplyMarket = 0;
            uint supplyInUsd = mul_ScalarTruncate(underlyingPriceMantissa, nTokenBalanceInfo.balanceOfUnderlying);
            uint marketTotalSupply = (metaDataItem.totalSupply.mul(metaDataItem.exchangeRateCurrent)).div(1e18);
            uint marketTotalSupplyInUsd = mul_ScalarTruncate(underlyingPriceMantissa, marketTotalSupply);

            if(marketTotalSupplyInUsd > 0) {
                dailyMiaSupplyMarket = (metaDataItem.dailySupplyMia.mul(supplyInUsd)).div(marketTotalSupplyInUsd);
            }

            //get dailyMiaBorrowMarket
            uint dailyMiaBorrowMarket = 0;
            uint borrowsInUsd = mul_ScalarTruncate(underlyingPriceMantissa, nTokenBalanceInfo.borrowBalanceCurrent);
            uint marketTotalBorrowsInUsd = mul_ScalarTruncate(underlyingPriceMantissa, metaDataItem.totalBorrows);

            if(marketTotalBorrowsInUsd > 0){
                dailyMiaBorrowMarket = (metaDataItem.dailyBorrowMia.mul(borrowsInUsd)).div(marketTotalBorrowsInUsd);
            }

            dailyMiaPerAccount += dailyMiaSupplyMarket + dailyMiaBorrowMarket;
        }

        return dailyMiaPerAccount;
    }

    struct NTokenBalances {
        address nToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    function nTokenBalances(NToken nToken, address payable account) public returns (NTokenBalances memory) {
        uint balanceOf = nToken.balanceOf(account);
        uint borrowBalanceCurrent = nToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = nToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;
        if (compareStrings(nToken.symbol(), "nEVMOS")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            NErc20 nErc20 = NErc20(address(nToken));
            EIP20Interface underlying = EIP20Interface(nErc20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(nToken));
        }

        
        

        return NTokenBalances({
            nToken: address(nToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    function nTokenBalancesAll(NToken[] calldata nTokens, address payable account) external returns (NTokenBalances[] memory) {
        uint nTokenCount = nTokens.length;
        NTokenBalances[] memory res = new NTokenBalances[](nTokenCount);
        for (uint i = 0; i < nTokenCount; i++) {
            res[i] = nTokenBalances(nTokens[i], account);
        }
        return res;
    }

    struct NTokenUnderlyingPrice {
        address nToken;
        uint underlyingPrice;
    }

    function nTokenUnderlyingPrice(NToken nToken) public view returns (NTokenUnderlyingPrice memory) {
        ComptrollerInterface comptroller = ComptrollerInterface(address(nToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

        return NTokenUnderlyingPrice({
            nToken: address(nToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(nToken)
        });
    }

    function nTokenUnderlyingPriceAll(NToken[] calldata nTokens) external view returns (NTokenUnderlyingPrice[] memory) {
        uint nTokenCount = nTokens.length;
        NTokenUnderlyingPrice[] memory res = new NTokenUnderlyingPrice[](nTokenCount);
        for (uint i = 0; i < nTokenCount; i++) {
            res[i] = nTokenUnderlyingPrice(nTokens[i]);
        }
        return res;
    }

    struct AccountLimits {
        NToken[] markets;
        uint liquidity;
        uint shortfall;
    }

    function getAccountLimits(ComptrollerInterface comptroller, address account) public view returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(account);
        require(errorCode == 0, "account liquidity error");

        return AccountLimits({
            markets: comptroller.getAssetsIn(account),
            liquidity: liquidity,
            shortfall: shortfall
        });
    }

    struct GovReceipt {
        uint proposalId;
        bool hasVoted;
        bool support;
        uint96 votes;
    }

    function getGovReceipts(GovernorAlpha governor, address voter, uint[] memory proposalIds) public view returns (GovReceipt[] memory) {
        uint proposalCount = proposalIds.length;
        GovReceipt[] memory res = new GovReceipt[](proposalCount);
        for (uint i = 0; i < proposalCount; i++) {
            GovernorAlpha.Receipt memory receipt = governor.getReceipt(proposalIds[i], voter);
            res[i] = GovReceipt({
                proposalId: proposalIds[i],
                hasVoted: receipt.hasVoted,
                support: receipt.support,
                votes: receipt.votes
            });
        }
        return res;
    }

    struct GovProposal {
        uint proposalId;
        address proposer;
        uint eta;
        address[] targets;
        uint[] values;
        string[] signatures;
        bytes[] calldatas;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        bool canceled;
        bool executed;
    }

    function setProposal(GovProposal memory res, GovernorAlpha governor, uint proposalId) internal view {
        (
            ,
            address proposer,
            uint eta,
            uint startBlock,
            uint endBlock,
            uint forVotes,
            uint againstVotes,
            bool canceled,
            bool executed
        ) = governor.proposals(proposalId);
        res.proposalId = proposalId;
        res.proposer = proposer;
        res.eta = eta;
        res.startBlock = startBlock;
        res.endBlock = endBlock;
        res.forVotes = forVotes;
        res.againstVotes = againstVotes;
        res.canceled = canceled;
        res.executed = executed;
    }

    function getGovProposals(GovernorAlpha governor, uint[] calldata proposalIds) external view returns (GovProposal[] memory) {
        GovProposal[] memory res = new GovProposal[](proposalIds.length);
        for (uint i = 0; i < proposalIds.length; i++) {
            (
                address[] memory targets,
                uint[] memory values,
                string[] memory signatures,
                bytes[] memory calldatas
            ) = governor.getActions(proposalIds[i]);
            res[i] = GovProposal({
                proposalId: 0,
                proposer: address(0),
                eta: 0,
                targets: targets,
                values: values,
                signatures: signatures,
                calldatas: calldatas,
                startBlock: 0,
                endBlock: 0,
                forVotes: 0,
                againstVotes: 0,
                canceled: false,
                executed: false
            });
            setProposal(res[i], governor, proposalIds[i]);
        }
        return res;
    }

    struct MIABalanceMetadata {
        uint balance; 
        uint votes;
        address delegate;
    }

    function getMIABalanceMetadata(MIA mia, address account) external view returns (MIABalanceMetadata memory) {
        return MIABalanceMetadata({
            balance: mia.balanceOf(account),
            votes: uint256(mia.getCurrentVotes(account)),
            delegate: mia.delegates(account)
        });
    }

    struct MIABalanceMetadataExt {
        uint balance;
        uint votes;
        address delegate;
        uint allocated;
    }

    function getMIABalanceMetadataExt(MIA mia, ComptrollerInterface comptroller, address account) external returns (MIABalanceMetadataExt memory) {
        uint balance = mia.balanceOf(account);
        comptroller.claimMia(account);
        uint newBalance = mia.balanceOf(account);
        uint accrued = comptroller.miaAccrued(account);
        uint total = add_(accrued, newBalance, "sum mia total");
        uint allocated = sub_(total, balance, "sub allocated");

        return MIABalanceMetadataExt({
            balance: balance,
            votes: uint256(mia.getCurrentVotes(account)),
            delegate: mia.delegates(account),
            allocated: allocated
        });
    }

    struct MiaVotes {
        uint blockNumber;
        uint votes;
    }

    function getMiaVotes(MIA mia, address account, uint32[] calldata blockNumbers) external view returns (MiaVotes[] memory) {
        MiaVotes[] memory res = new MiaVotes[](blockNumbers.length);
        for (uint i = 0; i < blockNumbers.length; i++) {
            res[i] = MiaVotes({
                blockNumber: uint256(blockNumbers[i]),
                votes: uint256(mia.getPriorVotes(account, blockNumbers[i]))
            });
        }
        return res;
    }

    // calculate the accurate pending mia rewards without touching any storage
    function updateMiaSupplyIndex(MiaMarketState memory supplyState, address nToken, ComptrollerInterface comptroller) internal view {
        uint supplySpeed = comptroller.miaSpeeds(nToken);
        uint blockNumber = block.number;
        uint deltaBlocks = sub_(blockNumber, uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = NToken(nToken).totalSupply();
            uint miaAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(miaAccrued, supplyTokens) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
            supplyState.index = safe224(index.mantissa, "new index overflows");
            supplyState.block = safe32(blockNumber, "block number overflows");
        } else if (deltaBlocks > 0) {
            supplyState.block = safe32(blockNumber, "block number overflows");
        }
    }

    function updateMiaBorrowIndex(MiaMarketState memory borrowState, address nToken, Exp memory marketBorrowIndex, ComptrollerInterface comptroller) internal view {
        uint borrowSpeed = comptroller.miaSpeeds(nToken);
        uint blockNumber = block.number;
        uint deltaBlocks = sub_(blockNumber, uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(NToken(nToken).totalBorrows(), marketBorrowIndex);
            uint miaAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(miaAccrued, borrowAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
            borrowState.index = safe224(index.mantissa, "new index overflows");
            borrowState.block = safe32(blockNumber, "block number overflows");
        } else if (deltaBlocks > 0) {
            borrowState.block = safe32(blockNumber, "block number overflows");
        }
    }

    function distributeSupplierMia(
        MiaMarketState memory supplyState, 
        address nToken, 
        address supplier, 
        ComptrollerInterface comptroller
    ) internal view returns (uint) {
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: comptroller.miaSupplierIndex(nToken, supplier)});
        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = comptroller.miaInitialIndex();
        }
        
        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint supplierTokens = NToken(nToken).balanceOf(supplier);
        uint supplierDelta = mul_(supplierTokens, deltaIndex);
        return supplierDelta;
    }

    function distributeBorrowerMia(
        MiaMarketState memory borrowState, 
        address nToken, 
        address borrower, 
        Exp memory marketBorrowIndex, 
        ComptrollerInterface comptroller
    ) internal view returns (uint) {
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: comptroller.miaBorrowerIndex(nToken, borrower)});
        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(NToken(nToken).borrowBalanceStored(borrower), marketBorrowIndex);
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            return borrowerDelta;
        }
        return 0;
    }

    struct ClaimMiaLocalVariables {
        uint totalRewards;
        uint224 borrowIndex;
        uint32 borrowBlock;
        uint224 supplyIndex;
        uint32 supplyBlock;
    }

    function pendingMia(address holder, ComptrollerInterface comptroller) external view returns (uint) {
        NToken[] memory nTokens = comptroller.getAllMarkets();
        ClaimMiaLocalVariables memory vars;
        for (uint i = 0; i < nTokens.length; i++) {
            (vars.borrowIndex, vars.borrowBlock) = comptroller.miaBorrowState(address(nTokens[i]));
            MiaMarketState memory borrowState = MiaMarketState({
                index: vars.borrowIndex,
                block: vars.borrowBlock
            });

            (vars.supplyIndex, vars.supplyBlock) = comptroller.miaSupplyState(address(nTokens[i]));
            MiaMarketState memory supplyState = MiaMarketState({
                index: vars.supplyIndex,
                block: vars.supplyBlock
            });

            Exp memory borrowIndex = Exp({mantissa: nTokens[i].borrowIndex()});
            updateMiaBorrowIndex(borrowState, address(nTokens[i]), borrowIndex, comptroller);
            uint reward = distributeBorrowerMia(borrowState, address(nTokens[i]), holder, borrowIndex, comptroller);
            vars.totalRewards = add_(vars.totalRewards, reward);

            updateMiaSupplyIndex(supplyState, address(nTokens[i]), comptroller);
            reward = distributeSupplierMia(supplyState, address(nTokens[i]), holder, comptroller);
            vars.totalRewards = add_(vars.totalRewards, reward);
        }
        return add_(comptroller.miaAccrued(holder), vars.totalRewards);
    }

    // utilities
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}