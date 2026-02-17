import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    DollarSign, AlertCircle, CheckCircle2, Clock, Receipt,
    ChevronDown, ChevronUp, CreditCard, Hash, Calendar,
    Award, Zap, Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label as FormLabel } from "@/components/ui/label";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FinancialOverviewProps {
    contactId: string;
}

interface LineItem {
    peptide_name: string;
    quantity: number;
    unit_price: number;
}

interface Transaction {
    id: string;
    source: "sales_order" | "movement";
    date: string;               // created_at / movement_date
    status: string;             // fulfilled, submitted, pending, etc.
    payment_status: string;     // paid, unpaid, partial
    subtotal: number;           // sum of items before discount
    discount_pct: number;       // discount percent (movements only)
    discount_amt: number;       // discount dollar amount
    total: number;              // subtotal - discount
    amount_paid: number;
    balance: number;            // total - amount_paid
    payment_method: string | null;
    payment_date: string | null;
    notes: string | null;
    items: LineItem[];
}

interface PartnerInfo {
    profile_id: string;
    partner_tier: string;
    commission_rate: number;
    credit_balance: number;
}

interface CommissionRecord {
    id: string;
    amount: number;
    commission_rate: number;
    type: string;       // direct, second_tier_override, etc.
    status: string;     // pending, available, paid
    created_at: string;
    sale_id: string;
}

