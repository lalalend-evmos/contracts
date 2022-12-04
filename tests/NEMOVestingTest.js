const BigNum = require('bignumber.js');
const {
    evmosUnsigned,
    evmosMantissa,
    freezeTime,
    address,
    getBigNumber
} = require('./Utils/EVMOS');

const ONE_DAY = 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const HALF_YEAR = 182.5 * 24 * 60 * 60;
const TOTAL_VESTING_TIME = new BigNum(ONE_YEAR);

const getAllVestingsOfUser = async (evmosVesting, userAddress) => {
    const numberofVestings = await getNumberOfVestingsOfUser(evmosVesting, userAddress);
    const vestings = [];
    let i = 0;
    for (; i < numberofVestings; i++) {
        const vesting = await call(evmosVesting, "vestings", [userAddress, i]);
        vestings.push(vesting);
    }
    return vestings;
}

const getNumberOfVestingsOfUser = async (miaVesting, userAddress) => {
    return await call(miaVesting, "getVestingCount", [userAddress]);
}

const getTotalVestedAmount = async (miaVesting, userAddress) => {
    return await call(miaVesting, "getVestedAmount", [userAddress]);
}

const computeVestedAmount = (amount, vestingStartTime, currentTime) => {
    const timeDelta = new BigNum(currentTime).minus(new BigNum(vestingStartTime));
    const multiplier = new BigNum(amount).multipliedBy(timeDelta);
    const result = multiplier.dividedToIntegerBy(TOTAL_VESTING_TIME);
    return result;
}

const computeWithdrawableAmount = (amount, vestingStartTime, currentTime, withdrawnAmount) => {

    const currentTimeAsBigNumber = getBigNumber(currentTime);
    const vestingStartTimeAsBigNumber = getBigNumber(vestingStartTime);
    const amountAsBigNumber = getBigNumber(amount);
    const withdrawnAmountAsBigNumber = getBigNumber(withdrawnAmount);

    if (currentTimeAsBigNumber.isLessThanOrEqualTo(vestingStartTimeAsBigNumber)) {
        return 0;
    } else if (currentTimeAsBigNumber.isGreaterThan(vestingStartTimeAsBigNumber.plus(TOTAL_VESTING_TIME))) {
        return amount;
    } else {
        const timeDelta = currentTimeAsBigNumber.minus(vestingStartTimeAsBigNumber);
        const multiplier = amountAsBigNumber.multipliedBy(timeDelta);
        const result = multiplier.dividedToIntegerBy(TOTAL_VESTING_TIME);
        return result > 0 ? result.sub(withdrawnAmountAsBigNumber) : 0;
    }
}

const getWithdrawableAmountFromContract = async (miaVesting, userAddress) => {
    return await call(miaVesting, "getWithdrawableAmount", [userAddress]);
}

const getCurrentTimeFromContract = async (miaVesting) => {
    return await call(miaVesting, "getCurrentTime", []);
}

const depositmia = async (miaVesting, recipient, depositAmount, miaVestingAddress, vrtConversionAddress, root) => {
    let depositTxn = await send(miaVesting, 'deposit', [recipient, depositAmount], { from: vrtConversionAddress });
    const currentTimeFromContract = await getCurrentTimeFromContract(miaVesting);
    expect(depositTxn).toSucceed();
    expect(depositTxn).toHaveLog('MIAVested', {
        recipient: recipient,
        startTime: currentTimeFromContract,
        amount: depositAmount.toFixed(),
        withdrawnAmount: 0
    });
    return depositTxn;
}

const withdrawmia = async (miaVesting, recipient) => {
    const withdrawTxn = await send(miaVesting, 'withdraw', [], { from: recipient });
    expect(withdrawTxn).toSucceed();
    return withdrawTxn;
}

const getmiaBalance = async (mia, recipient) => {
    return await call(mia, "balanceOf", [recipient]);
}

