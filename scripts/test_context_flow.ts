import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, serviceKey);

async function testSmartContext() {
    console.log("1. Setup: Get a User");
    const { data: users } = await supabase.from('client_requests').select('user_id, org_id').limit(1);
    if (!users || users.length === 0) {
        console.error("No users found.");
        return;
    }
    const userId = users[0].user_id;

    console.log(`Testing with User: ${userId}`);

    // Context Data
    const mockContext = {
        type: 'regimen',
        id: '12345678-1234-1234-1234-123456789012' // Fake UUID
    };

    console.log("2. Create Context-Aware Request");
    const { data: request, error } = await supabase.from('client_requests').insert({
        user_id: userId,
        org_id: users[0].org_id,
        type: 'regimen_help',
        subject: 'Question about my Regimen',
        message: 'This is a test verifying context columns.',
        status: 'pending',
        context_type: mockContext.type,
        context_id: mockContext.id
    }).select().single();

    if (error) {
        console.error("❌ Insert Failed:", error);
        return;
    }

    console.log("✅ Request Created:", request.id);

    console.log("3. Verify Context Columns");
    if (request.context_type === mockContext.type && request.context_id === mockContext.id) {
        console.log(`✅ SUCCESS: Context saved correctly (${request.context_type}: ${request.context_id})`);
    } else {
        console.log(`❌ FAIL: Context mismatch. Got ${request.context_type}`);
    }

    // Cleanup
    await supabase.from('client_requests').delete().eq('id', request.id);
    console.log("4. Cleaned up test record.");
}

testSmartContext();
