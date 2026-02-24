import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

interface OrderItem {
    peptide_id: string;
    quantity: number;
    unit_price: number;
}

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const json = (body: object, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

        // Auth: verify caller
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Unauthorized');

        const supabase = createClient(sbUrl, sbServiceKey);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized: invalid token');

        // Get caller's org + role
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role, org_id')
            .eq('user_id', user.id)
            .single();

        if (!callerRole?.org_id) throw new Error('No organization found');
        if (!['admin', 'staff'].includes(callerRole.role)) {
            throw new Error('Only admin or staff can place supplier orders');
        }

        const merchantOrgId = callerRole.org_id;

        // Check merchant has a supplier configured
        const { data: config } = await supabase
            .from('tenant_config')
            .select('supplier_org_id, wholesale_tier_id')
            .eq('org_id', merchantOrgId)
            .single();

        if (!config?.supplier_org_id) {
            throw new Error('No supplier connected to your organization');
        }

        // Get wholesale tier for validation
        let markupAmount = 0;
        if (config.wholesale_tier_id) {
            const { data: tier } = await supabase
                .from('wholesale_pricing_tiers')
                .select('markup_amount')
                .eq('id', config.wholesale_tier_id)
                .single();
            if (tier) markupAmount = tier.markup_amount;
        }

        const body: { items: OrderItem[] } = await req.json();
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
            throw new Error('At least one item is required');
        }

        // Validate items: all peptides must belong to merchant's catalog
        const peptideIds = body.items.map(i => i.peptide_id);
        const { data: validPeptides } = await supabase
            .from('peptides')
            .select('id, name, retail_price, base_cost')
            .eq('org_id', merchantOrgId)
            .in('id', peptideIds);

        if (!validPeptides || validPeptides.length !== peptideIds.length) {
            throw new Error('Some products are not in your catalog');
        }

        // Build lookup for server-side price enforcement
        const peptideLookup = new Map(validPeptides.map(p => [p.id, p]));

        // Validate quantities and enforce server-side pricing
        const pricedItems: typeof body.items = [];
        for (const item of body.items) {
            if (!item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity)) {
                throw new Error('Invalid quantity');
            }
            const peptide = peptideLookup.get(item.peptide_id);
            if (!peptide?.base_cost || peptide.base_cost <= 0) {
                throw new Error(`Product "${peptide?.name || item.peptide_id}" has no base cost set`);
            }
            // Server-calculated wholesale price — ignore client-sent unit_price
            const serverPrice = +(peptide.base_cost + markupAmount).toFixed(2);
            pricedItems.push({ ...item, unit_price: serverPrice });
        }

        // Calculate total using server-enforced prices
        const totalAmount = pricedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);

        // Create the supplier order — use a dummy client_id (the merchant admin user)
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .insert({
                org_id: config.supplier_org_id,  // Order belongs to supplier's org
                client_id: user.id,              // Merchant admin as the "client"
                rep_id: null,
                status: 'submitted',
                total_amount: totalAmount,
                commission_amount: 0,
                payment_status: 'unpaid',
                amount_paid: 0,
                notes: `Wholesale order from merchant org ${merchantOrgId}`,
                is_supplier_order: true,
                source_org_id: merchantOrgId,
                fulfillment_type: 'standard',
            })
            .select()
            .single();

        if (orderError) throw new Error(`Order creation failed: ${orderError.message}`);

        // Insert line items (using server-enforced prices)
        const lineItems = pricedItems.map(item => ({
            sales_order_id: order.id,
            peptide_id: item.peptide_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: +(item.unit_price * item.quantity).toFixed(2),
        }));

        const { error: itemsError } = await supabase
            .from('sales_order_items')
            .insert(lineItems);

        if (itemsError) {
            // Roll back the order — can't have an order without items
            await supabase.from('sales_orders').delete().eq('id', order.id);
            throw new Error(`Line items creation failed: ${itemsError.message}`);
        }

        return json({
            success: true,
            order_id: order.id,
            total_amount: totalAmount,
            item_count: pricedItems.length,
        });

    } catch (error: any) {
        console.error('create-supplier-order error:', error.message);
        return json(
            { success: false, error: error.message },
            error.message.includes('Unauthorized') ? 403 : 400,
        );
    }
});
