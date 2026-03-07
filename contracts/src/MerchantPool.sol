// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MerchantPool
/// @notice Holds USDC for a merchant. The platform operator can release funds
///         for verified orders using an off-chain ECDSA signature. The merchant
///         (owner) can withdraw, pause, and configure limits at any time.
contract MerchantPool is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ── State ──────────────────────────────────────────────────────────────
    IERC20 public immutable usdc;
    address public owner;
    address public operator;

    uint256 public maxPerTx;
    uint256 public dailyLimit;

    uint256 public dayStart;
    uint256 public daySpent;

    mapping(bytes32 => bool) public released;

    // ── Events ─────────────────────────────────────────────────────────────
    event Released(bytes32 indexed orderId, address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OperatorUpdated(address indexed newOperator);
    event LimitsUpdated(uint256 maxPerTx, uint256 dailyLimit);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _owner,
        address _operator,
        uint256 _maxPerTx,
        uint256 _dailyLimit
    ) {
        require(_usdc != address(0), "zero usdc");
        require(_owner != address(0), "zero owner");
        require(_operator != address(0), "zero operator");
        require(_maxPerTx > 0, "zero maxPerTx");
        require(_dailyLimit >= _maxPerTx, "dailyLimit < maxPerTx");

        usdc = IERC20(_usdc);
        owner = _owner;
        operator = _operator;
        maxPerTx = _maxPerTx;
        dailyLimit = _dailyLimit;
        dayStart = block.timestamp;
    }

    // ── Modifiers ──────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ── Core: Release funds for a verified order ───────────────────────────
    /// @notice Release USDC for a given order, verified by operator signature.
    /// @param orderId  Unique order identifier (keccak256 of DB order UUID)
    /// @param to       Recipient address (merchant's settlement wallet)
    /// @param amount   Amount in USDC units (6 decimals)
    /// @param signature ECDSA signature from operator over
    ///                  keccak256(abi.encodePacked(orderId, to, amount, address(this), block.chainid))
    function releaseForOrder(
        bytes32 orderId,
        address to,
        uint256 amount,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(!released[orderId], "already released");
        require(to != address(0), "zero recipient");
        require(amount > 0, "zero amount");
        require(amount <= maxPerTx, "exceeds per-tx limit");

        // Verify operator signature (includes chainId to prevent cross-chain replay)
        bytes32 msgHash = keccak256(
            abi.encodePacked(orderId, to, amount, address(this), block.chainid)
        );
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address signer = ECDSA.recover(ethHash, signature);
        require(signer == operator, "invalid signature");

        // Daily limit (rolling 24h window)
        if (block.timestamp >= dayStart + 1 days) {
            dayStart = block.timestamp;
            daySpent = 0;
        }
        require(daySpent + amount <= dailyLimit, "daily limit exceeded");

        // Balance check
        require(usdc.balanceOf(address(this)) >= amount, "insufficient pool");

        // Execute
        released[orderId] = true;
        daySpent += amount;
        usdc.safeTransfer(to, amount);

        emit Released(orderId, to, amount);
    }

    // ── Merchant: Withdraw ─────────────────────────────────────────────────
    /// @notice Withdraw USDC from the pool. Pass 0 to withdraw entire balance.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        uint256 bal = usdc.balanceOf(address(this));
        uint256 sendAmount = amount == 0 ? bal : amount;
        require(sendAmount > 0, "nothing to withdraw");
        require(sendAmount <= bal, "exceeds balance");
        usdc.safeTransfer(owner, sendAmount);
        emit Withdrawn(owner, sendAmount);
    }

    // ── Emergency ──────────────────────────────────────────────────────────
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Admin ──────────────────────────────────────────────────────────────
    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "zero address");
        operator = _operator;
        emit OperatorUpdated(_operator);
    }

    function setLimits(uint256 _maxPerTx, uint256 _dailyLimit) external onlyOwner {
        require(_maxPerTx > 0, "zero maxPerTx");
        require(_dailyLimit >= _maxPerTx, "dailyLimit < maxPerTx");
        maxPerTx = _maxPerTx;
        dailyLimit = _dailyLimit;
        emit LimitsUpdated(_maxPerTx, _dailyLimit);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── View ───────────────────────────────────────────────────────────────
    function poolBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function remainingDailyLimit() external view returns (uint256) {
        if (block.timestamp >= dayStart + 1 days) return dailyLimit;
        return dailyLimit > daySpent ? dailyLimit - daySpent : 0;
    }
}
