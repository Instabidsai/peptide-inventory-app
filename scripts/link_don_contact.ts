import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function linkDonContact() {
    console.log('Searching for contact named "Don"...');

    // 1. Find the Contact
    const { data: contacts, error: searchError } = await supabase
        .from('contacts')
        .select('*')
        .ilike('name', 'Don%');

    if (searchError) {
        console.error('Search error:', searchError);
        return;
    }

    if (!contacts || contacts.length === 0) {
        console.error('No contact found matching "Don"');
        return;
    }

    console.log(`Found ${contacts.length} contact(s):`);
    contacts.forEach(c => console.log(` - [${c.id}] ${c.name} (Email: ${c.email || 'N/A'}) (Linked: ${c.linked_user_id || 'No'})`));

    // Assuming we pick the one without an email or specifically named "Don"
    const targetContact = contacts.find(c => c.name === 'Don') || contacts[0];
    const userId = '36958287-ccb2-4ba0-922d-f8ecb9ae4043';
    const email = 'Dzlby111@yahoo.com';

    console.log(`\nLinking Contact [${targetContact.id}] to User [${userId}]...`);

    const { error: updateError } = await supabase
        .from('contacts')
        .update({
            email: email,
            linked_user_id: userId
        })
        .eq('id', targetContact.id);

    if (updateError) {
        console.error('Update failed:', updateError);
    } else {
        console.log('✅ Contact linked successfully!');
        console.log(`Updated Email: ${email}`);
        console.log(`Linked User ID: ${userId}`);
    }
}

linkDonContact();