describe('MIAVesting', () => {
    let root, alice, bob;
    let vrtConversionAddress,
        vrtToken,
        miaToken, miaTokenAddress;
    let blockTimestamp;
    let vrtFundingAmount;
    let vrtForMint;
    let miaVesting, miaVestingAddress;

    beforeEach(async () => {
        [root, alice, bob, vrtConversionAddress, ...accounts] = saddle.accounts;
        blockTimestamp = evmosUnsigned(100);
        await freezeTime(blockTimestamp.toNumber());

        //deploy VRT
        vrtToken = await deploy('VRT', [root]);

        vrtTokenAddress = vrtToken._address;
        vrtForMint = evmosMantissa(200000);
        await send(vrtToken, 'transfer', [root, vrtForMint], { from: root });

        vrtFundingAmount = evmosMantissa(100000);

        // Transfer ERC20 to alice
        await send(vrtToken, 'transfer', [alice, vrtFundingAmount], { from: root });

        // Transfer ERC20 to bob
        await send(vrtToken, 'transfer', [bob, vrtFundingAmount], { from: root });

        //deploy mia
        miaToken = await deploy('MIA', [root]);
        miaTokenAddress = miaToken._address;

        miaVesting = await deploy('MIAVestingHarness');
        miaVestingAddress = miaVesting._address;
        await send(miaVesting, "initialize", [miaTokenAddress]);
        await send(miaVesting, "setVRTConverter", [vrtConversionAddress]);
    });

    describe("constructor", () => {

        it("sets vrtConversion Address in MIAVesting", async () => {
            let vrtConversionAddressActual = await call(miaVesting, "vrtConversionAddress");
            expect(vrtConversionAddressActual).toEqual(vrtConversionAddress);
        });

        it("set MIA Address in miaVesting", async () => {
            let miaAddressActual = await call(miaVesting, "mia");
            expect(miaAddressActual).toEqual(miaTokenAddress);
        });

        it("sets initialized to true in MIAVesting", async () => {
            let initializedActual = await call(miaVesting, "initialized");
            expect(initializedActual).toEqual(true);
        });

    });

    describe("initialize", () => {

        it("Fail on initialisation by non-Admin", async () => {
            await expect(send(miaVesting, "initialize", [miaTokenAddress], {from: accounts[1]})).rejects.toRevert("revert only admin may initialize the MIAVesting");
        });

        it("Fail on duplicate initialisation", async () => {
            await expect(send(miaVesting, "initialize", [miaTokenAddress])).rejects.toRevert("revert MIAVesting is already initialized");
        });
    });

    describe("Vest MIA", () => {

        let newBlockTimestamp;

        beforeEach(async () => {
            newBlockTimestamp = blockTimestamp.add(ONE_DAY);
            await freezeTime(newBlockTimestamp.toNumber());
        });

        it("deposit MIA", async () => {
            const depositAmount = evmosMantissa(1000);
            const depositTxn = await depositMIA(VestingAddress, vrtConversionAddress, root);

            const vestings = await getAllVestingsOfUser(miaVesting, alice);

            expect(vestings.length).toEqual(1);
            expect(vestings[0].recipient).toEqual(alice);
            expect(getBigNumber(vestings[0].startTime)).toEqual(getBigNumber(newBlockTimestamp));
            expect(getBigNumber(vestings[0].amount)).toEqual(getBigNumber(depositAmount));
            expect(getBigNumber(vestings[0].withdrawnAmount)).toEqual(getBigNumber(0));

            const totalVestedAmount = await getTotalVestedAmount(miaVesting, alice);
            expect(getBigNumber(totalVestedAmount)).toEqual(getBigNumber(0));
        });

        it("can make multiple Deposits followed by few days of timetravel and assert for withdrawable and vestedAmounts", async () => {
            const depositAmount_1 = evmosMantissa(1000);
            let depositTxn = await depositMIA(miaVesting, alice, depositAmount_1, miaVestingAddress, vrtConversionAddress, root);

            let vestings = await getAllVestingsOfUser(miaVesting, alice);
            let totalNumberOfVestings = await getNumberOfVestingsOfUser(miaVesting, alice);

            expect(getBigNumber(vestings.length)).toEqual(getBigNumber(totalNumberOfVestings));
            expect(vestings[0].recipient).toEqual(alice);
            expect(getBigNumber(vestings[0].startTime)).toEqual(getBigNumber(newBlockTimestamp));
            expect(getBigNumber(vestings[0].amount)).toEqual(getBigNumber(depositAmount_1));
            expect(getBigNumber(vestings[0].withdrawnAmount)).toEqual(getBigNumber(0));

            newBlockTimestamp = newBlockTimestamp.add(ONE_DAY);
            await freezeTime(newBlockTimestamp.toNumber());

            const depositAmount_2 =evmosMantissa(2000);
            depositTxn = await depositMIA(miaVesting, alice, depositAmount_2, miaVestingAddress, vrtConversionAddress, root);

            vestings = await getAllVestingsOfUser(miaVesting, alice);
            totalNumberOfVestings = await getNumberOfVestingsOfUser(miaVesting, alice);

            expect(getBigNumber(vestings.length)).toEqual(getBigNumber(totalNumberOfVestings));
            expect(vestings[1].recipient).toEqual(alice);
            expect(getBigNumber(vestings[1].startTime)).toEqual(getBigNumber(newBlockTimestamp));
            expect(getBigNumber(vestings[1].amount)).toEqual(getBigNumber(depositAmount_2));
            expect(getBigNumber(vestings[1].withdrawnAmount)).toEqual(getBigNumber(0));

            let currentTime = await getCurrentTimeFromContract(miaVesting);

            newBlockTimestamp = newBlockTimestamp.add(ONE_DAY);
            await freezeTime(newBlockTimestamp.toNumber());

            //Assert totalVestedAmount after 2 Vestings and advancement of 1-day after each vesting
            currentTime = await getCurrentTimeFromContract(miaVesting);

            const totalVestedAmount_1_Computed = computeVestedAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp);
            const vestedAmount_1_contract = await call(miaVesting, "computeVestedAmount", [vestings[0].amount, vestings[0].startTime, newBlockTimestamp]);
            expect(getBigNumber(vestedAmount_1_contract)).toEqual(getBigNumber(totalVestedAmount_1_Computed));

            const totalVestedAmount_2_Computed = computeVestedAmount(depositAmount_2, vestings[1].startTime, newBlockTimestamp);
            const vestedAmount_2_contract = await call(miaVesting, "computeVestedAmount", [vestings[1].amount, vestings[1].startTime, newBlockTimestamp]);
            expect(getBigNumber(vestedAmount_2_contract)).toEqual(getBigNumber(totalVestedAmount_2_Computed));

            const totalVestedAmount_expected = getBigNumber(totalVestedAmount_1_Computed).plus(getBigNumber(totalVestedAmount_2_Computed));
            const totalVestedAmount = await getTotalVestedAmount(miaVesting, alice);
            expect(getBigNumber(totalVestedAmount)).toEqual(getBigNumber(totalVestedAmount_expected));


            //Assert totalWithdrawableAmount after 2 Vestings and advancement of 1-day after each vesting
            const withdrawableAmount_1_Computed = computeWithdrawableAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp, vestings[0].withdrawnAmount);
            const withdrawableAmount_1_Response_From_Contract = await call(miaVesting, "computeWithdrawableAmount", [depositAmount_1, vestings[0].startTime, vestings[0].withdrawnAmount]);
            const withdrawableAmount_1_From_Contract = withdrawableAmount_1_Response_From_Contract.toWithdraw;
            expect(getBigNumber(withdrawableAmount_1_From_Contract)).toEqual(getBigNumber(withdrawableAmount_1_Computed));

            const withdrawableAmount_2_Computed = computeWithdrawableAmount(depositAmount_2, vestings[1].startTime, newBlockTimestamp, vestings[1].withdrawnAmount);
            const withdrawableAmount_2_Response_From_Contract = await call(miaVesting, "computeWithdrawableAmount", [depositAmount_2, vestings[1].startTime, vestings[1].withdrawnAmount]);
            const withdrawableAmount_2_From_Contract = withdrawableAmount_2_Response_From_Contract.toWithdraw;
            expect(getBigNumber(withdrawableAmount_2_From_Contract)).toEqual(getBigNumber(withdrawableAmount_2_Computed));

            const totalWithdrawableAmount_Expected = getBigNumber(withdrawableAmount_1_Computed).plus(getBigNumber(withdrawableAmount_2_Computed));

            const totalWithdrawableAmountResponse_FromContract = await getWithdrawableAmountFromContract(miaVesting, alice);
            const totalWithdrawableAmount = totalWithdrawableAmountResponse_FromContract.totalWithdrawableAmount;

            expect(getBigNumber(totalWithdrawableAmount)).toEqual(getBigNumber(totalWithdrawableAmount_Expected));
        });

        it("Fail to get withdrawableAmount of a User with no vesting", async () => {
            await expect(call(miaVesting, "getWithdrawableAmount", [bob])).rejects.toRevert("revert recipient doesnot have any vestingRecord");
        });

        it("deposit Zero MIAAmount should Fail with Revert Reason", async () => {
            const depositAmount = evmosMantissa(0);
            await expect(send(miaVesting, 'deposit', [alice, depositAmount], { from: vrtConversionAddress }))
                .rejects.toRevert("revert Deposit amount must be non-zero");
        });

        it("Fail to deposit MIA by Non-VRTConverter", async () => {
            const depositAmount = evmosMantissa(1000);
            await expect(send(miaVesting, 'deposit', [alice, depositAmount], { from: root }))
                .rejects.toRevert("revert only VRTConversion Address can call the function");
        });

    });

    describe("Withdraw MIA", () => {

        let newBlockTimestamp;

        beforeEach(async () => {
            newBlockTimestamp = blockTimestamp.add(ONE_DAY);
            await freezeTime(newBlockTimestamp.toNumber());
        });

        it("should be able to withdraw Partially-Vested-MIA", async () => {
            const depositAmount_1 = evmosMantissa(1000);
            await depositMIA(miaVesting, alice, depositAmount_1, miaVestingAddress, vrtConversionAddress, root);

            newBlockTimestamp = newBlockTimestamp.add(HALF_YEAR);
            await freezeTime(newBlockTimestamp.toNumber());

            const vestings = await getAllVestingsOfUser(miaVesting, alice);
            const withdrawnAmount_Expected =
                computeWithdrawableAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp, vestings[0].withdrawnAmount);
            await send(miaToken, 'transfer', [miaVestingAddress, withdrawnAmount_Expected], { from: root });

            const mia_balance_before_withdraw = await getMIABalance(miaToken, alice);

            const withdrawTxn = await withdrawMIA(miaVesting, alice);

            const mia_balance_after_withdraw = await getMIABalance(miaToken, alice);

            expect(withdrawTxn).toHaveLog('MIAWithdrawn', {
                recipient: alice,
                amount: withdrawnAmount_Expected.toFixed()
            });

            expect(getBigNumber(mia_balance_after_withdraw).isGreaterThan(mia_balance_before_withdraw)).toEqual(true);
            expect(getBigNumber(mia_balance_after_withdraw)).toEqual(getBigNumber(mia_balance_before_withdraw).plus(getBigNumber(withdrawnAmount_Expected)));
        });

        it("should be able to withdraw Fully-Vested-MIA", async () => {
            const depositAmount_1 = evmosMantissa(1000);
            await depositMIA(miaVesting, alice, depositAmount_1, miaVestingAddress, vrtConversionAddress, root);

            newBlockTimestamp = newBlockTimestamp.add(ONE_YEAR);
            await freezeTime(newBlockTimestamp.toNumber());

            const vestings = await getAllVestingsOfUser(miaVesting, alice);
            const withdrawnAmount_Expected =
                computeWithdrawableAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp, vestings[0].withdrawnAmount);
            expect(getBigNumber(withdrawnAmount_Expected)).toEqual(getBigNumber(depositAmount_1));

            await send(miaToken, 'transfer', [miaVestingAddress, depositAmount_1], { from: root });

            const mia_balance_before_withdraw = await getMIABalance(miaToken, alice);

            const withdrawTxn = await withdrawMIA(miaVesting, alice);

            const mia_balance_after_withdraw = await getMIABalance(miaToken, alice);

            expect(withdrawTxn).toHaveLog('MIAWithdrawn', {
                recipient: alice,
                amount: withdrawnAmount_Expected.toFixed()
            });

            expect(getBigNumber(mia_balance_after_withdraw).isGreaterThan(mia_balance_before_withdraw)).toEqual(true);
            expect(getBigNumber(mia_balance_after_withdraw)).toEqual(getBigNumber(mia_balance_before_withdraw).plus(getBigNumber(withdrawnAmount_Expected)));
            expect(getBigNumber(mia_balance_after_withdraw)).toEqual(getBigNumber(depositAmount_1));
        });

        it("should be able to withdraw Vested-MIA from multiple deposits", async () => {
            const depositAmount_1 = evmosMantissa(1000);
            await depositMIA(miaVesting, alice, depositAmount_1, miaVestingAddress, vrtConversionAddress, root);

            newBlockTimestamp = newBlockTimestamp.add(ONE_YEAR);
            await freezeTime(newBlockTimestamp.toNumber());

            await send(miaToken, 'transfer', [miaVestingAddress, depositAmount_1], { from: root });

            const depositAmount_2 = evmosMantissa(2000);
            depositTxn = await depositMIA(miaVesting, alice, depositAmount_2, miaVestingAddress, vrtConversionAddress, root);

            newBlockTimestamp = newBlockTimestamp.add(HALF_YEAR);
            await freezeTime(newBlockTimestamp.toNumber());

            const halfAmount_DepositAmount_2 = getBigNumber(depositAmount_2).multipliedBy(getBigNumber(0.5));

            await send(miaToken, 'transfer', [miaVestingAddress, halfAmount_DepositAmount_2], { from: root });

            const vestings = await getAllVestingsOfUser(miaVesting, alice);
            const withdrawableAmount_From_Vesting_1 =
                computeWithdrawableAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp, vestings[0].withdrawnAmount);
            const withdrawableAmount_From_Vesting_2 =
                computeWithdrawableAmount(depositAmount_2, vestings[1].startTime, newBlockTimestamp, vestings[1].withdrawnAmount);

            const withdrawnAmount_Expected = getBigNumber(withdrawableAmount_From_Vesting_1).plus(getBigNumber(withdrawableAmount_From_Vesting_2));

            const mia_balance_before_withdraw = await getMIABalance(miaToken, alice);

            const withdrawTxn = await withdrawMIA(miaVesting, alice);

            const mia_balance_after_withdraw = await getMIABalance(miaToken, alice);

            expect(withdrawTxn).toHaveLog('MIAWithdrawn', {
                recipient: alice,
                amount: withdrawnAmount_Expected.toFixed()
            });

            expect(getBigNumber(mia_balance_after_withdraw).isGreaterThan(mia_balance_before_withdraw)).toEqual(true);
            expect(getBigNumber(mia_balance_after_withdraw)).toEqual(getBigNumber(mia_balance_before_withdraw).plus(getBigNumber(withdrawnAmount_Expected)));
            expect(getBigNumber(mia_balance_after_withdraw)).toEqual(getBigNumber(depositAmount_1).plus(halfAmount_DepositAmount_2));
        });

        it("Assert for No MIA-Transfer as entire vestedAmount is Withdrawn", async () => {
            const depositAmount_1 = evmosMantissa(1000);
            await depositMIA(miaVesting, alice, depositAmount_1, miaVestingAddress, vrtConversionAddress, root);

            newBlockTimestamp = newBlockTimestamp.add(ONE_YEAR);
            await freezeTime(newBlockTimestamp.toNumber());

            const vestings = await getAllVestingsOfUser(miaVesting, alice);
            const withdrawnAmount_Expected =
                computeWithdrawableAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp, vestings[0].withdrawnAmount);
            expect(getBigNumber(withdrawnAmount_Expected)).toEqual(getBigNumber(depositAmount_1));
            await send(miaToken, 'transfer', [miaVestingAddress, depositAmount_1], { from: root });

            let withdrawTxn = await withdrawMIA(miaVesting, alice);

            newBlockTimestamp = newBlockTimestamp.add(ONE_DAY);
            const mia_balance_before_withdraw = await getMIABalance(miaToken, alice);
            withdrawTxn = await withdrawMIA(miaVesting, alice);

            const mia_balance_after_withdraw = await getMIABalance(miaToken, alice);
            expect(withdrawTxn).toSucceed();
            expect(getBigNumber(mia_balance_before_withdraw)).toEqual(getBigNumber(mia_balance_after_withdraw));
        });

        it("Fail to withdraw as the recipient doesnot have Vesting records", async () => {
            await expect(withdrawMIA(miaVesting, bob)).rejects.toRevert("revert recipient doesnot have any vestingRecord");
        });

        it("Fail to withdraw as the MIAVesting has insufficient balance", async () => {
            const depositAmount_1 = evmosMantissa(1000);
            await depositMIA(miaVesting, alice, depositAmount_1, miaVestingAddress, vrtConversionAddress, root);

            newBlockTimestamp = newBlockTimestamp.add(ONE_YEAR);
            await freezeTime(newBlockTimestamp.toNumber());

            const vestings = await getAllVestingsOfUser(miaVesting, alice);
            const withdrawnAmount_Expected =
                computeWithdrawableAmount(depositAmount_1, vestings[0].startTime, newBlockTimestamp, vestings[0].withdrawnAmount);
            expect(getBigNumber(withdrawnAmount_Expected)).toEqual(getBigNumber(depositAmount_1));

            await expect(withdrawMIA(miaVesting, alice)).rejects.toRevert("revert Insufficient MIA for withdrawal");
        });
    });

});