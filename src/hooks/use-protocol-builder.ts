import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePeptides, type Peptide } from '@/hooks/use-peptides';
import { lookupKnowledge, PROTOCOL_TEMPLATES, type PeptideKnowledge, type DosingTier } from '@/data/protocol-knowledge';
import {
    type EnrichedProtocolItem,
    generateProtocolHtml,
    generateProtocolPlainText,
    calcMl,
    calcUnits,
} from '@/lib/protocol-html-generator';
import { toast } from 'sonner';

// ── Hook ───────────────────────────────────────────────────────

export function useProtocolBuilder() {
    const { profile, organization } = useAuth();
    const { data: peptides } = usePeptides();
    const [searchParams] = useSearchParams();

    // State
    const [selectedContactId, setSelectedContactId] = useState('');
    const [items, setItems] = useState<EnrichedProtocolItem[]>([]);
    const [initialized, setInitialized] = useState(false);

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

    const selectedContact = contacts?.find(c => c.id === selectedContactId);
    const clientName = selectedContact?.name?.split(' ')[0] || '';
    const clientFullName = selectedContact?.name || '';
    const clientEmail = selectedContact?.email || '';
    const orgName = organization?.name || 'NextGen Research Labs';

    // ── Enrichment: peptide → EnrichedProtocolItem ─────────────

    const enrichPeptide = useCallback((peptide: Peptide, preferredTierId?: string): EnrichedProtocolItem => {
        const knowledge = lookupKnowledge(peptide.name);
        const tiers = knowledge?.dosingTiers ?? [];
        const concentrationMgMl = knowledge
            ? (knowledge.vialSizeMg / knowledge.reconstitutionMl)
            : (peptide.default_concentration_mg_ml || 0);

        // Select tier: preferred > 'standard' > first available > null
        const tier = tiers.find(t => t.id === preferredTierId)
            ?? tiers.find(t => t.id === 'standard')
            ?? (tiers.length > 0 ? tiers[0] : null);

        return {
            peptideId: peptide.id,
            peptideName: peptide.name,
            vialSizeMg: knowledge?.vialSizeMg ?? null,
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
            stackLabel: knowledge?.stackLabel ?? null,
            dosageSchedule: tier?.dosageSchedule ?? knowledge?.dosageSchedule ?? null,
            notes: '',
            supplements: knowledge?.supplementNotes ?? [],
            selectedTierId: tier?.id ?? null,
            availableTiers: tiers,
        };
    }, []);

    // ── Actions ────────────────────────────────────────────────

    const addPeptide = useCallback((peptide: Peptide) => {
        setItems(prev => {
            if (prev.some(i => i.peptideId === peptide.id)) return prev;
            return [...prev, enrichPeptide(peptide)];
        });
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
            // Recalculate concentration if reconstitution or vial size changed
            if ((field === 'reconstitutionMl' || field === 'vialSizeMg') && updated.vialSizeMg && updated.reconstitutionMl > 0) {
                updated.concentrationMgMl = updated.vialSizeMg / updated.reconstitutionMl;
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
            };
            // Recalculate concentration
            if (updated.vialSizeMg && updated.reconstitutionMl > 0) {
                updated.concentrationMgMl = updated.vialSizeMg / updated.reconstitutionMl;
            }
            return updated;
        }));
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

    // ── URL Search Params ──────────────────────────────────────

    useEffect(() => {
        if (initialized || !peptides?.length) return;
        setInitialized(true);

        const contactParam = searchParams.get('contact');
        const orderParam = searchParams.get('order');
        const templateParam = searchParams.get('template');

        if (contactParam) {
            setSelectedContactId(contactParam);
        }

        if (orderParam) {
            loadFromOrder(orderParam);
        } else if (templateParam) {
            loadTemplate(templateParam);
        }
    }, [initialized, peptides, searchParams, loadFromOrder, loadTemplate]);

    // ── Available peptides (not yet added) ─────────────────────

    const availablePeptides = useMemo(() => {
        const addedIds = new Set(items.map(i => i.peptideId));
        return (peptides || []).filter(p => p.active && !addedIds.has(p.id));
    }, [peptides, items]);

    // ── Generated Output ───────────────────────────────────────

    const html = useMemo(() =>
        items.length > 0
            ? generateProtocolHtml({ items, clientName: clientFullName, orgName })
            : '',
        [items, clientFullName, orgName]
    );

    const plainText = useMemo(() =>
        items.length > 0
            ? generateProtocolPlainText({ items, clientName: clientFullName, orgName })
            : '',
        [items, clientFullName, orgName]
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

        // Actions
        setSelectedContactId,
        addPeptide,
        addPeptideByName,
        removeItem,
        updateItem,
        selectTier,
        clearAll,
        loadTemplate,
        loadFromOrder,

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
