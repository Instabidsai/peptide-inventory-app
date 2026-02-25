import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2 } from 'lucide-react';
import { TIER_INFO, EMPTY_PERSON, type PartnerNode } from './types';

interface NewPerson {
    name: string;
    email: string;
    phone: string;
    address: string;
    assignedTo: string;
}

interface AddPersonSheetProps {
    open: boolean;
    onClose: () => void;
    newPerson: NewPerson;
    onPersonChange: (updater: (prev: NewPerson) => NewPerson) => void;
    downline: PartnerNode[] | undefined;
    authProfileName: string | undefined;
    myProfileId: string | undefined;
    isPending: boolean;
    onSubmit: (person: NewPerson) => Promise<void>;
}

export function AddPersonSheet({
    open,
    onClose,
    newPerson,
    onPersonChange,
    downline,
    authProfileName,
    myProfileId,
    isPending,
    onSubmit,
}: AddPersonSheetProps) {
    const handleClose = () => {
        onClose();
        onPersonChange(() => EMPTY_PERSON);
    };

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-primary" />
                        Add Person
                    </SheetTitle>
                    <SheetDescription>Add a customer to your network</SheetDescription>
                </SheetHeader>
                <form
                    className="mt-6 space-y-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newPerson.name.trim()) return;
                        await onSubmit(newPerson);
                    }}
                >
                    <div className="space-y-2">
                        <label htmlFor="add-person-name" className="text-sm font-medium">Name *</label>
                        <Input
                            id="add-person-name"
                            placeholder="Full name"
                            value={newPerson.name}
                            onChange={e => onPersonChange(p => ({ ...p, name: e.target.value }))}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="add-person-email" className="text-sm font-medium">Email</label>
                        <Input
                            id="add-person-email"
                            type="email"
                            placeholder="email@example.com"
                            value={newPerson.email}
                            onChange={e => onPersonChange(p => ({ ...p, email: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="add-person-phone" className="text-sm font-medium">Phone</label>
                        <Input
                            id="add-person-phone"
                            type="tel"
                            placeholder="(555) 123-4567"
                            value={newPerson.phone}
                            onChange={e => onPersonChange(p => ({ ...p, phone: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="add-person-address" className="text-sm font-medium">Shipping Address</label>
                        <Textarea
                            id="add-person-address"
                            placeholder="Street, City, State, ZIP"
                            value={newPerson.address}
                            onChange={e => onPersonChange(p => ({ ...p, address: e.target.value }))}
                            rows={2}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="add-person-assign" className="text-sm font-semibold">Assign To</label>
                        <select
                            id="add-person-assign"
                            className="flex h-11 w-full rounded-lg border border-input bg-card/50 px-4 py-2.5 text-sm shadow-inset ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={newPerson.assignedTo}
                            onChange={e => onPersonChange(p => ({ ...p, assignedTo: e.target.value }))}
                        >
                            <option value="">Directly under me ({authProfileName || 'You'})</option>
                            {downline && downline.length > 0 && (
                                <optgroup label="Under a team partner">
                                    {downline.map(partner => (
                                        <option key={partner.id} value={partner.id}>
                                            {partner.full_name || partner.email} — {TIER_INFO[partner.partner_tier]?.label || 'Partner'}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Choose who this customer is assigned to. Default is directly under you.
                        </p>
                    </div>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isPending || !newPerson.name.trim()}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <UserPlus className="h-4 w-4 mr-2" />
                        )}
                        Add to Network
                    </Button>
                </form>
            </SheetContent>
        </Sheet>
    );
}
