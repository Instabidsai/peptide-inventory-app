import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit } from 'lucide-react';
import type { Contact } from '@/hooks/use-contacts';
import { useUpdateContact } from '@/hooks/use-contacts';

interface ContactInfoCardProps {
    contact: Contact;
    contactId: string;
    children?: React.ReactNode;
}

export function ContactInfoCard({ contact, contactId, children }: ContactInfoCardProps) {
    const updateContact = useUpdateContact();
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', company: '', address: '' });

    return (
        <Card className="md:col-span-1 h-fit">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Details</CardTitle>
                <div className="flex gap-2">
                    {isEditingDetails ? (
                        <>
                            <Button size="sm" variant="ghost" onClick={() => setIsEditingDetails(false)}>Cancel</Button>
                            <Button size="sm" onClick={() => {
                                updateContact.mutate({
                                    id: contactId,
                                    name: editForm.name,
                                    email: editForm.email,
                                    phone: editForm.phone,
                                    company: editForm.company,
                                    address: editForm.address
                                });
                                setIsEditingDetails(false);
                            }}>Save</Button>
                        </>
                    ) : (
                        <Button variant="ghost" size="icon" aria-label="Edit contact details" onClick={() => {
                            setEditForm({
                                name: contact.name || '',
                                email: contact.email || '',
                                phone: contact.phone || '',
                                company: contact.company || '',
                                address: contact.address || ''
                            });
                            setIsEditingDetails(true);
                        }}>
                            <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {isEditingDetails ? (
                    <div className="space-y-3">
                        <div className="grid gap-1">
                            <Label>Name</Label>
                            <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                            <Label>Email</Label>
                            <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                            <Label>Phone</Label>
                            <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                            <Label>Company</Label>
                            <Input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} />
                        </div>
                        <div className="grid gap-1">
                            <Label>Address</Label>
                            <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Enter address..." />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Email:</span>
                            {contact.email || 'N/A'}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Phone:</span>
                            {contact.phone || 'N/A'}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Company:</span>
                            {contact.company || 'N/A'}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Address:</span>
                            {contact.address || 'N/A'}
                        </div>
                    </>
                )}
            </CardContent>
            {children && (
                <div className="flex gap-2">
                    {children}
                </div>
            )}
        </Card>
    );
}
