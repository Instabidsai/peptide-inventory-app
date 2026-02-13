import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact, type Contact, type ContactType } from '@/hooks/use-contacts';
import { useReps } from '@/hooks/use-profiles'; // NEW: Import useReps
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Users, Search, Filter, Briefcase, Download } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  type: z.enum(['customer', 'partner', 'internal']).default('customer'),
  company: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  assigned_rep_id: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const typeLabels: Record<ContactType, string> = {
  customer: 'Customer',
  partner: 'Partner',
  internal: 'Internal',
};

const typeColors: Record<ContactType, 'default' | 'secondary' | 'outline'> = {
  customer: 'default',
  partner: 'secondary',
  internal: 'outline',
};

export default function Contacts() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [typeFilter, setTypeFilter] = useState<ContactType | undefined>();
  const { data: contacts, isLoading } = useContacts(typeFilter);
  const { data: reps } = useReps(); // Fetch reps

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);

  const canEdit = userRole?.role === 'admin' || userRole?.role === 'staff';
  const canDelete = userRole?.role === 'admin';

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', phone: '', type: 'customer', company: '', address: '', notes: '', assigned_rep_id: '' },
  });

  const filteredContacts = contacts?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    // Search by Assigned Rep Name too
    (c as any).assigned_rep?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = async (data: ContactFormData) => {
    // Convert empty string or 'none' to null for UUID field
    const assignedRepId = (!data.assigned_rep_id || data.assigned_rep_id === 'none') ? null : data.assigned_rep_id;

    await createContact.mutateAsync({
      name: data.name,
      type: data.type,
      email: data.email || undefined,
      phone: data.phone,
      company: data.company,
      address: data.address,
      notes: data.notes,
      assigned_rep_id: assignedRepId,
    });
    setIsCreateOpen(false);
    form.reset();
  };

  const handleEdit = async (data: ContactFormData) => {
    if (!editingContact) return;

    // Convert empty string or 'none' to null for UUID field
    const assignedRepId = (!data.assigned_rep_id || data.assigned_rep_id === 'none') ? null : data.assigned_rep_id;

    await updateContact.mutateAsync({
      id: editingContact.id,
      ...data,
      email: data.email || undefined,
      address: data.address,
      assigned_rep_id: assignedRepId,
    });
    setEditingContact(null);
    form.reset();
  };

  const handleDelete = async () => {
    if (!deletingContact) return;
    await deleteContact.mutateAsync(deletingContact.id);
    setDeletingContact(null);
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    form.reset({
      name: contact.name,
      email: contact.email || '',
      phone: contact.phone || '',
      type: contact.type,
      company: contact.company || '',
      address: contact.address || '',
      notes: contact.notes || '',
      assigned_rep_id: contact.assigned_rep_id || 'none',
    });
  };

  const exportContactsCSV = () => {
    if (!filteredContacts || filteredContacts.length === 0) return;
    const headers = ['Name', 'Type', 'Email', 'Phone', 'Company', 'Address', 'Assigned Rep', 'Orders', 'Notes'];
    const rows = filteredContacts.map(c => [
      (c.name || '').replace(/,/g, ''),
      c.type,
      c.email || '',
      c.phone || '',
      (c.company || '').replace(/,/g, ''),
      (c.address || '').replace(/,/g, ' ').replace(/\n/g, ' '),
      (c as any).assigned_rep?.full_name || '',
      String((c as any).sales_orders?.length || 0),
      (c.notes || '').replace(/,/g, ' ').replace(/\n/g, ' '),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">Manage customers and partners</p>
        </div>
        <div className="flex gap-2">
          {filteredContacts && filteredContacts.length > 0 && (
            <Button variant="outline" onClick={exportContactsCSV}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          )}
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Contact</DialogTitle>
                <DialogDescription>Create a new customer or partner</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="customer">Customer</SelectItem>
                              <SelectItem value="partner">Partner</SelectItem>
                              <SelectItem value="internal">Internal</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="assigned_rep_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned Sales Rep</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || 'none'}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {reps?.map(rep => (
                                <SelectItem key={rep.id} value={rep.id}>
                                  {rep.full_name || 'Unnamed Rep'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 555-1234" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shipping Address (optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="123 Main St, City, State ZIP" rows={2} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Additional notes..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createContact.isPending}>
                      Create Contact
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter || 'all'}
              onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : v as ContactType)}
            >
              <SelectTrigger className="w-[140px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="partner">Partners</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredContacts?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No contacts found</p>
              <p className="text-sm">Add your first customer or partner</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Assigned Rep</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts?.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>
                      <Badge variant={typeColors[contact.type]}>
                        {typeLabels[contact.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(contact as any).assigned_rep?.full_name ? (
                        <div className="flex items-center gap-1 text-sm text-blue-600">
                          <Briefcase className="h-3 w-3" />
                          {(contact as any).assigned_rep.full_name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.phone || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const count = (contact as any).sales_orders?.length || 0;
                        return count > 0
                          ? <Badge variant="secondary" className="text-xs">{count}</Badge>
                          : <span className="text-muted-foreground text-xs">0</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.company || '-'}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(contact)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingContact(contact)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingContact} onOpenChange={() => setEditingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update contact details</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                          <SelectItem value="internal">Internal</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="assigned_rep_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned Sales Rep</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || 'none'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {reps?.map(rep => (
                            <SelectItem key={rep.id} value={rep.id}>
                              {rep.full_name || 'Unnamed Rep'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Main St, City, State ZIP" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateContact.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingContact} onOpenChange={() => setDeletingContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingContact?.name}"?
              Movements associated with this contact will remain but lose the contact reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
