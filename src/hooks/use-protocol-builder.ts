import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePeptides, type Peptide } from '@/hooks/use-peptides';
import { lookupKnowledge, PROTOCOL_TEMPLATES } from '@/data/protocol-knowledge';
import {
    type EnrichedProtocolItem,
    type IncludeSections,
    generateProtocolHtml,
    generateProtocolPlainText,
} from '@/lib/protocol-html-generator';
import { toast } from 'sonner';
import { useTenantConfig } from '@/hooks/use-tenant-config';

// ── Hook ───────────────────────────────────────────────────────

export function useProtocolBuilder() {
    const { profile, organization } = useAuth();
    const { data: peptides } = usePeptides();
    const [searchParams] = useSearchParams();

    // State
    const [selectedContactId, setSelectedContactId] = useState('');
    const [items, setItems] = useState<EnrichedProtocolItem[]>([]);
    const [initialized, setInitialized] = useState(false);
    const [includeSupplies, setIncludeSupplies] = useState(true);
    const [protocolName, setProtocolName] = useState('');

    // Contacts list (sales_rep sees only their assigned clients)
    const isSalesRep = profile?.role === 'sales_rep';
    const { data: contacts } = useQuery({
        queryKey: ['contacts-list', profile?.org_id, isSalesRep ? profile?.id : 'all'],
        queryFn: async () => {
            let query = supabase
                .from('contacts')
                .select('id, name, email')
                .eq('org_id', profile!.org_id!)
                .eq('type', 'customer')
                .order('name');
            if (isSalesRep && profile?.id) {
                query = query.eq('assigned_rep_id', profile.id);
            }
            const { data } = await query;
            return data || [];
        },
        enabled: !!profile?.org_id,
    });

    // Saved protocols (for "Load Saved" dropdown)
    const queryClient = useQueryClient();
    const { data: savedProtocols } = useQuery({
        queryKey: ['saved-protocols-list', profile?.org_id],
        queryFn: async () => {
            const { data } = await supabase
                .from('protocols')
                .select('id, name, created_at, contact_id, protocol_items(count)')
                .eq('org_id', profile!.org_id!)
                .order('created_at', { ascending: false })
                .limit(20);
            return (data || []).map(p => ({
                id: p.id,
                name: p.name,
                createdAt: p.created_at,
                contactId: p.contact_id,
                itemCount: (p.protocol_items as { count: number }[] | null)?.[0]?.count ?? 0,
            }));
        },
        enabled: !!profile?.org_id,
    });

    const selectedContact = contacts?.find(c => c.id === selectedContactId);
    const clientName = selectedContact?.name?.split(' ')[0] || '';
    const clientFullName = selectedContact?.name || '';
    const clientEmail = selectedContact?.email || '';
    const { admin_brand_name } = useTenantConfig();
    const orgName = organization?.name || admin_brand_name;

    // ── Enrichment: peptide → EnrichedProtocolItem ─────────────

    const enrichPeptide = useCallback((peptide: Peptide, preferredTierId?: string): EnrichedProtocolItem => {
        const knowledge = lookupKnowledge(peptide.name);
        const tiers = knowledge?.dosingTiers ?? [];

        // Extract vial size from product name (e.g., "BPC-157 20mg" → 20)
        // Prefer name-extracted size over knowledge default (product name reflects actual vial)
        const nameMgMatch = peptide.name.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
        const nameVialMg = nameMgMatch ? parseFloat(nameMgMatch[1]) : null;
        const vialSizeMg = nameVialMg ?? knowledge?.vialSizeMg ?? null;

        // Scale water proportionally when product vial differs from knowledge default
        // e.g., knowledge says 20mg/2mL but product is 10mg → scale to 1mL (same concentration)
        const knowledgeRecon = knowledge?.reconstitutionMl ?? 2;
        const reconMl = (nameVialMg && knowledge && knowledge.vialSizeMg > 0 && nameVialMg !== knowledge.vialSizeMg)
            ? Math.round(knowledgeRecon * (nameVialMg / knowledge.vialSizeMg) * 10) / 10
            : knowledgeRecon;
        const concentrationMgMl = vialSizeMg != null && vialSizeMg > 0 && reconMl > 0
            ? vialSizeMg / reconMl
            : (peptide.default_concentration_mg_ml || 0);

        // Select tier: preferred > 'standard' > first available > null
        const tier = tiers.find(t => t.id === preferredTierId)
            ?? tiers.find(t => t.id === 'standard')
            ?? (tiers.length > 0 ? tiers[0] : null);

        return {
            instanceId: crypto.randomUUID(),
            peptideId: peptide.id,
            peptideName: peptide.name,
            vialSizeMg,
            protocolDescription: knowledge?.description ?? peptide.description ?? null,
            reconstitutionMl: knowledge?.reconstitutionMl ?? 2,
            doseAmount: tier?.doseAmount ?? knowledge?.defaultDoseAmount ?? peptide.default_dose_amount ?? 0,
            doseUnit: tier?.doseUnit ?? knowledge?.defaultDoseUnit ?? peptide.default_dose_unit ?? 'mcg',
            administrationRoute: knowledge?.administrationRoute ?? 'subcutaneous',
            frequency: tier?.frequency ?? knowledge?.defaultFrequency ?? peptide.default_frequency ?? 'daily',
            timing: tier?.timing ?? knowledge?.defaultTiming ?? peptide.default_timing ?? 'none',
            concentrationMgMl,
            warningText: knowledge?.warningText ?? null,
            cyclePattern: tier?.cyclePattern ?? knowledge?.cyclePattern ?? null,
            cyclePatternOptions: tier?.cyclePatternOptions ?? knowledge?.cyclePatternOptions ?? [],
            stackLabel: knowledge?.stackLabel ?? null,
            dosageSchedule: tier?.dosageSchedule ?? knowledge?.dosageSchedule ?? null,
            category: knowledge?.category ?? undefined,
            notes: '',
            supplements: knowledge?.supplementNotes ?? [],
            selectedTierId: tier?.id ?? null,
            availableTiers: tiers,
            includeSections: {
                description: true,
                reconstitution: true,
                warning: true,
                cyclePattern: true,
                tierNotes: true,
                supplements: true,
                dosageSchedule: true,
            },
        };
    }, []);

    // ── Actions ────────────────────────────────────────────────

    const addPeptide = useCallback((peptide: Peptide) => {
        setItems(prev => [...prev, enrichPeptide(peptide)]);
    }, [enrichPeptide]);

    const addPeptideByName = useCallback((name: string) => {
        if (!peptides) return;
        const peptide = peptides.find(p =>
            p.name.toLowerCase() === name.toLowerCase() ||
            p.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(p.name.toLowerCase())
        );
        if (peptide) addPeptide(peptide);
    }, [peptides, addPeptide]);

    const removeItem = useCallback((idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    }, []);

    const updateItem = useCallback((idx: number, field: keyof EnrichedProtocolItem, value: string | number | null) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const updated = { ...item, [field]: value };
            // Always recalculate concentration when vial size or water changes
            if (field === 'reconstitutionMl' || field === 'vialSizeMg') {
                const vial = updated.vialSizeMg;
                const water = updated.reconstitutionMl;
                if (vial != null && vial > 0 && water != null && water > 0) {
                    updated.concentrationMgMl = vial / water;
                }
            }
            return updated;
        }));
    }, []);

    const clearAll = useCallback(() => {
        setItems([]);
    }, []);

    const selectTier = useCallback((idx: number, tierId: string) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const tier = item.availableTiers.find(t => t.id === tierId);
            if (!tier) return item;
            const updated = {
                ...item,
                selectedTierId: tier.id,
                doseAmount: tier.doseAmount,
                doseUnit: tier.doseUnit,
                frequency: tier.frequency,
                timing: tier.timing,
                dosageSchedule: tier.dosageSchedule ?? item.dosageSchedule,
                cyclePattern: tier.cyclePattern ?? item.cyclePattern,
                cyclePatternOptions: tier.cyclePatternOptions ?? item.cyclePatternOptions,
            };
            // Recalculate concentration
            if (updated.vialSizeMg != null && updated.vialSizeMg > 0 && updated.reconstitutionMl > 0) {
                updated.concentrationMgMl = updated.vialSizeMg / updated.reconstitutionMl;
            }
            return updated;
        }));
    }, []);

    const toggleSection = useCallback((idx: number, section: keyof IncludeSections) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            return {
                ...item,
                includeSections: {
                    ...item.includeSections,
                    [section]: !item.includeSections[section],
                },
            };
        }));
    }, []);

    const moveItem = useCallback((fromIdx: number, toIdx: number) => {
        setItems(prev => {
            const next = [...prev];
            const [item] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, item);
            return next;
        });
    }, []);

    // ── Template Loading ───────────────────────────────────────

    const loadTemplate = useCallback((templateName: string) => {
        if (!peptides) return;
        const template = PROTOCOL_TEMPLATES.find(t => t.name === templateName);
        if (!template) return;

        const newItems: EnrichedProtocolItem[] = [];
        for (const name of template.peptideNames) {
            const peptide = peptides.find(p =>
                p.name.toLowerCase() === name.toLowerCase() ||
                p.name.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(p.name.toLowerCase())
            );
            if (peptide) {
                newItems.push(enrichPeptide(peptide, template.defaultTierId));
            }
        }
        setItems(newItems);
    }, [peptides, enrichPeptide]);

    // ── Order Loading ──────────────────────────────────────────

    const loadFromOrder = useCallback(async (orderId: string) => {
        if (!peptides) return;

        const { data: orderItems, error } = await supabase
            .from('sales_order_items')
            .select('peptide_id, quantity')
            .eq('sales_order_id', orderId);

        if (error) {
            toast.error('Failed to load order items');
            return;
        }

        const newItems: EnrichedProtocolItem[] = [];
        for (const oi of (orderItems || [])) {
            const peptide = peptides.find(p => p.id === oi.peptide_id);
            if (peptide) {
                newItems.push(enrichPeptide(peptide));
            }
        }
        setItems(newItems);
    }, [peptides, enrichPeptide]);

    const loadFromOrders = useCallback(async (orderIds: string[]) => {
        if (!peptides || orderIds.length === 0) return;

        const { data: orderItems, error } = await supabase
            .from('sales_order_items')
            .select('peptide_id, quantity')
            .in('sales_order_id', orderIds);

        if (error) {
            toast.error('Failed to load order items');
            return;
        }

        // Deduplicate by peptide_id
        const seen = new Set<string>();
        const newItems: EnrichedProtocolItem[] = [];
        for (const oi of (orderItems || [])) {
            if (seen.has(oi.peptide_id)) continue;
            seen.add(oi.peptide_id);
            const peptide = peptides.find(p => p.id === oi.peptide_id);
            if (peptide) {
                newItems.push(enrichPeptide(peptide));
            }
        }
        setItems(newItems);
    }, [peptides, enrichPeptide]);

    // ── Saved Protocol Loading ───────────────────────────────────

    const loadSavedProtocol = useCallback(async (protocolId: string) => {
        if (!peptides) return;

        const { data: protocol, error: pErr } = await supabase
            .from('protocols')
            .select('name, contact_id')
            .eq('id', protocolId)
            .maybeSingle();

        const { data: savedItems, error } = await supabase
            .from('protocol_items')
            .select('peptide_id, dosage_amount, dosage_unit, frequency, notes')
            .eq('protocol_id', protocolId);

        if (error || pErr) {
            toast.error('Failed to load saved protocol');
            return;
        }

        if (protocol?.contact_id) {
            setSelectedContactId(protocol.contact_id);
        }
        if (protocol?.name) {
            setProtocolName(protocol.name);
        }

        const newItems: EnrichedProtocolItem[] = [];
        for (const si of (savedItems || [])) {
            const peptide = peptides.find(p => p.id === si.peptide_id);
            if (peptide) {
                const item = enrichPeptide(peptide);
                // Override with saved values
                if (si.dosage_amount) item.doseAmount = si.dosage_amount;
                if (si.dosage_unit) item.doseUnit = si.dosage_unit;
                if (si.frequency) item.frequency = si.frequency;
                if (si.notes) item.notes = si.notes;
                newItems.push(item);
            }
        }
        setItems(newItems);
        toast.success(`Loaded "${protocol?.name || 'protocol'}"`);
    }, [peptides, enrichPeptide]);

    // ── URL Search Params ──────────────────────────────────────

    useEffect(() => {
        if (initialized || !peptides?.length) return;
        setInitialized(true);

        const contactParam = searchParams.get('contact');
        const orderParam = searchParams.get('order');
        const ordersParam = searchParams.get('orders');
        const templateParam = searchParams.get('template');

        if (contactParam) {
            setSelectedContactId(contactParam);
        }

        if (ordersParam) {
            const ids = ordersParam.split(',').filter(Boolean);
            if (ids.length > 0) loadFromOrders(ids);
        } else if (orderParam) {
            loadFromOrder(orderParam);
        } else if (templateParam) {
            loadTemplate(templateParam);
        }
    }, [initialized, peptides, searchParams, loadFromOrder, loadFromOrders, loadTemplate]);

    // ── Auto-generate Protocol Name ─────────────────────────────
    useEffect(() => {
        if (!protocolName || protocolName.includes('Protocol -')) {
            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            setProtocolName(clientName ? `${clientName}'s Protocol - ${today}` : `Protocol - ${today}`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientName]);

    // ── Available peptides (not yet added) ─────────────────────

    const availablePeptides = useMemo(() => {
        return (peptides || []).filter(p => p.active);
    }, [peptides]);

    // ── Generated Output ───────────────────────────────────────

    const html = useMemo(() =>
        items.length > 0
            ? generateProtocolHtml({ items, clientName: clientFullName, orgName, includeSupplies })
            : '',
        [items, clientFullName, orgName, includeSupplies]
    );

    const plainText = useMemo(() =>
        items.length > 0
            ? generateProtocolPlainText({ items, clientName: clientFullName, orgName, includeSupplies })
            : '',
        [items, clientFullName, orgName, includeSupplies]
    );

    // ── Delivery Actions ───────────────────────────────────────

    const copyHtml = useCallback(async () => {
        if (!html) return;
        try {
            // Try to copy as rich text (HTML) for pasting into email clients
            const blob = new Blob([html], { type: 'text/html' });
            const clipboardItem = new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([plainText], { type: 'text/plain' }) });
            await navigator.clipboard.write([clipboardItem]);
            toast.success('Protocol copied! Paste into your email client.');
        } catch {
            // Fallback: copy plain text
            await navigator.clipboard.writeText(plainText);
            toast.success('Protocol copied as text.');
        }
    }, [html, plainText]);

    const printProtocol = useCallback(() => {
        if (!html) return;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 250);
        }
    }, [html]);

    const openMailto = useCallback(() => {
        const subject = encodeURIComponent('Your Peptide Protocol');
        const body = encodeURIComponent(plainText);
        window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`);
    }, [clientEmail, plainText]);

    // ── Return ─────────────────────────────────────────────────

    return {
        // State
        items,
        selectedContactId,
        selectedContact,
        clientName,
        clientFullName,
        clientEmail,
        contacts,
        availablePeptides,
        orgName,
        includeSupplies,
        protocolName,
        savedProtocols,

        // Actions
        setSelectedContactId,
        setIncludeSupplies,
        setProtocolName,
        addPeptide,
        addPeptideByName,
        removeItem,
        updateItem,
        selectTier,
        toggleSection,
        moveItem,
        clearAll,
        loadTemplate,
        loadFromOrder,
        loadFromOrders,
        loadSavedProtocol,

        // Output
        html,
        plainText,

        // Delivery
        copyHtml,
        printProtocol,
        openMailto,
    };
}

export type { EnrichedProtocolItem };
