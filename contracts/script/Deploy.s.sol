// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MerchantPool.sol";

/**
 * @title Deploy MerchantPool
 * @notice Foundry script to deploy MerchantPool on Base, Base Sepolia, or Polygon.
 *
 * Usage:
 *   # Base Sepolia (testnet)
 *   forge script script/Deploy.s.sol:DeployMerchantPool \
 *     --rpc-url base_sepolia --broadcast --verify \
 *     -vvvv
 *
 *   # Base Mainnet
 *   forge script script/Deploy.s.sol:DeployMerchantPool \
 *     --rpc-url base --broadcast --verify \
 *     -vvvv
 *
 * Required env vars:
 *   PRIVATE_KEY       - Deployer's private key
 *   OWNER_ADDRESS     - Merchant wallet (contract owner)
 *   OPERATOR_ADDRESS  - Platform operator (signs releases)
 *   MAX_PER_TX        - Max USDC per transaction (6 decimals, e.g. 5000000000 = $5000)
 *   DAILY_LIMIT       - Daily USDC limit (6 decimals, e.g. 25000000000 = $25000)
 */
contract DeployMerchantPool is Script {
    // USDC addresses per chain
    address constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant USDC_POLYGON = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        uint256 maxPerTx = vm.envOr("MAX_PER_TX", uint256(5000 * 1e6)); // default $5000
        uint256 dailyLimit = vm.envOr("DAILY_LIMIT", uint256(25000 * 1e6)); // default $25000

        // Select USDC address based on chain ID
        address usdc;
        if (block.chainid == 8453) {
            usdc = USDC_BASE;
        } else if (block.chainid == 84532) {
            usdc = USDC_BASE_SEPOLIA;
        } else if (block.chainid == 137) {
            usdc = USDC_POLYGON;
        } else {
            revert("Unsupported chain");
        }

        vm.startBroadcast(deployerKey);

        MerchantPool pool = new MerchantPool(
            usdc,
            owner,
            operator,
            maxPerTx,
            dailyLimit
        );

        vm.stopBroadcast();

        console.log("MerchantPool deployed at:", address(pool));
        console.log("Chain ID:", block.chainid);
        console.log("USDC:", usdc);
        console.log("Owner:", owner);
        console.log("Operator:", operator);
        console.log("Max per tx:", maxPerTx);
        console.log("Daily limit:", dailyLimit);
    }
}
