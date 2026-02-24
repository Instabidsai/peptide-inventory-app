import type { SalesOrder, ShippingRate } from '@/hooks/use-sales-orders';

/** Stock count per peptide, keyed by peptide_id */
export type StockCounts = Record<string, { name: string; count: number }>;

/** Merchant org name lookup, keyed by org_id */
export type MerchantOrgs = Record<string, string>;

/** Common props shared by all tab components */
export interface FulfillmentTabProps {
    orders: SalesOrder[];
    isOrderBusy: (orderId: string) => boolean;
    navigate: (path: string) => void;
}

/** Props for PickPackTab */
export interface PickPackTabProps extends FulfillmentTabProps {
    stockCounts: StockCounts | undefined;
    merchantOrgs: MerchantOrgs | undefined;
    onFulfill: (order: SalesOrder) => void;
    onPrintPackingSlip: (order: SalesOrder) => void;
}

/** Props for LabelShipTab */
export interface LabelShipTabProps extends FulfillmentTabProps {
    merchantOrgs: MerchantOrgs | undefined;
    orderRates: Record<string, ShippingRate[]>;
    selectedRates: Record<string, string>;
    onGetRates: (orderId: string) => void;
    onSelectRate: (orderId: string, rateId: string) => void;
    onBuyLabel: (orderId: string) => void;
    onCancelRates: (orderId: string) => void;
    onPrintLabel: (labelUrl: string) => void;
    onMarkPrinted: (orderId: string) => void;
    onMarkShipped: (orderId: string) => void;
    onMarkDelivered: (orderId: string) => void;
    onMoveToPickPack: (orderId: string) => void;
    onPrintPackingSlip: (order: SalesOrder) => void;
    toast: (opts: { title: string; description?: string }) => void;
}

/** Props for ReadyForPickupTab */
export interface ReadyForPickupTabProps extends FulfillmentTabProps {
    onMarkPickedUp: (orderId: string) => void;
    onMoveToLabelShip: (orderId: string) => void;
    onMoveToPickPack: (orderId: string) => void;
}

/** Props for CompletedTab */
export interface CompletedTabProps extends FulfillmentTabProps {
    onMarkDelivered: (orderId: string) => void;
    toast: (opts: { title: string; description?: string }) => void;
}

/** Props for FulfillConfirmDialog */
export interface FulfillConfirmDialogProps {
    order: SalesOrder | null;
    onOpenChange: () => void;
    onConfirm: () => void;
}

/** Props for SummaryStats */
export interface SummaryStatsProps {
    readyToPickCount: number;
    totalBottlesToPull: number;
    readyToShipCount: number;
    readyForPickupCount: number;
    recentlyCompletedCount: number;
}

/** Props for HoursLoggingCard */
export interface HoursLoggingCardProps {
    todayHours: { hours: number; notes: string | null } | null | undefined;
    weekHours: number | undefined;
    hoursInput: string;
    hoursNotes: string;
    onHoursInputChange: (value: string) => void;
    onHoursNotesChange: (value: string) => void;
    onSave: () => void;
    isSaving: boolean;
}
