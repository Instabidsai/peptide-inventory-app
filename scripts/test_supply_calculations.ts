/**
 * Test script for supply calculation logic
 * Run with: npx tsx scripts/test_supply_calculations.ts
 */

import { calculateSupply, getSupplyStatusColor, getSupplyStatusLabel } from '../src/lib/supply-calculations';

console.log('🧪 Testing Supply Calculation Logic\n');
console.log('='.repeat(60));

// Test Case 1: Normal daily dosage
console.log('\n📋 Test 1: Normal Daily Dosage (5mg daily)');
const test1 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
    [
        { id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 100, initial_quantity_mg: 100 },
        { id: '2', uid: 'TEST-002', batch_number: 'B002', current_quantity_mg: 50, initial_quantity_mg: 100 }
    ]
);
console.log(`  Total Supply: ${test1.totalSupplyMg}mg`);
console.log(`  Daily Usage: ${test1.dailyUsageMg}mg`);
console.log(`  Days Remaining: ${test1.daysRemaining} days`);
console.log(`  Status: ${test1.status}`);
console.log(`  Badge: ${getSupplyStatusColor(test1.status)} - ${getSupplyStatusLabel(test1.daysRemaining)}`);
console.log(`  Expected: 30 days (150mg / 5mg/day)`);
console.log(`  ✅ ${test1.daysRemaining === 30 ? 'PASS' : 'FAIL'}`);

// Test Case 2: Edge Case - Zero Dosage (should not crash)
console.log('\n📋 Test 2: Zero Dosage (should not crash)');
const test2 = calculateSupply(
    { dosage: 0, dosage_unit: 'mg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 100, initial_quantity_mg: 100 }]
);
console.log(`  Total Supply: ${test2.totalSupplyMg}mg`);
console.log(`  Daily Usage: ${test2.dailyUsageMg}mg`);
console.log(`  Days Remaining: ${test2.daysRemaining} days`);
console.log(`  Status: ${test2.status}`);
console.log(`  Expected: 0 days (division by zero handled)`);
console.log(`  ✅ ${test2.daysRemaining === 0 && test2.status === 'depleted' ? 'PASS' : 'FAIL'}`);

// Test Case 3: mcg to mg conversion
console.log('\n📋 Test 3: mcg to mg Conversion (250mcg daily)');
const test3 = calculateSupply(
    { dosage: 250, dosage_unit: 'mcg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 10, initial_quantity_mg: 10 }]
);
console.log(`  Total Supply: ${test3.totalSupplyMg}mg`);
console.log(`  Daily Usage: ${test3.dailyUsageMg}mg (converted from mcg)`);
console.log(`  Days Remaining: ${test3.daysRemaining} days`);
console.log(`  Expected: 40 days (10mg / 0.25mg/day)`);
console.log(`  ✅ ${test3.daysRemaining === 40 ? 'PASS' : 'FAIL'}`);

// Test Case 4: Weekly frequency
console.log('\n📋 Test 4: Weekly Frequency (10mg weekly)');
const test4 = calculateSupply(
    { dosage: 10, dosage_unit: 'mg', frequency: 'weekly' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 100, initial_quantity_mg: 100 }]
);
console.log(`  Total Supply: ${test4.totalSupplyMg}mg`);
console.log(`  Daily Usage: ${test4.dailyUsageMg.toFixed(2)}mg (10mg/7 days)`);
console.log(`  Days Remaining: ${test4.daysRemaining} days`);
console.log(`  Expected: 70 days (100mg / ~1.43mg/day)`);
console.log(`  ✅ ${test4.daysRemaining === 70 ? 'PASS' : 'FAIL'}`);

// Test Case 5: BID (twice daily)
console.log('\n📋 Test 5: BID Frequency (5mg bid)');
const test5 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'bid' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 100, initial_quantity_mg: 100 }]
);
console.log(`  Total Supply: ${test5.totalSupplyMg}mg`);
console.log(`  Daily Usage: ${test5.dailyUsageMg}mg (5mg x 2)`);
console.log(`  Days Remaining: ${test5.daysRemaining} days`);
console.log(`  Expected: 10 days (100mg / 10mg/day)`);
console.log(`  ✅ ${test5.daysRemaining === 10 ? 'PASS' : 'FAIL'}`);

// Test Case 6: Null quantity handling
console.log('\n📋 Test 6: Null Quantity (should use initial_quantity_mg)');
const test6 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: null, initial_quantity_mg: 100 }]
);
console.log(`  Total Supply: ${test6.totalSupplyMg}mg`);
console.log(`  Days Remaining: ${test6.daysRemaining} days`);
console.log(`  Expected: 20 days (100mg / 5mg/day)`);
console.log(`  ✅ ${test6.daysRemaining === 20 ? 'PASS' : 'FAIL'}`);

// Test Case 7: Usage percentage calculation
console.log('\n📋 Test 7: Usage Percentage Calculation');
const test7 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 50, initial_quantity_mg: 100 }]
);
console.log(`  Bottle Initial: 100mg`);
console.log(`  Bottle Current: 50mg`);
console.log(`  Usage Percent: ${test7.bottles[0].usagePercent.toFixed(1)}%`);
console.log(`  Expected: 50% used`);
console.log(`  ✅ ${Math.abs(test7.bottles[0].usagePercent - 50) < 0.1 ? 'PASS' : 'FAIL'}`);

// Test Case 8: Low stock alert
console.log('\n📋 Test 8: Low Stock Status (< 7 days)');
const test8 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 25, initial_quantity_mg: 100 }]
);
console.log(`  Days Remaining: ${test8.daysRemaining} days`);
console.log(`  Status: ${test8.status}`);
console.log(`  Badge Color: ${getSupplyStatusColor(test8.status)}`);
console.log(`  Expected: 'low' status (5 days remaining)`);
console.log(`  ✅ ${test8.status === 'low' && test8.daysRemaining === 5 ? 'PASS' : 'FAIL'}`);

// Test Case 9: Critical stock alert
console.log('\n📋 Test 9: Critical Stock Status (< 3 days)');
const test9 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 10, initial_quantity_mg: 100 }]
);
console.log(`  Days Remaining: ${test9.daysRemaining} days`);
console.log(`  Status: ${test9.status}`);
console.log(`  Expected: 'critical' status (2 days remaining)`);
console.log(`  ✅ ${test9.status === 'critical' && test9.daysRemaining === 2 ? 'PASS' : 'FAIL'}`);

// Test Case 10: Depleted status
console.log('\n📋 Test 10: Depleted Status (0mg remaining)');
const test10 = calculateSupply(
    { dosage: 5, dosage_unit: 'mg', frequency: 'daily' },
    [{ id: '1', uid: 'TEST-001', batch_number: 'B001', current_quantity_mg: 0, initial_quantity_mg: 100 }]
);
console.log(`  Days Remaining: ${test10.daysRemaining} days`);
console.log(`  Status: ${test10.status}`);
console.log(`  Expected: 'depleted' status`);
console.log(`  ✅ ${test10.status === 'depleted' && test10.daysRemaining === 0 ? 'PASS' : 'FAIL'}`);

console.log('\n' + '='.repeat(60));
console.log('✅ All tests completed! Check output above for results.');
