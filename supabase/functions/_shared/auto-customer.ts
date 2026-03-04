/**
 * Auto-Customer Creation + Welcome Email
 *
 * Called by platform-order-sync after external orders (Shopify/WooCommerce)
 * to automatically create a customer account + portal invite link.
 *
 * Flow: contact (with email) → auth user → profile → user_roles → invite link
 */

export interface AutoCustomerResult {
    userId: string;
    inviteLink: string;
    alreadyLinked: boolean;
}

/**
 * Auto-create a customer account from a contact with an email.
 * Idempotent: if contact already has linked_user_id, returns early.
 */
export async function autoCreateCustomer(
    supabase: any,
    orgId: string,
    contactId: string,
    email: string,
    name?: string,
): Promise<AutoCustomerResult> {
    // 1. Check if contact already has a linked user
    const { data: contact } = await supabase
        .from("contacts")
        .select("id, linked_user_id, invite_link, name")
        .eq("id", contactId)
        .eq("org_id", orgId)
        .single();

    if (!contact) {
        throw new Error(`Contact ${contactId} not found in org ${orgId}`);
    }

    if (contact.linked_user_id) {
        return {
            userId: contact.linked_user_id,
            inviteLink: contact.invite_link || "",
            alreadyLinked: true,
        };
    }

    const displayName = name || contact.name || email.split("@")[0];

    // 2. Create auth user (or find existing)
    let userId: string;

    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: true,
        user_metadata: { role: "customer", full_name: displayName },
    });

    if (createData?.user) {
        userId = createData.user.id;
    } else if (createError?.message?.includes("already registered")) {
        // User exists — look up their ID
        const { data: existingProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", email.toLowerCase())
            .limit(1)
            .maybeSingle();

        if (existingProfile?.user_id) {
            userId = existingProfile.user_id;
        } else {
            // Fallback: search auth users
            const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
            const found = userList?.users?.find(
                (u: any) => u.email?.toLowerCase() === email.toLowerCase()
            );
            if (!found) throw new Error(`User exists but couldn't find ID for ${email}`);
            userId = found.id;
        }
    } else if (createError) {
        throw new Error(`Failed to create user: ${createError.message}`);
    } else {
        throw new Error("createUser returned no data and no error");
    }

    // 3. Upsert profile (role: customer)
    const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
            {
                user_id: userId,
                full_name: displayName,
                email: email.toLowerCase(),
                role: "customer",
                org_id: orgId,
            },
            { onConflict: "user_id" }
        );

    if (profileError) {
        console.warn("[auto-customer] Profile upsert warning:", profileError.message);
    }

    // 4. Upsert user_roles
    const { error: roleError } = await supabase
        .from("user_roles")
        .upsert(
            {
                user_id: userId,
                org_id: orgId,
                role: "customer",
            },
            { onConflict: "user_id,org_id" }
        );

    if (roleError) {
        console.warn("[auto-customer] user_roles upsert warning:", roleError.message);
    }

    // 5. Link contact + generate claim_token + invite_link
    const claimToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const baseUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://app.thepeptideai.com";
    const inviteLink = `${baseUrl}/#/join?token=${claimToken}`;

    const { error: linkError } = await supabase
        .from("contacts")
        .update({
            linked_user_id: userId,
            type: "client",
            claim_token: claimToken,
            claim_token_expires_at: expiresAt,
            invite_link: inviteLink,
        })
        .eq("id", contactId)
        .eq("org_id", orgId);

    if (linkError) {
        console.error("[auto-customer] Contact link error:", linkError.message);
        throw new Error(`Failed to link contact: ${linkError.message}`);
    }

    console.log(`[auto-customer] Created customer ${email} (${userId}) → contact ${contactId} in org ${orgId}`);

    return { userId, inviteLink, alreadyLinked: false };
}

/**
 * Server-side auto-protocol generation for edge functions.
 * Simplified version of src/lib/auto-protocol.ts that takes a supabase client param.
 */