/* ------------------------------------------------------------------ */
/*  Helper: currency formatter                                         */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FinancialOverview({ contactId }: FinancialOverviewProps) {
    const { session } = useAuth();
    const queryClient = useQueryClient();

    const [loading, setLoading] = useState(true);
    const [txns, setTxns] = useState<Transaction[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Partner / commission state
    const [partnerInfo, setPartnerInfo] = useState<PartnerInfo | null>(null);
    const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
    const [applyingCredit, setApplyingCredit] = useState(false);

    // Payment dialog
    const [payTarget, setPayTarget] = useState<Transaction | null>(null);
    const [payMethod, setPayMethod] = useState("cash");

    /* -------------------------------------------------------------- */
    /*  Data fetching — flat queries, no fragile nested PostgREST      */
    /* -------------------------------------------------------------- */

    const fetchAll = useCallback(async () => {
        try {
            const assembled: Transaction[] = [];

            /* ========== 1. Sales Orders (new system) ========== */
            const { data: orders } = await supabase
                .from("sales_orders")
                .select("id, status, payment_status, total_amount, amount_paid, payment_method, payment_date, created_at, notes")
                .eq("client_id", contactId)
                .neq("status", "cancelled")
                .order("created_at", { ascending: false });

            if (orders?.length) {
                const orderIds = orders.map((o) => o.id);

                // Fetch line items
                const { data: soItems } = await supabase
                    .from("sales_order_items")
                    .select("sales_order_id, quantity, unit_price, peptide_id")
                    .in("sales_order_id", orderIds);

                // Batch peptide names
                const pepIdsFromSO = [...new Set((soItems || []).map((i) => i.peptide_id))];
                let soNameMap: Record<string, string> = {};
                if (pepIdsFromSO.length > 0) {
                    const { data: peps } = await supabase
                        .from("peptides")
                        .select("id, name")
                        .in("id", pepIdsFromSO as string[]);
                    soNameMap = Object.fromEntries((peps || []).map((p) => [p.id, p.name]));
                }

                for (const o of orders) {
                    const items: LineItem[] = (soItems || [])
                        .filter((i) => i.sales_order_id === o.id)
                        .map((i) => ({
                            peptide_name: soNameMap[i.peptide_id] || "Item",
                            quantity: Number(i.quantity) || 0,
                            unit_price: Number(i.unit_price) || 0,
                        }));
                    const subtotal = Number(o.total_amount) || 0;
                    const paid = Number(o.amount_paid) || 0;
                    assembled.push({
                        id: o.id,
                        source: "sales_order",
                        date: o.created_at,
                        status: o.status,
                        payment_status: o.payment_status || "unpaid",
                        subtotal,
                        discount_pct: 0,
                        discount_amt: 0,
                        total: subtotal,
                        amount_paid: paid,
                        balance: subtotal - paid,
                        payment_method: o.payment_method,
                        payment_date: o.payment_date,
                        notes: o.notes,
                        items,
                    });
                }
            }

            /* ========== 2. Legacy Movements ========== */
            // Step A: Fetch movements (flat — no nested embed)
            const { data: movements } = await supabase
                .from("movements")
                .select("id, payment_status, amount_paid, movement_date, notes, created_at, payment_date, payment_method, discount_percent, discount_amount")
                .eq("contact_id", contactId)
                .eq("type", "sale")
                .order("created_at", { ascending: false });

            if (movements?.length) {
                // Skip movements already linked to a sales_order
                const linkedIds = new Set<string>();
                for (const m of movements) {
                    const n = m.notes || "";
                    if (n.includes("[SO:") || n.match(/^Sales Order #/)) {
                        linkedIds.add(m.id);
                    }
                }
                const unlinked = movements.filter((m) => !linkedIds.has(m.id));

                if (unlinked.length > 0) {
                    const mvIds = unlinked.map((m) => m.id);

                    // Step B: Fetch movement_items (flat)
                    const { data: mvItems } = await supabase
                        .from("movement_items")
                        .select("movement_id, price_at_sale, bottle_id")
                        .in("movement_id", mvIds);

                    // Step C: Batch bottle → lot lookup
                    const bottleIds = [...new Set((mvItems || []).map((mi) => mi.bottle_id).filter(Boolean))];
                    let bottleToLot: Record<string, string> = {};
                    if (bottleIds.length > 0) {
                        const { data: bottles } = await supabase
                            .from("bottles")
                            .select("id, lot_id")
                            .in("id", bottleIds as string[]);
                        bottleToLot = Object.fromEntries((bottles || []).map((b) => [b.id, b.lot_id]));
                    }

                    // Step D: Batch lot → peptide_id lookup
                    const lotIds = [...new Set(Object.values(bottleToLot).filter(Boolean))];
                    let lotToPep: Record<string, string> = {};
                    if (lotIds.length > 0) {
                        const { data: lots } = await supabase
                            .from("lots")
                            .select("id, peptide_id")
                            .in("id", lotIds as string[]);
                        lotToPep = Object.fromEntries((lots || []).map((l) => [l.id, l.peptide_id]));
                    }

                    // Step E: Batch peptide name lookup
                    const pepIds = [...new Set(Object.values(lotToPep).filter(Boolean))];
                    let pepNames: Record<string, string> = {};
                    if (pepIds.length > 0) {
                        const { data: peps } = await supabase
                            .from("peptides")
                            .select("id, name")
                            .in("id", pepIds as string[]);
                        pepNames = Object.fromEntries((peps || []).map((p) => [p.id, p.name]));
                    }

                    // Resolve peptide name from bottle_id
                    const getPepName = (bottleId: string | null): string => {
                        if (!bottleId) return "Item";
                        const lotId = bottleToLot[bottleId];
                        const pepId = lotId ? lotToPep[lotId] : null;
                        return pepId ? (pepNames[pepId] || "Item") : "Item";
                    };

                    // Step F: Assemble movement transactions
                    for (const m of unlinked) {
                        const mItems = (mvItems || []).filter((mi) => mi.movement_id === m.id);
                        // Group by peptide name
                        const grouped: Record<string, LineItem> = {};
                        let subtotal = 0;
                        for (const mi of mItems) {
                            const price = Number(mi.price_at_sale) || 0;
                            subtotal += price;
                            const name = getPepName(mi.bottle_id);
                            if (grouped[name]) {
                                grouped[name].quantity += 1;
                            } else {
                                grouped[name] = { peptide_name: name, quantity: 1, unit_price: price };
                            }
                        }
                        const items = Object.values(grouped);
                        const discPct = Number(m.discount_percent) || 0;
                        const discAmt = Number(m.discount_amount) || 0;
                        const total = subtotal - discAmt;
                        const paid = Number(m.amount_paid) || 0;

                        // Extract payment method from notes if column is null
                        let method = m.payment_method || null;
                        if (!method) {
                            const match = (m.notes || "").match(/Paid via (\w+)/i);
                            if (match) method = match[1];
                        }

                        assembled.push({
                            id: m.id,
                            source: "movement",
                            date: m.created_at,
                            status: "fulfilled",
                            payment_status: m.payment_status || "unpaid",
                            subtotal,
                            discount_pct: discPct,
                            discount_amt: discAmt,
                            total: total > 0 ? total : subtotal,
                            amount_paid: paid,
                            balance: (total > 0 ? total : subtotal) - paid,
                            payment_method: method,
                            payment_date: m.payment_date || null,
                            notes: m.notes,
                            items,
                        });
                    }
                }
            }

            // Sort by date descending
            assembled.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setTxns(assembled);

            /* ========== 3. Partner / Commission lookup ========== */
            // Resolve contact → partner profile via email match
            const { data: contactRow } = await supabase
                .from("contacts")
                .select("email, linked_user_id")
                .eq("id", contactId)
                .single();

            if (contactRow?.email) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("id, partner_tier, commission_rate, credit_balance")
                    .ilike("email", contactRow.email)
                    .not("partner_tier", "is", null)
                    .limit(1)
                    .maybeSingle();

                if (profile?.id) {
                    setPartnerInfo({
                        profile_id: profile.id,
                        partner_tier: profile.partner_tier || "standard",
                        commission_rate: Number(profile.commission_rate) || 0,
                        credit_balance: Number(profile.credit_balance) || 0,
                    });

                    // Fetch their commissions
                    const { data: comms } = await supabase
                        .from("commissions")
                        .select("id, amount, commission_rate, type, status, created_at, sale_id")
                        .eq("partner_id", profile.id)
                        .order("created_at", { ascending: false });

                    setCommissions((comms || []).map((c) => ({
                        ...c,
                        amount: Number(c.amount) || 0,
                        commission_rate: Number(c.commission_rate) || 0,
                    })));
                } else {
                    setPartnerInfo(null);
                    setCommissions([]);
                }
            }
        } catch (err) {
            console.error("FinancialOverview fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [contactId]);

    useEffect(() => {
        if (session) fetchAll();
    }, [contactId, session?.access_token, fetchAll]);

    /* -------------------------------------------------------------- */
    /*  Derived stats                                                   */
    /* -------------------------------------------------------------- */

    const totalOrders = txns.length;
    const totalSpent = txns.reduce((s, t) => s + t.total, 0);
    const totalPaid = txns.reduce((s, t) => s + t.amount_paid, 0);
    const totalOutstanding = txns.reduce((s, t) => s + Math.max(t.balance, 0), 0);
    const totalDiscount = txns.reduce((s, t) => s + t.discount_amt, 0);
    const paidCount = txns.filter((t) => t.payment_status === "paid").length;
    const unpaidCount = txns.filter((t) => t.payment_status !== "paid").length;

    // Commission stats
    const commEarned = commissions.reduce((s, c) => s + c.amount, 0);
    const commAvailable = commissions.filter((c) => c.status === "available").reduce((s, c) => s + c.amount, 0);
    const commPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const commPaidOut = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
    const creditBalance = partnerInfo?.credit_balance || 0;

    /* -------------------------------------------------------------- */
    /*  Apply commission credit to outstanding balance                   */
    /* -------------------------------------------------------------- */

    const handleApplyCommissions = async () => {
        if (!partnerInfo?.profile_id || commAvailable <= 0) return;
        try {
            setApplyingCredit(true);
            const { data, error } = await supabase.rpc("apply_commissions_to_owed", {
                partner_profile_id: partnerInfo.profile_id,
            });
            if (error) throw error;

            const result = data as { applied: number; movements_paid: number; remaining_credit: number };
            await fetchAll();
            queryClient.invalidateQueries({ queryKey: ["movements"] });
            queryClient.invalidateQueries({ queryKey: ["commissions"] });
            queryClient.invalidateQueries({ queryKey: ["sales_orders"] });

            toast({
                title: "Commission Credit Applied",
                description: `${fmt(result.applied)} applied to ${result.movements_paid} order${result.movements_paid !== 1 ? "s" : ""}${result.remaining_credit > 0 ? `. ${fmt(result.remaining_credit)} added to credit balance.` : "."}`,
                className: "bg-green-50 border-green-200 text-green-900",
            });
        } catch (err) {
            console.error("Apply commission error:", err);
            toast({
                title: "Commission Apply Failed",
                description: err instanceof Error ? err.message : "Could not apply commissions.",
                variant: "destructive",
            });
        } finally {
            setApplyingCredit(false);
        }
    };

    /* -------------------------------------------------------------- */
    /*  Record payment for a single order                               */
    /* -------------------------------------------------------------- */

    const handleRecordPayment = async () => {
        if (!payTarget) return;
        try {
            setLoading(true);
            if (payTarget.source === "sales_order") {
                const { error } = await supabase
                    .from("sales_orders")
                    .update({
                        payment_status: "paid",
                        amount_paid: payTarget.total,
                        payment_method: payMethod,
                        payment_date: new Date().toISOString(),
                    })
                    .eq("id", payTarget.id);
                if (error) throw error;

                // Also mark any linked movements as paid
                await supabase
                    .from("movements")
                    .update({
                        payment_status: "paid",
                        payment_date: new Date().toISOString(),
                        notes: `Paid via ${payMethod}`,
                    } as any)
                    .eq("contact_id", contactId)
                    .eq("payment_status", "unpaid" as any);
            } else {
                const { error } = await supabase
                    .from("movements")
                    .update({
                        payment_status: "paid",
                        amount_paid: payTarget.total,
                        payment_method: payMethod,
                        payment_date: new Date().toISOString(),
                    } as any)
                    .eq("id", payTarget.id);
                if (error) throw error;
            }

            setPayTarget(null);
            await fetchAll();
            queryClient.invalidateQueries({ queryKey: ["movements"] });
            queryClient.invalidateQueries({ queryKey: ["sales_orders"] });
            toast({
                title: "Payment Recorded",
                description: `Marked as paid via ${payMethod}.`,
                className: "bg-green-50 border-green-200 text-green-900",
            });
        } catch (err) {
            console.error("Payment error:", err);
            toast({
                title: "Payment Failed",
                description: err instanceof Error ? err.message : "Could not update payment.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    /* -------------------------------------------------------------- */
    /*  Mark ALL unpaid as paid                                         */
    /* -------------------------------------------------------------- */

    const handleMarkAllPaid = async () => {
        const unpaid = txns.filter((t) => t.payment_status !== "paid");
        if (unpaid.length === 0) return;
        try {
            setLoading(true);
            const soIds = unpaid.filter((t) => t.source === "sales_order").map((t) => t.id);
            const mvIds = unpaid.filter((t) => t.source === "movement").map((t) => t.id);

            if (soIds.length > 0) {
                for (const id of soIds) {
                    const t = unpaid.find((x) => x.id === id)!;
                    await supabase
                        .from("sales_orders")
                        .update({
                            payment_status: "paid",
                            amount_paid: t.total,
                            payment_method: payMethod,
                            payment_date: new Date().toISOString(),
                        })
                        .eq("id", id);
                }
            }
            if (mvIds.length > 0) {
                for (const id of mvIds) {
                    const t = unpaid.find((x) => x.id === id)!;
                    await supabase
                        .from("movements")
                        .update({
                            payment_status: "paid",
                            amount_paid: t.total,
                            payment_method: payMethod,
                            payment_date: new Date().toISOString(),
                        } as any)
                        .eq("id", id);
                }
            }

            setPayTarget(null);
            await fetchAll();
            queryClient.invalidateQueries({ queryKey: ["movements"] });
            queryClient.invalidateQueries({ queryKey: ["sales_orders"] });
            toast({
                title: "All Payments Recorded",
                description: `Marked ${unpaid.length} order${unpaid.length !== 1 ? "s" : ""} as paid.`,
                className: "bg-green-50 border-green-200 text-green-900",
            });
        } catch (err) {
            console.error("Bulk payment error:", err);
            toast({
                title: "Payment Failed",
                description: err instanceof Error ? err.message : "Could not update payments.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    /* -------------------------------------------------------------- */
    /*  Render helpers                                                  */
    /* -------------------------------------------------------------- */

    const statusBadge = (t: Transaction) => {
        if (t.payment_status === "paid")
            return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">Paid</Badge>;
        if (t.payment_status === "partial")
            return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Partial</Badge>;
        return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">Unpaid</Badge>;
    };

    const methodLabel = (m: string | null) => {
        if (!m) return "—";
        const labels: Record<string, string> = {
            cash: "Cash", venmo: "Venmo", zelle: "Zelle",
            apple_pay: "Apple Pay", credit_card: "Credit Card",
            check: "Check", other: "Other",
        };
        return labels[m.toLowerCase()] || m;
    };

    /* -------------------------------------------------------------- */
    /*  Loading / empty states                                          */
    /* -------------------------------------------------------------- */

    if (loading) {
        return (
            <Card className="border-border/50">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    Loading financial data...
                </CardContent>
            </Card>
        );
    }

    if (totalOrders === 0) {
        return (
            <Card className="border-border/50">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                        <Receipt className="h-5 w-5" /> Account &amp; Finances
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">No orders or transactions found for this contact.</p>
                </CardContent>
            </Card>
        );
    }

    const hasOutstanding = totalOutstanding > 0;

    /* -------------------------------------------------------------- */
    /*  Main render                                                     */
    /* -------------------------------------------------------------- */

    return (
        <Card className={cn(
            "border",
            hasOutstanding ? "border-amber-200 bg-amber-50/20" : "border-emerald-200 bg-emerald-50/20",
        )}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Receipt className="h-5 w-5" />
                        Account &amp; Finances
                    </CardTitle>
                    {hasOutstanding ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" /> Balance Due
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> All Paid
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* ---- Summary Stats ---- */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatBox
                        icon={<Hash className="h-3.5 w-3.5" />}
                        label="Orders"
                        value={String(totalOrders)}
                        sub={`${paidCount} paid · ${unpaidCount} open`}
                    />
                    <StatBox
                        icon={<DollarSign className="h-3.5 w-3.5" />}
                        label="Total Spent"
                        value={fmt(totalSpent)}
                        sub={totalDiscount > 0 ? `${fmt(totalDiscount)} discounted` : undefined}
                    />
                    <StatBox
                        icon={<CreditCard className="h-3.5 w-3.5" />}
                        label="Total Paid"
                        value={fmt(totalPaid)}
                        className="text-emerald-700"
                    />
                    <StatBox
                        icon={<AlertCircle className="h-3.5 w-3.5" />}
                        label="Outstanding"
                        value={fmt(totalOutstanding)}
                        className={hasOutstanding ? "text-amber-700" : "text-emerald-700"}
                    />
                </div>

                {/* ---- Commission Section (partners only) ---- */}
                {partnerInfo && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50/30 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Award className="h-4 w-4 text-purple-600" />
                                <span className="text-sm font-semibold text-purple-900">
                                    Partner Commissions
                                </span>
                                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">
                                    {partnerInfo.partner_tier} · {(partnerInfo.commission_rate * 100).toFixed(0)}%
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <StatBox
                                icon={<DollarSign className="h-3.5 w-3.5" />}
                                label="Total Earned"
                                value={fmt(commEarned)}
                                className="text-purple-700"
                            />
                            <StatBox
                                icon={<Zap className="h-3.5 w-3.5" />}
                                label="Available"
                                value={fmt(commAvailable)}
                                sub={commPending > 0 ? `${fmt(commPending)} pending` : undefined}
                                className="text-emerald-700"
                            />
                            <StatBox
                                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                                label="Paid Out"
                                value={fmt(commPaidOut)}
                            />
                            <StatBox
                                icon={<Wallet className="h-3.5 w-3.5" />}
                                label="Credit Balance"
                                value={fmt(creditBalance)}
                                className={creditBalance > 0 ? "text-blue-700" : undefined}
                            />
                        </div>

                        {/* Apply commissions button */}
                        {commAvailable > 0 && hasOutstanding && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
                                onClick={handleApplyCommissions}
                                disabled={applyingCredit}
                            >
                                {applyingCredit ? "Applying..." : `Apply ${fmt(commAvailable)} Commission to Outstanding Balance`}
                            </Button>
                        )}

                        {/* Commission history */}
                        {commissions.length > 0 && (
                            <details className="group">
                                <summary className="text-[11px] text-purple-600 cursor-pointer hover:text-purple-800 font-medium">
                                    View {commissions.length} commission record{commissions.length !== 1 ? "s" : ""}
                                </summary>
                                <div className="mt-2 max-h-[160px] overflow-y-auto space-y-1">
                                    {commissions.map((c) => (
                                        <div key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-card border border-border/30">
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">
                                                    {format(new Date(c.created_at), "MMM d, yyyy")}
                                                </span>
                                                <Badge className={cn(
                                                    "text-[9px] px-1 py-0",
                                                    c.type === "direct"
                                                        ? "bg-blue-100 text-blue-600 border-blue-200"
                                                        : "bg-orange-100 text-orange-600 border-orange-200",
                                                )}>
                                                    {c.type === "direct" ? "Direct" : "Override"}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{fmt(c.amount)}</span>
                                                <Badge className={cn(
                                                    "text-[9px] px-1 py-0",
                                                    c.status === "available" ? "bg-emerald-100 text-emerald-600" :
                                                    c.status === "pending" ? "bg-amber-100 text-amber-600" :
                                                    "bg-gray-100 text-gray-500",
                                                )}>
                                                    {c.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {/* ---- Mark All Paid button ---- */}
                {hasOutstanding && (
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            className="bg-slate-800 hover:bg-slate-900 text-white text-xs"
                            onClick={() => {
                                setPayTarget({ id: "__ALL__", source: "sales_order", date: "", status: "", payment_status: "unpaid", subtotal: 0, discount_pct: 0, discount_amt: 0, total: totalOutstanding, amount_paid: 0, balance: totalOutstanding, payment_method: null, payment_date: null, notes: null, items: [] });
                                setPayMethod("cash");
                            }}
                        >
                            Record Payment — All Outstanding ({fmt(totalOutstanding)})
                        </Button>
                    </div>
                )}

                {/* ---- Transaction List ---- */}
                <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                    {/* Header row */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_2fr_80px_80px_80px_70px_28px] gap-1 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/30">
                        <span>Date</span>
                        <span>Items</span>
                        <span className="text-right">Total</span>
                        <span className="text-right">Paid</span>
                        <span className="text-right">Balance</span>
                        <span className="text-center">Status</span>
                        <span />
                    </div>

                    {/* Rows */}
                    <div className="max-h-[400px] overflow-y-auto divide-y divide-border/40">
                        {txns.map((t) => {
                            const isExpanded = expandedId === t.id;
                            const itemSummary = t.items.map((i) =>
                                `${i.peptide_name}${i.quantity > 1 ? ` x${i.quantity}` : ""}`
                            ).join(", ");

                            return (
                                <div key={t.id}>
                                    {/* Main row */}
                                    <div
                                        className={cn(
                                            "grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_2fr_80px_80px_80px_70px_28px] gap-1 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/20 transition-colors items-center",
                                            t.payment_status === "paid" && "opacity-70",
                                        )}
                                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                                    >
                                        {/* Date */}
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3 w-3 text-muted-foreground shrink-0 hidden sm:block" />
                                            <span className="font-medium text-xs">
                                                {format(new Date(t.date), "MMM d, yyyy")}
                                            </span>
                                        </div>

                                        {/* Items (desktop) */}
                                        <div className="hidden sm:block text-xs text-muted-foreground truncate" title={itemSummary}>
                                            {itemSummary || "—"}
                                        </div>

                                        {/* Total */}
                                        <div className="hidden sm:block text-right text-xs font-semibold">
                                            {fmt(t.total)}
                                            {t.discount_amt > 0 && (
                                                <div className="text-[10px] text-green-600 font-normal">
                                                    -{fmt(t.discount_amt)} off
                                                </div>
                                            )}
                                        </div>

                                        {/* Paid */}
                                        <div className="hidden sm:block text-right text-xs">
                                            {t.amount_paid > 0 ? fmt(t.amount_paid) : "—"}
                                            {t.payment_method && (
                                                <div className="text-[10px] text-muted-foreground">
                                                    {methodLabel(t.payment_method)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Balance */}
                                        <div className={cn(
                                            "hidden sm:block text-right text-xs font-semibold",
                                            t.balance > 0 ? "text-amber-700" : "text-emerald-600",
                                        )}>
                                            {t.balance > 0 ? fmt(t.balance) : "—"}
                                        </div>

                                        {/* Status */}
                                        <div className="flex items-center justify-end sm:justify-center">
                                            {statusBadge(t)}
                                        </div>

                                        {/* Expand arrow */}
                                        <div className="hidden sm:flex justify-center">
                                            {isExpanded
                                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                        </div>

                                        {/* Mobile summary row */}
                                        <div className="sm:hidden col-span-2 text-xs text-muted-foreground mt-1">
                                            {itemSummary} — {fmt(t.total)}
                                            {t.balance > 0 && <span className="text-amber-700 ml-1">(owes {fmt(t.balance)})</span>}
                                            {t.payment_method && <span className="ml-1">• {methodLabel(t.payment_method)}</span>}
                                        </div>
                                    </div>

                                    {/* Expanded detail */}
                                    {isExpanded && (
                                        <div className="px-4 pb-3 bg-muted/10 border-t border-border/30">
                                            <div className="py-2 space-y-1.5">
                                                {/* Line items */}
                                                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                                    Line Items
                                                </div>
                                                {t.items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-xs pl-2">
                                                        <span>
                                                            {item.peptide_name}
                                                            {item.quantity > 1 && <span className="text-muted-foreground"> x{item.quantity}</span>}
                                                        </span>
                                                        <span className="font-medium">{fmt(item.unit_price * item.quantity)}</span>
                                                    </div>
                                                ))}

                                                {/* Subtotal / discount / total */}
                                                <div className="border-t border-border/30 pt-1.5 mt-1.5 space-y-0.5">
                                                    {t.discount_amt > 0 && (
                                                        <>
                                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                                <span>Subtotal</span>
                                                                <span>{fmt(t.subtotal)}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs text-green-600">
                                                                <span>Discount{t.discount_pct > 0 ? ` (${t.discount_pct}%)` : ""}</span>
                                                                <span>-{fmt(t.discount_amt)}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="flex justify-between text-xs font-semibold">
                                                        <span>Total</span>
                                                        <span>{fmt(t.total)}</span>
                                                    </div>
                                                    {t.amount_paid > 0 && (
                                                        <div className="flex justify-between text-xs text-emerald-600">
                                                            <span>Paid{t.payment_date ? ` on ${format(new Date(t.payment_date), "MMM d")}` : ""}{t.payment_method ? ` via ${methodLabel(t.payment_method)}` : ""}</span>
                                                            <span>-{fmt(t.amount_paid)}</span>
                                                        </div>
                                                    )}
                                                    {t.balance > 0 && (
                                                        <div className="flex justify-between text-xs font-bold text-amber-700">
                                                            <span>Balance Due</span>
                                                            <span>{fmt(t.balance)}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Notes */}
                                                {t.notes && (
                                                    <div className="text-[11px] text-muted-foreground italic mt-1 pl-2 border-l-2 border-muted">
                                                        {t.notes}
                                                    </div>
                                                )}

                                                {/* Per-order payment button */}
                                                {t.payment_status !== "paid" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="mt-2 text-xs h-7"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPayTarget(t);
                                                            setPayMethod("cash");
                                                        }}
                                                    >
                                                        Record Payment ({fmt(t.balance)})
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ---- Payment Dialog ---- */}
                <Dialog
                    open={!!payTarget}
                    onOpenChange={(open) => { if (!open) setPayTarget(null); }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Record Payment</DialogTitle>
                            <DialogDescription>
                                {payTarget?.id === "__ALL__"
                                    ? <>Mark <strong>all {unpaidCount} outstanding orders</strong> ({fmt(totalOutstanding)}) as paid.</>
                                    : <>Mark order from <strong>{payTarget ? format(new Date(payTarget.date), "MMM d, yyyy") : ""}</strong> ({payTarget ? fmt(payTarget.balance) : ""}) as paid.</>
                                }
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 py-3">
                            <FormLabel>Payment Method</FormLabel>
                            <Select value={payMethod} onValueChange={setPayMethod}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="venmo">Venmo</SelectItem>
                                    <SelectItem value="zelle">Zelle</SelectItem>
                                    <SelectItem value="apple_pay">Apple Pay</SelectItem>
                                    <SelectItem value="credit_card">Credit Card</SelectItem>
                                    <SelectItem value="check">Check</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
                            <Button
                                className="bg-green-600 hover:bg-green-700"
                                onClick={payTarget?.id === "__ALL__" ? handleMarkAllPaid : handleRecordPayment}
                            >
                                Confirm Payment
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/*  Stat box sub-component                                             */
/* ------------------------------------------------------------------ */

function StatBox({
    icon, label, value, sub, className,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    className?: string;
}) {
    return (
        <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                {icon} {label}
            </div>
            <div className={cn("text-lg font-bold", className)}>{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
        </div>
    );
}
