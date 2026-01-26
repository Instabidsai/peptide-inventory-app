
// Mock localStorage
(global as any).localStorage = {
    getItem: () => null,
    setItem: () => null,
    removeItem: () => null,
    clear: () => null,
    length: 0,
    key: () => null,
};

async function checkColumns() {
    try {
        const { supabase } = await import('../src/integrations/sb_client/client');

        console.log("Checking columns on related tables...");

        // Try to select sales_order_id from movements
        const { error: mError } = await supabase.from('movements').select('sales_order_id').limit(1);
        if (!mError) console.log("Movements table HAS sales_order_id column.");
        else console.log("Movements table check result:", mError.code === '42703' ? "Column missing" : mError.message);

        // Try to select sales_order_id from commissions
        const { error: cError } = await supabase.from('commissions').select('sales_order_id').limit(1);
        if (!cError) console.log("Commissions table HAS sales_order_id column.");
        else console.log("Commissions table check result:", cError.code === '42703' ? "Column missing" : cError.message);

    } catch (e) {
        console.error("Script failed:", e);
    }
}

checkColumns();
