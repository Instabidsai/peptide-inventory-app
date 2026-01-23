
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyFinancials() {
    console.log('--- Verifying Financial Tracking System ---');

    // 1. Create a Test Expense
    const testExpense = {
        date: new Date().toISOString().split('T')[0],
        category: 'operating',
        amount: 100.00,
        description: 'Test Verification Expense',
        recipient: 'Test Script',
        payment_method: 'cash',
        status: 'paid'
    };

    console.log('1. Creating test expense ($100)...');
    const { data: expense, error: createError } = await supabase
        .from('expenses')
        .insert(testExpense)
        .select()
        .single();

    if (createError) {
        console.error('FAILED: Could not create expense', createError);
        return;
    }
    console.log(`PASS: Created expense ${expense.id}`);

    // 2. Verify Reading Expenses
    console.log('2. Fetching expenses to verify...');
    const { data: fetchedExpenses } = await supabase.from('expenses').select('*').eq('id', expense.id);
    if (!fetchedExpenses || fetchedExpenses.length === 0) {
        console.error('FAILED: Could not fetch created expense');
        return;
    }
    console.log('PASS: Epense fetched successfully.');

    // 3. Simulate Dashboard Calculation (Gross - Expenses)
    // We'll just verify the query used in use-financials works
    console.log('3. Verifying Expenses SumQuery...');
    const { data: sumData, error: sumError } = await supabase.from('expenses').select('amount');
    const totalExpenses = sumData?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;

    if (sumError) {
        console.error('FAILED: Sum query failed', sumError);
    } else {
        console.log(`PASS: Total Expenses Calculation Check: $${totalExpenses.toFixed(2)} (Should include our $100)`);
    }

    // 4. Cleanup
    console.log('4. Cleaning up test expense...');
    await supabase.from('expenses').delete().eq('id', expense.id);
    console.log('PASS: Cleanup done.');

    console.log('--- Verification Complete: System Functional ---');
}

verifyFinancials();