export async function serverAutoGenerateProtocol(
    supabase: any,
    contactId: string,
    orgId: string,
    items: Array<{ peptide_id: string; peptide_name: string }>,
): Promise<{ protocolId: string; protocolItemMap: Map<string, string> }> {
    if (items.length === 0) {
        throw new Error("Cannot create protocol with no items");
    }

    // Check for existing protocol that covers these peptides (idempotent)
    const { data: existing } = await supabase
        .from("protocols")
        .select("id, protocol_items(id, peptide_id)")
        .eq("contact_id", contactId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

    if (existing) {
        const inputPeptideIds = new Set(items.map((i) => i.peptide_id));
        for (const proto of existing) {
            const protoPeptideIds = new Set(
                (proto.protocol_items || []).map((pi: any) => pi.peptide_id)
            );
            const allPresent = [...inputPeptideIds].every((id) => protoPeptideIds.has(id));
            if (allPresent && protoPeptideIds.size >= inputPeptideIds.size) {
                const itemMap = new Map<string, string>();
                for (const pi of proto.protocol_items || []) {
                    itemMap.set(pi.peptide_id, pi.id);
                }
                return { protocolId: proto.id, protocolItemMap: itemMap };
            }
        }
    }

    // Fetch protocol knowledge from DB (same as fetchProtocolKnowledgeMap)
    const knowledgeMap: Record<string, any> = {};
    try {
        const { data: knowledgeRows } = await supabase
            .from("protocol_knowledge")
            .select("*")
            .eq("organization_id", orgId)
            .eq("is_active", true);

        if (knowledgeRows && knowledgeRows.length > 0) {
            for (const row of knowledgeRows) {
                knowledgeMap[row.product_id] = {
                    dosingTiers: row.dosing_tiers || [],
                    defaultDoseAmount: row.dosing_tiers?.[0]?.doseAmount ?? 0,
                    defaultDoseUnit: row.dosing_tiers?.[0]?.doseUnit ?? "mcg",
                    defaultFrequency: row.dosing_tiers?.[0]?.frequency ?? "daily",
                    defaultTiming: row.dosing_tiers?.[0]?.timing ?? "none",
                };
            }
        }
    } catch (e) {
        console.warn("[auto-customer] Protocol knowledge fetch failed (using defaults):", e);
    }

    // Simple name-based knowledge lookup
    const lookupKnowledge = (peptideName: string) => {
        const normalize = (s: string) =>
            s.replace(/\s*\d+\s*mg\s*$/i, "").replace(/[-\s]+/g, "").toLowerCase().trim();
        const input = normalize(peptideName);
        for (const [key, value] of Object.entries(knowledgeMap)) {
            if (normalize(key) === input) return value;
        }
        return null;
    };

    // Create protocol
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const { data: protocol, error: protoErr } = await supabase
        .from("protocols")
        .insert({
            name: `Protocol - ${today}`,
            description: `Auto-generated protocol for ${items.length} peptide${items.length > 1 ? "s" : ""}`,
            contact_id: contactId,
            org_id: orgId,
        })
        .select()
        .maybeSingle();

    if (protoErr) throw protoErr;
    if (!protocol) throw new Error("Protocol creation returned no data");

    // Create protocol items
    const protocolItems = items.map(({ peptide_id, peptide_name }) => {
        const knowledge = lookupKnowledge(peptide_name);
        const standardTier = knowledge?.dosingTiers?.find((t: any) => t.id === "standard")
            ?? knowledge?.dosingTiers?.[0];

        return {
            protocol_id: protocol.id,
            peptide_id,
            dosage_amount: standardTier?.doseAmount ?? knowledge?.defaultDoseAmount ?? 0,
            dosage_unit: standardTier?.doseUnit ?? knowledge?.defaultDoseUnit ?? "mcg",
            frequency: standardTier?.frequency ?? knowledge?.defaultFrequency ?? "daily",
            duration_weeks: 8,
            notes: standardTier?.notes
                ? `${standardTier.notes} | Timing: ${standardTier?.timing ?? "none"}`
                : `Timing: ${standardTier?.timing ?? knowledge?.defaultTiming ?? "none"}`,
        };
    });

    const { data: insertedItems, error: itemsErr } = await supabase
        .from("protocol_items")
        .insert(protocolItems)
        .select("id, peptide_id");

    if (itemsErr) throw itemsErr;

    const protocolItemMap = new Map<string, string>();
    for (const pi of insertedItems || []) {
        protocolItemMap.set(pi.peptide_id, pi.id);
    }

    console.log(`[auto-customer] Created protocol ${protocol.id} with ${insertedItems?.length || 0} items for contact ${contactId}`);

    return { protocolId: protocol.id, protocolItemMap };
}

/**
 * Build branded welcome email HTML for new customers.
 * Follows the same pattern as check-low-supply buildEmailHtml.
 */
export function buildWelcomeEmailHtml(
    brandName: string,
    inviteLink: string,
    customerName?: string,
): string {
    const greeting = customerName ? `Hi ${customerName},` : "Welcome!";

    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #7c3aed;">${brandName}</h2>
  </div>
  <p style="font-size: 16px; line-height: 1.6;">
    ${greeting}
  </p>
  <p style="font-size: 16px; line-height: 1.6;">
    Your personalized peptide regimen portal is ready. Track your doses, view your protocol calendar, monitor supply levels, and reorder when you're running low — all in one place.
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
      Access Your Portal
    </a>
  </div>
  <div style="background: #f3f0ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="font-size: 14px; color: #555; margin: 0 0 8px 0; font-weight: 600;">What you can do:</p>
    <ul style="font-size: 14px; color: #555; margin: 0; padding-left: 20px; line-height: 1.8;">
      <li>View your dosing calendar & protocol</li>
      <li>Track daily doses with one tap</li>
      <li>Monitor your supply levels</li>
      <li>Reorder when running low</li>
    </ul>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">
    This link expires in 7 days. If you need a new link, contact your provider.
  </p>
</body>
</html>`.trim();
}
