
// Mock localStorage
(global as any).localStorage = {
    getItem: () => null,
    setItem: () => null,
    removeItem: () => null,
    clear: () => null,
    length: 0,
    key: () => null,
};

async function diagnose() {
    const { supabase } = await import('../src/integrations/sb_client/client');

    console.log("Checking movements for sales...");
    const { data: movements, error } = await supabase
        .from('movements')
        .select('id, contact_id, type, amount_paid, contacts(id, name)')
        .eq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching movements:", error);
    } else {
        console.log("\nRecent Sales Movements:");
        movements.forEach((m: any) => {
            console.log(`ID: ${m.id}, ContactID: ${m.contact_id}, ContactName: ${m.contacts?.name || 'MISSING'}, Amount: ${m.amount_paid}`);
        });
    }

    const { data: jordan } = await supabase
        .from('contacts')
        .select('id, name')
        .ilike('name', '%Jordan%');

    console.log("\nJordan Contacts:", jordan);
}

diagnose();
