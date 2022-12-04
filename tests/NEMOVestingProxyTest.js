const {
    address,
    evmosUnsigned,
    mergeInterface,
    freezeTime
} = require('./Utils/EVMOS');

const BigNum = require('bignumber.js');
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe('EVMOSVestingProxy', () => {
    let root;
    let vrtConversionAddress,
        vrtToken,
        miaToken, miaTokenAddress;
    let miaVestingProxy, miaVestingProxyAddress, miaVestingProxyAdmin;
    let blockTimestamp;
    let vrtConversion, vrtConverterProxy, vrtConverterProxyAddress,
        conversionStartTime, conversionPeriod, conversionRatio;
    let miaVesting, miaVestingAddress;

    beforeEach(async () => {
        [root, vrtConversionAddress, ...accounts] = saddle.accounts;
        blockTimestamp = evmosUnsigned(100);
        await freezeTime(blockTimestamp.toNumber());

        //deploy VRT
        vrtToken = await deploy('VRT', [root]);
        vrtTokenAddress = vrtToken._address;

        //deploy mia
        miaToken = await deploy('MIA', [root]);
        miaTokenAddress = miaToken._address;

        //deploy miaVesting
        miaVesting = await deploy('MIAVestingHarness');
        miaVestingAddress = miaVesting._address;

        //deploy miaVestingProxy
        miaVestingProxy = await deploy("MIAVestingProxy", [miaVestingAddress, miaTokenAddress]);
        miaVestingProxyAddress = miaVestingProxy._address;
        miaVestingProxyAdmin = await call(miaVestingProxy, "admin");
        mergeInterface(miaVestingProxy, miaVesting);


        //deploy VRTConversion
        vrtConversion = await deploy('VRTConverterHarness');
        vrtConversionAddress = vrtConversion._address;
        conversionStartTime = blockTimestamp;
        conversionPeriod = 360 * 24 * 60 * 60;
        // 12,000 VRT =  1 mia
        // 1 VRT = 1/12,000 = 0.000083
        conversionRatio = new BigNum(0.000083e18);

        vrtConverterProxy = await deploy('VRTConverterProxy',
            [vrtConversionAddress, vrtTokenAddress, miaTokenAddress,
                conversionRatio, conversionStartTime, conversionPeriod], { from: root });
        vrtConverterProxyAddress = vrtConverterProxy._address;
        mergeInterface(vrtConverterProxy, vrtConversion);

        //set VRTConverterProxy in miaVesting
        await send(miaVestingProxy, "setVRTConverter", [vrtConverterProxyAddress]);
    });

    describe("constructor", () => {
        it("sets admin to caller and addresses to 0", async () => {
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toBeAddressZero();
            expect(await call(miaVestingProxy, 'pendingImplementation')).toBeAddressZero();
            expect(await call(miaVestingProxy, 'implementation')).toEqual(miaVestingAddress);

            const miaAddressResp = await call(miaVestingProxy, 'mia');
            expect(miaAddressResp).toEqual(miaTokenAddress);

            const vrtConversionAddressResp = await call(miaVestingProxy, 'vrtConversionAddress');
            expect(vrtConversionAddressResp).toEqual(vrtConverterProxyAddress);
        });
    });

    describe("_setPendingImplementation", () => {
        describe("Check caller is admin", () => {
            it("does not change pending implementation address", async () => {
                await expect(send(miaVestingProxy, '_setPendingImplementation', [miaVesting._address], { from: accounts[1] }))
                    .rejects.toRevert("revert Only admin can set Pending Implementation");
                expect(await call(miaVestingProxy, 'pendingImplementation')).toBeAddressZero()
            });
        });

        describe("succeeding", () => {
            it("stores pendingImplementation with value newPendingImplementation", async () => {
                const result = await send(miaVestingProxy, '_setPendingImplementation', [miaVesting._address], { from: root });
                expect(await call(miaVestingProxy, 'pendingImplementation')).toEqual(miaVesting._address);
                expect(result).toHaveLog('NewPendingImplementation', {
                    oldPendingImplementation: address(0),
                    newPendingImplementation: miaVestingAddress
                });
            });

        });

        describe("ZeroAddress as pending implementation", () => {
            it("does not change pending implementation address", async () => {
                await expect(send(miaVestingProxy, '_setPendingImplementation', [ZERO_ADDRESS], { from: accounts[1] }))
                    .rejects.toRevert("revert Address cannot be Zero");
                expect(await call(miaVestingProxy, 'pendingImplementation')).toBeAddressZero()
            });
        });
    });

    describe("_acceptImplementation", () => {
        it("Check caller is pendingImplementation  and pendingImplementation ≠ address(0) ", async () => {
            expect(await send(miaVestingProxy, '_setPendingImplementation', [miaVesting._address], { from: root }));
            await expect(send(miaVestingProxy, '_acceptImplementation', { from: root }))
                .rejects.toRevert("revert only address marked as pendingImplementation can accept Implementation");
            expect(await call(miaVestingProxy, 'implementation')).not.toEqual(miaVestingProxy._address);
        });
    });

    describe("the miaVestingImpl must accept the responsibility of implementation", () => {
        let result;
        beforeEach(async () => {
            await send(miaVestingProxy, '_setPendingImplementation', [miaVesting._address], { from: root })
            const pendingmiaVestingImpl = await call(miaVestingProxy, 'pendingImplementation');
            expect(pendingmiaVestingImpl).toEqual(miaVesting._address);
        });

        it("Store implementation with value pendingImplementation", async () => {
            miaVestingProxyAdmin = await call(miaVestingProxy, 'admin');
            result = await send(miaVesting, '_become', [miaVestingProxy._address], { from: miaVestingProxyAdmin });
            expect(result).toSucceed();
            expect(await call(miaVestingProxy, 'implementation')).toEqual(miaVesting._address);
            expect(await call(miaVestingProxy, 'pendingImplementation')).toBeAddressZero();
        });

    });


    describe("Upgrade miaVesting", () => {

        it("should update the implementation and assert the existing-storage on upgraded implementation", async () => {

            miaVesting = await deploy('miaVestingHarness', [], { from: root });
            miaVestingAddress = miaVesting._address;

            await send(miaVestingProxy, '_setPendingImplementation', [miaVestingAddress], { from: root });
            await send(miaVesting, '_become', [miaVestingProxy._address], { from: miaVestingProxyAdmin });

            const miaVestingImplementationFromProxy = await call(miaVestingProxy, "implementation", []);
            expect(miaVestingImplementationFromProxy).toEqual(miaVestingAddress);

            const miaAddressResp = await call(miaVestingProxy, 'mia');
            expect(miaAddressResp).toEqual(miaTokenAddress);

            const vrtConversionAddressResp = await call(miaVestingProxy, 'vrtConversionAddress');
            expect(vrtConversionAddressResp).toEqual(vrtConverterProxyAddress);
        });

    });

    describe('admin()', () => {
        it('should return correct admin', async () => {
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
        });
    });

    describe('pendingAdmin()', () => {
        it('should return correct pending admin', async () => {
            expect(await call(miaVestingProxy, 'pendingAdmin')).toBeAddressZero()
        });
    });

    describe('_setPendingAdmin()', () => {
        it('should only be callable by admin', async () => {
            await expect(
                 send(miaVestingProxy, '_setPendingAdmin', [accounts[0]], { from: accounts[0] })
            ).rejects.toRevert("revert only admin can set pending admin");

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toBeAddressZero();
        });

        it('should properly set pending admin', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toEqual(accounts[0]);
        });

        it('should properly set pending admin twice', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[1]])).toSucceed();

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toEqual(accounts[1]);
        });

        it('should emit event', async () => {
            const result = await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]]);
            expect(result).toHaveLog('NewPendingAdmin', {
                oldPendingAdmin: address(0),
                newPendingAdmin: accounts[0],
            });
        });
    });

    describe('_acceptAdmin()', () => {
        it('should fail when pending admin is zero', async () => {
            await expect( send(miaVestingProxy, '_acceptAdmin')).rejects.toRevert("revert only address marked as pendingAdmin can accept as Admin");

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toBeAddressZero();
        });

        it('should fail when called by another account (e.g. root)', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            await expect( send(miaVestingProxy, '_acceptAdmin')).rejects.toRevert("revert only address marked as pendingAdmin can accept as Admin");

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toEqual(accounts[0]);
        });

        it('should fail on attempt to set zeroAddress as admin', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            await expect( send(miaVestingProxy, '_setPendingAdmin', [ZERO_ADDRESS])).rejects.toRevert("revert Address cannot be Zero");

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toEqual(accounts[0]);
        });

        it('should fail on multiple attempts of same address is set as PendingAdmin', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            await expect( send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).rejects.toRevert("revert New pendingAdmin can not be same as the previous one");
        });

        it('should succeed on multiple attempts of different address is set as PendingAdmin', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[1]])).toSucceed();

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(root);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toEqual(accounts[1]);
        });

        it('should succeed and set admin and clear pending admin', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            expect(await send(miaVestingProxy, '_acceptAdmin', [], { from: accounts[0] })).toSucceed();

            // Check admin stays the same
            expect(await call(miaVestingProxy, 'admin')).toEqual(accounts[0]);
            expect(await call(miaVestingProxy, 'pendingAdmin')).toBeAddressZero();
        });

        it('should emit log on success', async () => {
            expect(await send(miaVestingProxy, '_setPendingAdmin', [accounts[0]])).toSucceed();
            const result = await send(miaVestingProxy, '_acceptAdmin', [], { from: accounts[0] });
            expect(result).toHaveLog('NewAdmin', {
                oldAdmin: root,
                newAdmin: accounts[0],
            });
            expect(result).toHaveLog('NewPendingAdmin', {
                oldPendingAdmin: accounts[0],
                newPendingAdmin: address(0),
            });
        });
    });

});