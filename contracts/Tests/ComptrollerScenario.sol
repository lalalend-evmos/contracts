pragma solidity ^0.5.16;

import "./../Comptroller/Comptroller.sol";

contract ComptrollerScenario is Comptroller {
    uint public blockNumber;
    address public miaAddress;
    address public sebAddress;

    constructor() Comptroller() public {}

    function setMIAAddress(address miaAddress_) public {
        miaAddress = miaAddress_;
    }

    function getMIAAddress() public view returns (address) {
        return miaAddress;
    }

    function setSEBAddress(address sebAddress_) public {
        sebAddress = sebAddress_;
    }

    function getSEBAddress() public view returns (address) {
        return sebAddress;
    }

    function membershipLength(NToken nToken) public view returns (uint) {
        return accountAssets[address(nToken)].length;
    }

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;

        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getMiaMarkets() public view returns (address[] memory) {
        uint m = allMarkets.length;
        uint n = 0;
        for (uint i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isMia) {
                n++;
            }
        }

        address[] memory miaMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isMia) {
                miaMarkets[k++] = address(allMarkets[i]);
            }
        }
        return miaMarkets;
    }

    function unlist(NToken nToken) public {
        markets[address(nToken)].isListed = false;
    }

    /**
     * @notice Recalculate and update MIA speeds for all MIA markets
     */
    function refreshMiaSpeeds() public {
        NToken[] memory allMarkets_ = allMarkets;

        for (uint i = 0; i < allMarkets_.length; i++) {
            NToken nToken = allMarkets_[i];
            Exp memory borrowIndex = Exp({mantissa: nToken.borrowIndex()});
            updateMiaSupplyIndex(address(nToken));
            updateMiaBorrowIndex(address(nToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({mantissa: 0});
        Exp[] memory utilities = new Exp[](allMarkets_.length);
        for (uint i = 0; i < allMarkets_.length; i++) {
            NToken nToken = allMarkets_[i];
            if (miaSpeeds[address(nToken)] > 0) {
                Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(nToken)});
                Exp memory utility = mul_(assetPrice, nToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (uint i = 0; i < allMarkets_.length; i++) {
            NToken nToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(miaRate, div_(utilities[i], totalUtility)) : 0;
            setMiaSpeedInternal(nToken, newSpeed);
        }
    }
}
