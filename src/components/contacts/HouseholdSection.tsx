import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Users, Plus, Loader2, CheckCircle2, Send, ExternalLink, Copy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useHouseholdMembers, useAddHouseholdMember, useInviteHouseholdMember } from '@/hooks/use-household';

interface HouseholdSectionProps {
    contactId: string;
}

export function HouseholdSection({ contactId }: HouseholdSectionProps) {
    const { data: householdMembers, isLoading: isLoadingHousehold } = useHouseholdMembers(contactId);
    const addHouseholdMember = useAddHouseholdMember(contactId);
    const inviteHouseholdMember = useInviteHouseholdMember();
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [lastMemberInviteLink, setLastMemberInviteLink] = useState('');

    const handleAddHouseholdMember = async () => {
        if (!newMemberName.trim()) return;
        try {
            const newContactId = await addHouseholdMember.mutateAsync({
                name: newMemberName.trim(),
                email: newMemberEmail.trim() || undefined,
            });
            if (newMemberEmail.trim()) {
                const result = await inviteHouseholdMember.mutateAsync({
                    contactId: newContactId,
                    email: newMemberEmail.trim(),
                });
                setLastMemberInviteLink(result.action_link);
            }
            setNewMemberName('');
            setNewMemberEmail('');
            if (!newMemberEmail.trim()) setIsAddMemberOpen(false);
        } catch {
            // Error already toasted by hooks
        }
    };

    const handleResendInvite = async (memberId: string, memberEmail: string) => {
        const result = await inviteHouseholdMember.mutateAsync({
            contactId: memberId,
            email: memberEmail,
        });
        setLastMemberInviteLink(result.action_link);
    };

    return (
        <AccordionItem value="household" className="border border-border/60 rounded-lg bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-lg">Household</span>
                    {(householdMembers?.length ?? 0) > 0 && (
                        <Badge variant="secondary" className="ml-2">{householdMembers!.length} members</Badge>
                    )}
                </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                    Household members share the same fridge inventory but have individual protocols.
                </p>

                {/* Member List */}
                {isLoadingHousehold ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : (householdMembers?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                        {householdMembers!.map(member => (
                            <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card/50">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <span className="text-xs font-bold text-primary">
                                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium text-sm truncate">{member.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {member.email || 'No email'}
                                            {' \u00B7 '}
                                            <span className="capitalize">{member.household_role}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {member.is_linked ? (
                                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Linked
                                        </Badge>
                                    ) : member.email ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs h-7"
                                            onClick={() => handleResendInvite(member.id, member.email!)}
                                            disabled={inviteHouseholdMember.isPending}
                                        >
                                            <Send className="h-3 w-3 mr-1" />
                                            {inviteHouseholdMember.isPending ? 'Sending...' : 'Send Invite'}
                                        </Button>
                                    ) : (
                                        <Badge variant="secondary" className="text-xs">No email</Badge>
                                    )}
                                    {member.id !== contactId && (
                                        <Link to={`/contacts/${member.id}`}>
                                            <Button variant="ghost" size="sm" className="text-xs h-7">
                                                <ExternalLink className="h-3 w-3 mr-1" /> View
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">
                        No household members yet. Add a member below to create a shared household.
                    </p>
                )}

                {/* Last generated invite link */}
                {lastMemberInviteLink && (
                    <div className="p-3 rounded-lg border bg-muted/50 space-y-2">
                        <Label className="text-xs font-medium">Invite Link (send via Gmail)</Label>
                        <div className="flex gap-2">
                            <code className="flex-1 p-2 bg-background rounded border text-xs break-all font-mono">
                                {lastMemberInviteLink}
                            </code>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    navigator.clipboard.writeText(lastMemberInviteLink);
                                    toast({ title: 'Copied!' });
                                }}
                            >
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Add Member Dialog */}
                <Dialog open={isAddMemberOpen} onOpenChange={(open) => {
                    setIsAddMemberOpen(open);
                    if (!open) {
                        setNewMemberName('');
                        setNewMemberEmail('');
                        setLastMemberInviteLink('');
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Household Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Household Member</DialogTitle>
                            <DialogDescription>
                                Add a family member who shares the same fridge. They'll get their own protocol and login.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Name *</Label>
                                <Input
                                    value={newMemberName}
                                    onChange={e => setNewMemberName(e.target.value)}
                                    placeholder="e.g. Gloria Thompson"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Email (for invite link)</Label>
                                <Input
                                    type="email"
                                    value={newMemberEmail}
                                    onChange={e => setNewMemberEmail(e.target.value)}
                                    placeholder="e.g. gloria@gmail.com"
                                />
                                <p className="text-xs text-muted-foreground">
                                    If provided, an invite link will be generated automatically.
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={handleAddHouseholdMember}
                                disabled={!newMemberName.trim() || addHouseholdMember.isPending || inviteHouseholdMember.isPending}
                            >
                                {addHouseholdMember.isPending ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
                                ) : (
                                    <><Plus className="h-4 w-4 mr-2" /> Add Member</>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </AccordionContent>
        </AccordionItem>
    );
}
