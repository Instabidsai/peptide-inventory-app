
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyVisualizerData() {
    console.log("🔍 Verifying Hierarchy Data for Visualizer...");

    // 1. Get Admin (Root)
    const { data: admin } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
    if (!admin) { console.error("No admin found."); return; }

    // 2. Fetch Downline via RPC (Simulating Admin View)
    console.log("Fetching downline for Admin...");
    const { data: nodes, error } = await supabase.rpc('get_partner_downline', { root_id: admin.id });

    if (error) {
        console.error("RPC Error:", error);
        return;
    }

    console.log(`Found ${nodes.length} nodes in hierarchy.`);

    // 3. Verify Structure for Visualization
    // Visualizer expects: depth, path array
    let valid = true;
    nodes.forEach((node: any) => {
        console.log(`Node: ${node.full_name} (${node.partner_tier})`);
        console.log(`   - Depth: ${node.depth}`);
        console.log(`   - Path: [${node.path.join(', ')}]`);

        // Check if path ends with own ID
        if (node.path[node.path.length - 1] !== node.id) {
            console.error("   ❌ Path does not end with Own ID!");
            valid = false;
        }

        // Check depth consistency
        if (node.path.length !== node.depth) {
            // Note: RPC depth is 1-based relative to root? Or absolute? 
            // In our RPC: "depth" is iteration count. "path" is array of IDs.
            // Usually path length == depth (if root is depth 1).
            // Let's observe.
            // If verify_hierarchy previously showed:
            // Admin Downline Count: 2
            // - 1: Don
            // - 2: Justin
            // That means Don is Depth 1 relative to Admin?
            // Wait, get_partner_downline usually excludes the root if strict, or includes it?
            // Providing root_id usually fetches *descendants*.
            // Let's see the output.
        }
    });

    if (nodes.length === 0) {
        console.warn("⚠️  Hierarchy is empty? Did you run setup?");
    } else if (valid) {
        console.log("\n✅ Data structure appears valid for Visualizer tree generation.");
    }
}

verifyVisualizerData();
