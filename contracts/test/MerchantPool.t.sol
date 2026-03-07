// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/MerchantPool.sol";

// ── Mock USDC (6 decimals, public mint) ─────────────────────────────────────
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ── Test Suite ───────────────────────────────────────────────────────────────
contract MerchantPoolTest is Test {
    using MessageHashUtils for bytes32;

    MerchantPool pool;
    MockUSDC usdc;

    address ownerAddr;
    address operatorAddr;
    uint256 operatorKey;
    address recipient = makeAddr("recipient");
    address nobody = makeAddr("nobody");

    uint256 constant MAX_PER_TX   = 5_000e6;
    uint256 constant DAILY_LIMIT  = 25_000e6;
    uint256 constant POOL_FUND    = 50_000e6;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function setUp() public {
        ownerAddr = makeAddr("owner");
        (operatorAddr, operatorKey) = makeAddrAndKey("operator");

        usdc = new MockUSDC();

        vm.prank(ownerAddr);
        pool = new MerchantPool(
            address(usdc),
            ownerAddr,
            operatorAddr,
            MAX_PER_TX,
            DAILY_LIMIT
        );

        usdc.mint(address(pool), POOL_FUND);
    }

    /// Build a valid operator signature for releaseForOrder
    function _sign(
        bytes32 orderId,
        address to,
        uint256 amount
    ) internal view returns (bytes memory) {
        bytes32 msgHash = keccak256(
            abi.encodePacked(orderId, to, amount, address(pool), block.chainid)
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════════════════════════════════

    function test_constructor_setsState() public view {
        assertEq(address(pool.usdc()), address(usdc));
        assertEq(pool.owner(), ownerAddr);
        assertEq(pool.operator(), operatorAddr);
        assertEq(pool.maxPerTx(), MAX_PER_TX);
        assertEq(pool.dailyLimit(), DAILY_LIMIT);
    }

    function test_constructor_revert_zeroUsdc() public {
        vm.expectRevert("zero usdc");
        new MerchantPool(address(0), ownerAddr, operatorAddr, MAX_PER_TX, DAILY_LIMIT);
    }

    function test_constructor_revert_zeroOwner() public {
        vm.expectRevert("zero owner");
        new MerchantPool(address(usdc), address(0), operatorAddr, MAX_PER_TX, DAILY_LIMIT);
    }

    function test_constructor_revert_zeroOperator() public {
        vm.expectRevert("zero operator");
        new MerchantPool(address(usdc), ownerAddr, address(0), MAX_PER_TX, DAILY_LIMIT);
    }

    function test_constructor_revert_zeroMaxPerTx() public {
        vm.expectRevert("zero maxPerTx");
        new MerchantPool(address(usdc), ownerAddr, operatorAddr, 0, DAILY_LIMIT);
    }

    function test_constructor_revert_dailyLimitLtMaxPerTx() public {
        vm.expectRevert("dailyLimit < maxPerTx");
        new MerchantPool(address(usdc), ownerAddr, operatorAddr, MAX_PER_TX, MAX_PER_TX - 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  releaseForOrder — happy path
    // ═══════════════════════════════════════════════════════════════════════

    function test_release_success() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = 1_000e6;
        bytes memory sig = _sign(orderId, recipient, amount);

        vm.expectEmit(true, true, false, true);
        emit MerchantPool.Released(orderId, recipient, amount);

        pool.releaseForOrder(orderId, recipient, amount, sig);

        assertTrue(pool.released(orderId));
        assertEq(usdc.balanceOf(recipient), amount);
        assertEq(pool.poolBalance(), POOL_FUND - amount);
    }

    function test_release_multipleOrders() public {
        for (uint256 i = 1; i <= 5; i++) {
            bytes32 orderId = keccak256(abi.encodePacked("order-", i));
            uint256 amount = 1_000e6;
            bytes memory sig = _sign(orderId, recipient, amount);
            pool.releaseForOrder(orderId, recipient, amount, sig);
        }
        assertEq(usdc.balanceOf(recipient), 5_000e6);
        assertEq(pool.daySpent(), 5_000e6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  releaseForOrder — failure cases
    // ═══════════════════════════════════════════════════════════════════════

    function test_release_revert_replayProtection() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = 1_000e6;
        bytes memory sig = _sign(orderId, recipient, amount);

        pool.releaseForOrder(orderId, recipient, amount, sig);

        vm.expectRevert("already released");
        pool.releaseForOrder(orderId, recipient, amount, sig);
    }

    function test_release_revert_zeroRecipient() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = 1_000e6;
        bytes memory sig = _sign(orderId, address(0), amount);

        vm.expectRevert("zero recipient");
        pool.releaseForOrder(orderId, address(0), amount, sig);
    }

    function test_release_revert_zeroAmount() public {
        bytes32 orderId = keccak256("order-1");
        bytes memory sig = _sign(orderId, recipient, 0);

        vm.expectRevert("zero amount");
        pool.releaseForOrder(orderId, recipient, 0, sig);
    }

    function test_release_revert_exceedsPerTxLimit() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = MAX_PER_TX + 1;
        bytes memory sig = _sign(orderId, recipient, amount);

        vm.expectRevert("exceeds per-tx limit");
        pool.releaseForOrder(orderId, recipient, amount, sig);
    }

    function test_release_revert_invalidSignature() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = 1_000e6;

        // Sign with a random key (not the operator)
        (, uint256 randomKey) = makeAddrAndKey("random");
        bytes32 msgHash = keccak256(
            abi.encodePacked(orderId, recipient, amount, address(pool), block.chainid)
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(randomKey, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert("invalid signature");
        pool.releaseForOrder(orderId, recipient, amount, badSig);
    }

    function test_release_revert_insufficientPool() public {
        // Deploy a new pool with zero balance
        vm.prank(ownerAddr);
        MerchantPool emptyPool = new MerchantPool(
            address(usdc), ownerAddr, operatorAddr, MAX_PER_TX, DAILY_LIMIT
        );

        bytes32 orderId = keccak256("order-1");
        uint256 amount = 1_000e6;
        bytes32 msgHash = keccak256(
            abi.encodePacked(orderId, recipient, amount, address(emptyPool), block.chainid)
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert("insufficient pool");
        emptyPool.releaseForOrder(orderId, recipient, amount, sig);
    }

    function test_release_revert_dailyLimitExceeded() public {
        // Burn through the daily limit with 5 x 5000e6 = 25000e6
        for (uint256 i = 1; i <= 5; i++) {
            bytes32 orderId = keccak256(abi.encodePacked("order-", i));
            bytes memory sig = _sign(orderId, recipient, MAX_PER_TX);
            pool.releaseForOrder(orderId, recipient, MAX_PER_TX, sig);
        }
        assertEq(pool.daySpent(), DAILY_LIMIT);

        // Next release should fail
        bytes32 extraId = keccak256("order-extra");
        uint256 smallAmt = 1e6;
        bytes memory sig = _sign(extraId, recipient, smallAmt);

        vm.expectRevert("daily limit exceeded");
        pool.releaseForOrder(extraId, recipient, smallAmt, sig);
    }

    function test_release_dailyLimitResetsAfter24h() public {
        // Hit daily limit
        for (uint256 i = 1; i <= 5; i++) {
            bytes32 orderId = keccak256(abi.encodePacked("order-", i));
            bytes memory sig = _sign(orderId, recipient, MAX_PER_TX);
            pool.releaseForOrder(orderId, recipient, MAX_PER_TX, sig);
        }

        // Warp 24 hours + 1 second
        vm.warp(block.timestamp + 1 days + 1);

        bytes32 newOrderId = keccak256("order-next-day");
        uint256 amount = 1_000e6;
        bytes memory sig = _sign(newOrderId, recipient, amount);

        // Should succeed — daily limit reset
        pool.releaseForOrder(newOrderId, recipient, amount, sig);
        assertTrue(pool.released(newOrderId));
    }

    function test_release_revert_whenPaused() public {
        vm.prank(ownerAddr);
        pool.pause();

        bytes32 orderId = keccak256("order-1");
        uint256 amount = 1_000e6;
        bytes memory sig = _sign(orderId, recipient, amount);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        pool.releaseForOrder(orderId, recipient, amount, sig);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  withdraw
    // ═══════════════════════════════════════════════════════════════════════

    function test_withdraw_specificAmount() public {
        uint256 amount = 10_000e6;
        vm.prank(ownerAddr);

        vm.expectEmit(true, false, false, true);
        emit MerchantPool.Withdrawn(ownerAddr, amount);

        pool.withdraw(amount);

        assertEq(usdc.balanceOf(ownerAddr), amount);
        assertEq(pool.poolBalance(), POOL_FUND - amount);
    }

    function test_withdraw_all() public {
        vm.prank(ownerAddr);

        vm.expectEmit(true, false, false, true);
        emit MerchantPool.Withdrawn(ownerAddr, POOL_FUND);

        pool.withdraw(0);

        assertEq(usdc.balanceOf(ownerAddr), POOL_FUND);
        assertEq(pool.poolBalance(), 0);
    }

    function test_withdraw_revert_notOwner() public {
        vm.prank(nobody);
        vm.expectRevert("not owner");
        pool.withdraw(1_000e6);
    }

    function test_withdraw_revert_exceedsBalance() public {
        vm.prank(ownerAddr);
        vm.expectRevert("exceeds balance");
        pool.withdraw(POOL_FUND + 1);
    }

    function test_withdraw_revert_nothingToWithdraw() public {
        // Withdraw all first
        vm.prank(ownerAddr);
        pool.withdraw(0);

        // Now try withdraw(0) on empty pool
        vm.prank(ownerAddr);
        vm.expectRevert("nothing to withdraw");
        pool.withdraw(0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  pause / unpause
    // ═══════════════════════════════════════════════════════════════════════

    function test_pause_unpause() public {
        vm.prank(ownerAddr);
        pool.pause();
        assertTrue(pool.paused());

        vm.prank(ownerAddr);
        pool.unpause();
        assertFalse(pool.paused());
    }

    function test_pause_revert_notOwner() public {
        vm.prank(nobody);
        vm.expectRevert("not owner");
        pool.pause();
    }

    function test_unpause_revert_notOwner() public {
        vm.prank(ownerAddr);
        pool.pause();

        vm.prank(nobody);
        vm.expectRevert("not owner");
        pool.unpause();
    }

    function test_unpause_restoresRelease() public {
        vm.prank(ownerAddr);
        pool.pause();

        vm.prank(ownerAddr);
        pool.unpause();

        bytes32 orderId = keccak256("order-after-unpause");
        uint256 amount = 500e6;
        bytes memory sig = _sign(orderId, recipient, amount);

        pool.releaseForOrder(orderId, recipient, amount, sig);
        assertTrue(pool.released(orderId));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  setOperator
    // ═══════════════════════════════════════════════════════════════════════

    function test_setOperator() public {
        address newOp = makeAddr("newOperator");

        vm.prank(ownerAddr);
        vm.expectEmit(true, false, false, false);
        emit MerchantPool.OperatorUpdated(newOp);

        pool.setOperator(newOp);
        assertEq(pool.operator(), newOp);
    }

    function test_setOperator_revert_zeroAddress() public {
        vm.prank(ownerAddr);
        vm.expectRevert("zero address");
        pool.setOperator(address(0));
    }

    function test_setOperator_revert_notOwner() public {
        vm.prank(nobody);
        vm.expectRevert("not owner");
        pool.setOperator(makeAddr("x"));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  setLimits
    // ═══════════════════════════════════════════════════════════════════════

    function test_setLimits() public {
        uint256 newMax = 10_000e6;
        uint256 newDaily = 50_000e6;

        vm.prank(ownerAddr);
        vm.expectEmit(false, false, false, true);
        emit MerchantPool.LimitsUpdated(newMax, newDaily);

        pool.setLimits(newMax, newDaily);
        assertEq(pool.maxPerTx(), newMax);
        assertEq(pool.dailyLimit(), newDaily);
    }

    function test_setLimits_revert_zeroMaxPerTx() public {
        vm.prank(ownerAddr);
        vm.expectRevert("zero maxPerTx");
        pool.setLimits(0, DAILY_LIMIT);
    }

    function test_setLimits_revert_dailyLimitLtMax() public {
        vm.prank(ownerAddr);
        vm.expectRevert("dailyLimit < maxPerTx");
        pool.setLimits(10_000e6, 5_000e6);
    }

    function test_setLimits_revert_notOwner() public {
        vm.prank(nobody);
        vm.expectRevert("not owner");
        pool.setLimits(MAX_PER_TX, DAILY_LIMIT);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  transferOwnership
    // ═══════════════════════════════════════════════════════════════════════

    function test_transferOwnership() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(ownerAddr);
        vm.expectEmit(true, true, false, false);
        emit MerchantPool.OwnerTransferred(ownerAddr, newOwner);

        pool.transferOwnership(newOwner);
        assertEq(pool.owner(), newOwner);
    }

    function test_transferOwnership_revert_zeroAddress() public {
        vm.prank(ownerAddr);
        vm.expectRevert("zero address");
        pool.transferOwnership(address(0));
    }

    function test_transferOwnership_revert_notOwner() public {
        vm.prank(nobody);
        vm.expectRevert("not owner");
        pool.transferOwnership(makeAddr("x"));
    }

    function test_transferOwnership_newOwnerCanAct() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(ownerAddr);
        pool.transferOwnership(newOwner);

        // Old owner can no longer act
        vm.prank(ownerAddr);
        vm.expectRevert("not owner");
        pool.pause();

        // New owner can
        vm.prank(newOwner);
        pool.pause();
        assertTrue(pool.paused());
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  View functions
    // ═══════════════════════════════════════════════════════════════════════

    function test_poolBalance() public view {
        assertEq(pool.poolBalance(), POOL_FUND);
    }

    function test_remainingDailyLimit_fresh() public view {
        assertEq(pool.remainingDailyLimit(), DAILY_LIMIT);
    }

    function test_remainingDailyLimit_afterSpend() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = 3_000e6;
        bytes memory sig = _sign(orderId, recipient, amount);
        pool.releaseForOrder(orderId, recipient, amount, sig);

        assertEq(pool.remainingDailyLimit(), DAILY_LIMIT - amount);
    }

    function test_remainingDailyLimit_resetsAfter24h() public {
        bytes32 orderId = keccak256("order-1");
        uint256 amount = 3_000e6;
        bytes memory sig = _sign(orderId, recipient, amount);
        pool.releaseForOrder(orderId, recipient, amount, sig);

        vm.warp(block.timestamp + 1 days + 1);
        assertEq(pool.remainingDailyLimit(), DAILY_LIMIT);
    }

    function test_remainingDailyLimit_zeroWhenExhausted() public {
        for (uint256 i = 1; i <= 5; i++) {
            bytes32 orderId = keccak256(abi.encodePacked("order-", i));
            bytes memory sig = _sign(orderId, recipient, MAX_PER_TX);
            pool.releaseForOrder(orderId, recipient, MAX_PER_TX, sig);
        }
        assertEq(pool.remainingDailyLimit(), 0);
    }
}
