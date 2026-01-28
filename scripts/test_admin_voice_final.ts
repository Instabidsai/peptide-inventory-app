import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

const requestId = '826bf329-8ca6-4ca3-8421-0ce3c25b7279'; // Existing Request ID

async function main() {
    console.log("Testing Admin Attachment Logic (Post-SQL)...");

    // Mock Upload
    const mockFile = Buffer.from("Voice Content");
    const fileName = `admin_voice_final_${Date.now()}.txt`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('messaging-attachments')
        .upload(`admin/${fileName}`, mockFile, { contentType: 'text/plain' });

    if (uploadError) console.error("Upload Error:", uploadError);
    else console.log("Upload Success");

    // Mock DB Update
    const { data: publicUrl } = supabase.storage.from('messaging-attachments').getPublicUrl(uploadData?.path || '');

    const adminAttachment = [{
        name: 'Voice Message Final',
        type: 'audio/webm',
        url: publicUrl.publicUrl
    }];

    const { error: dbError } = await supabase
        .from('client_requests')
        .update({
            admin_notes: 'Final Voice Test',
            admin_attachments: adminAttachment
        })
        .eq('id', requestId);

    if (dbError) {
        console.error("DB Update Failed:", dbError);
    } else {
        console.log("DB Update Success (Column Verified!)");
    }
}

main();
