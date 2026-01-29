import { useState } from 'react';
import { useReps, useUpdateProfile, type UserProfile, useTeamMembers } from '@/hooks/use-profiles';
import { useInviteRep } from '@/hooks/use-invite';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Pencil, UserPlus, Users, Eye, Loader2, ArrowUpCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { useToast } from "@/hooks/use-toast"; // Correct import for Shadcn toast

import { useNavigate } from 'react-router-dom';

export default function Reps() {
    const navigate = useNavigate();
    const { data: reps, isLoading } = useReps();
    const updateProfile = useUpdateProfile();

    const [editingRep, setEditingRep] = useState<UserProfile | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    if (isLoading) return <div>Loading reps...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
                    <p className="text-muted-foreground">Manage commissions, pricing, and team roles.</p>
                </div>
                <Button onClick={() => setIsInviteOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Add Partner
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" /> Active Partners
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Commission Rate</TableHead>
                                <TableHead>Price Multiplier</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reps?.map((rep) => (
                                <TableRow key={rep.id}>
                                    <TableCell className="font-medium">{rep.full_name || 'Unnamed'}</TableCell>
                                    <TableCell className="text-muted-foreground text-sm">{rep.email || 'No email'}</TableCell>
                                    <TableCell>{((rep.commission_rate || 0) * 100).toFixed(0)}%</TableCell>
                                    <TableCell>x{rep.price_multiplier?.toFixed(2) || '1.00'}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/partners/${rep.id}`)}>
                                                <Eye className="h-4 w-4 mr-2" /> View Details
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setEditingRep(rep)}>
                                                <Pencil className="h-4 w-4 mr-2" /> Edit
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {(!reps || reps.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No sales reps found. Invite or promote users to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <EditRepDialog
                rep={editingRep}
                open={!!editingRep}
                onOpenChange={(open) => !open && setEditingRep(null)}
                onSave={(id, updates) => {
                    updateProfile.mutate({ id, ...updates });
                    setEditingRep(null);
                }}
            />

            <AddRepDialog
                open={isInviteOpen}
                onOpenChange={setIsInviteOpen}
            />
        </div>
    );
}

function AddRepDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const inviteRep = useInviteRep();
    const updateProfile = useUpdateProfile();
    const { data: candidates } = useTeamMembers();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [activeTab, setActiveTab] = useState('promote'); // Default to promote for quick access

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        inviteRep.mutate({ email, fullName: name }, {
            onSuccess: () => {
                onOpenChange(false);
                setEmail('');
                setName('');
            }
        });
    };

    const handlePromote = async () => {
        if (!selectedUserId) return;

        updateProfile.mutate({
            id: selectedUserId,
            role: 'sales_rep',
            // Initialize defaults
            commission_rate: 0,
            price_multiplier: 1.0,
        }, {
            onSuccess: () => {
                toast({ title: "User Promoted", description: "Role updated to Sales Rep." });
                onOpenChange(false);
                setSelectedUserId('');
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Partner</DialogTitle>
                    <DialogDescription>
                        Invite a new partner via email or promote an existing user.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="promote">From Existing Users</TabsTrigger>
                        <TabsTrigger value="invite">Invite New</TabsTrigger>
                    </TabsList>

                    <TabsContent value="promote" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a user..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {candidates?.map(user => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.full_name || 'Unnamed'} ({user.role})
                                        </SelectItem>
                                    ))}
                                    {(!candidates || candidates.length === 0) && (
                                        <SelectItem value="none" disabled>No eligible users found</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Looking for users with role 'client' or 'staff'.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={handlePromote} disabled={!selectedUserId || updateProfile.isPending} className="w-full">
                                {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Promote to Partner
                            </Button>
                        </DialogFooter>
                    </TabsContent>

                    <TabsContent value="invite" className="space-y-0">
                        <form onSubmit={handleInvite} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input
                                    required
                                    placeholder="John Doe"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input
                                    required
                                    type="email"
                                    placeholder="john@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={inviteRep.isPending} className="w-full">
                                    {inviteRep.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send Invitation
                                </Button>
                            </DialogFooter>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

function EditRepDialog({
    rep,
    open,
    onOpenChange,
    onSave
}: {
    rep: UserProfile | null,
    open: boolean,
    onOpenChange: (open: boolean) => void,
    onSave: (id: string, updates: Partial<UserProfile>) => void
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Representative</DialogTitle>
                    <DialogDescription>
                        Adjust commission and pricing settings for {rep?.full_name}.
                    </DialogDescription>
                </DialogHeader>

                {rep && (
                    <RepForm
                        rep={rep}
                        onSubmit={(updates) => onSave(rep.id, updates)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function RepForm({ rep, onSubmit }: { rep: UserProfile, onSubmit: (u: any) => void }) {
    const [comm, setComm] = useState((rep.commission_rate || 0) * 100);
    const [mult, setMult] = useState(rep.price_multiplier || 1.0);

    return (
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Commission (%)</Label>
                <Input
                    type="number"
                    className="col-span-3"
                    value={comm}
                    onChange={e => setComm(parseFloat(e.target.value))}
                />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Price Multiplier</Label>
                <Input
                    type="number"
                    step="0.01"
                    className="col-span-3"
                    value={mult}
                    onChange={e => setMult(parseFloat(e.target.value))}
                />
            </div>
            <p className="text-xs text-muted-foreground ml-auto col-span-4 text-right">
                Example: 1.2 Multiplier = $100 item sells for $120.
            </p>

            <DialogFooter>
                <Button onClick={() => onSubmit({
                    commission_rate: comm / 100,
                    price_multiplier: mult
                })}>
                    Save Changes
                </Button>
            </DialogFooter>
        </div>
    )
}
