// ── Auto-Protocol Generator ─────────────────────────────────────
// Creates protocols automatically when orders are fulfilled or
// inventory movements occur. Links protocol items to client_inventory
// entries so the fridge view can display protocol context.

import { supabase } from '@/integrations/sb_client/client';
import { lookupKnowledge } from '@/data/protocol-knowledge';

interface AutoProtocolInput {
    contactId: string;
    orgId: string;
    items: Array<{ peptideId: string; peptideName: string }>;
}

interface AutoProtocolResult {
    protocolId: string;
    /** Maps peptideId → protocol_item.id */
    protocolItemMap: Map<string, string>;
    created: boolean; // false if existing protocol was reused
}

/**
 * Auto-generate a protocol for a contact based on their peptides.
 * Idempotent: if the contact already has a protocol containing all the
 * same peptides, returns the existing protocol's item map instead.
 */
export async function autoGenerateProtocol(input: AutoProtocolInput): Promise<AutoProtocolResult> {
    const { contactId, orgId, items } = input;
    if (items.length === 0) {
        throw new Error('Cannot create protocol with no items');
    }

    // ── Idempotency Check ───────────────────────────────────────
    // Look for an existing protocol for this contact that contains
    // all the same peptides (by peptide_id set equality).
    const { data: existing } = await supabase
        .from('protocols')
        .select('id, protocol_items(id, peptide_id)')
        .eq('contact_id', contactId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

    if (existing) {
        const inputPeptideIds = new Set(items.map(i => i.peptideId));
        for (const proto of existing) {
            const protoPeptideIds = new Set(
                (proto.protocol_items || []).map((pi: { peptide_id: string }) => pi.peptide_id)
            );
            // Check if this protocol contains ALL the input peptides
            const allPresent = [...inputPeptideIds].every(id => protoPeptideIds.has(id));
            if (allPresent && protoPeptideIds.size >= inputPeptideIds.size) {
                // Reuse existing protocol
                const itemMap = new Map<string, string>();
                for (const pi of (proto.protocol_items || []) as Array<{ id: string; peptide_id: string }>) {
                    itemMap.set(pi.peptide_id, pi.id);
                }
                return { protocolId: proto.id, protocolItemMap: itemMap, created: false };
            }
        }
    }

    // ── Create Protocol ─────────────────────────────────────────
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const { data: protocol, error: protoErr } = await supabase
        .from('protocols')
        .insert({
            name: `Protocol - ${today}`,
            description: `Auto-generated protocol for ${items.length} peptide${items.length > 1 ? 's' : ''}`,
            contact_id: contactId,
            org_id: orgId,
        })
        .select()
        .single();

    if (protoErr) throw protoErr;

    // ── Create Protocol Items ───────────────────────────────────
    const protocolItems = items.map(({ peptideId, peptideName }) => {
        const knowledge = lookupKnowledge(peptideName);
        // Use standard tier if available, otherwise defaults
        const standardTier = knowledge?.dosingTiers?.find(t => t.id === 'standard')
            ?? knowledge?.dosingTiers?.[0];

        return {
            protocol_id: protocol.id,
            peptide_id: peptideId,
            dosage_amount: standardTier?.doseAmount ?? knowledge?.defaultDoseAmount ?? 0,
            dosage_unit: standardTier?.doseUnit ?? knowledge?.defaultDoseUnit ?? 'mcg',
            frequency: standardTier?.frequency ?? knowledge?.defaultFrequency ?? 'daily',
            duration_weeks: 8,
            timing: standardTier?.timing ?? knowledge?.defaultTiming ?? 'none',
            notes: standardTier?.notes ?? null,
        };
    });

    const { data: insertedItems, error: itemsErr } = await supabase
        .from('protocol_items')
        .insert(protocolItems)
        .select('id, peptide_id');

    if (itemsErr) throw itemsErr;

    // Build the peptideId → protocolItemId map
    const protocolItemMap = new Map<string, string>();
    for (const pi of (insertedItems || [])) {
        protocolItemMap.set(pi.peptide_id, pi.id);
    }

    // ── Create Protocol Supplements ─────────────────────────────
    // Match knowledge base supplement names against the supplements table
    const allSupplementNames = new Set<string>();
    for (const { peptideName } of items) {
        const knowledge = lookupKnowledge(peptideName);
        if (knowledge?.supplementNotes) {
            for (const supp of knowledge.supplementNotes) {
                allSupplementNames.add(supp.name.toLowerCase());
            }
        }
    }

    if (allSupplementNames.size > 0) {
        // Fetch all supplements to match by name
        const { data: dbSupplements } = await supabase
            .from('supplements')
            .select('id, name');

        if (dbSupplements && dbSupplements.length > 0) {
            const nameToId = new Map<string, string>();
            for (const s of dbSupplements) {
                nameToId.set(s.name.toLowerCase(), s.id);
            }

            const supplementInserts: Array<{
                protocol_id: string;
                supplement_id: string;
                dosage: string;
                frequency: string;
                notes: string;
            }> = [];

            const seenSupplementIds = new Set<string>();
            for (const { peptideName } of items) {
                const knowledge = lookupKnowledge(peptideName);
                if (!knowledge?.supplementNotes) continue;
                for (const supp of knowledge.supplementNotes) {
                    const supplementId = nameToId.get(supp.name.toLowerCase());
                    if (supplementId && !seenSupplementIds.has(supplementId)) {
                        seenSupplementIds.add(supplementId);
                        supplementInserts.push({
                            protocol_id: protocol.id,
                            supplement_id: supplementId,
                            dosage: supp.dosage,
                            frequency: 'daily',
                            notes: supp.reason,
                        });
                    }
                }
            }

            if (supplementInserts.length > 0) {
                await supabase.from('protocol_supplements').insert(supplementInserts);
            }
        }
    }

    return { protocolId: protocol.id, protocolItemMap, created: true };
}
