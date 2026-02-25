import { useState } from 'react';
import { usePageTitle } from '@/hooks/use-page-title';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    useContacts,
    useCreateContact,
    useUpdateContact,
    useDeleteContact,
    type Contact,
    type ContactType,
} from '@/hooks/use-contacts';
import { useReps } from '@/hooks/use-profiles'; // NEW: Import useReps
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { QueryError } from '@/components/ui/query-error';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Users, Search, Filter, Briefcase, Download } from 'lucide-react';
import { format } from 'date-fns';
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
  usePageTitle('Contacts');
  const navigate = useNavigate();
  const { userRole, profile: authProfile } = useAuth();
  const isMobile = useIsMobile();
  const [typeFilter, setTypeFilter] = useState<ContactType | undefined>();
  const { data: contacts, isLoading, isError, refetch } = useContacts(typeFilter);
  const { data: reps } = useReps(); // Fetch reps

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [searchQuery, setSearchQuery] = useState('');
  const [repFilter, setRepFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);

  const isSalesRep = userRole?.role === 'sales_rep' || authProfile?.role === 'sales_rep';
  const isAdmin = userRole?.role === 'admin' || userRole?.role === 'staff';
  const canEdit = isAdmin || isSalesRep;
  const canDelete = userRole?.role === 'admin';

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', phone: '', type: 'customer', company: '', address: '', notes: '', assigned_rep_id: '' },
  });

  const filteredContacts = contacts?.filter((c) => {
    // Text search
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.assigned_rep?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());

    // Rep filter
    const matchesRep = repFilter === 'all' ||
      (repFilter === 'unassigned' ? !c.assigned_rep_id : c.assigned_rep_id === repFilter);

    // Source filter
    const matchesSource = sourceFilter === 'all' || c.source === sourceFilter;

    return matchesSearch && matchesRep && matchesSource;
  });

  const handleCreate = async (data: ContactFormData) => {
    // For sales_rep: always customer type, auto-assign to self
    const assignedRepId = isSalesRep
      ? (authProfile?.id || null)
      : ((!data.assigned_rep_id || data.assigned_rep_id === 'none') ? null : data.assigned_rep_id);

    try {
      await createContact.mutateAsync({
        name: data.name,
        type: isSalesRep ? 'customer' : data.type,
        email: data.email || undefined,
        phone: data.phone,
        company: data.company,
        address: data.address,
        notes: data.notes,
        assigned_rep_id: assignedRepId,
      });
      setIsCreateOpen(false);
      form.reset();
    } catch { /* onError in hook shows toast */ }
  };

  const handleEdit = async (data: ContactFormData) => {
    if (!editingContact) return;

    // Convert empty string or 'none' to null for UUID field
    const assignedRepId = (!data.assigned_rep_id || data.assigned_rep_id === 'none') ? null : data.assigned_rep_id;

    try {
      await updateContact.mutateAsync({
        id: editingContact.id,
        ...data,
        email: data.email || undefined,
        address: data.address,
        assigned_rep_id: assignedRepId,
      });
      setEditingContact(null);
      form.reset();
    } catch { /* onError in hook shows toast */ }
  };

  const handleDelete = async () => {
    if (!deletingContact) return;
    try {
      await deleteContact.mutateAsync(deletingContact.id);
      setDeletingContact(null);
    } catch { /* onError in hook shows toast */ }
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
    // Proper CSV escaping: wrap in quotes if contains comma, quote, or newline
    const esc = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const headers = ['Name', 'Type', 'Email', 'Phone', 'Company', 'Address', 'Assigned Rep', 'Orders', 'Notes'];
    const rows = filteredContacts.map(c => [
      esc(c.name || ''),
      c.type,
      esc(c.email || ''),
      esc(c.phone || ''),
      esc(c.company || ''),
      esc(c.address || ''),
      esc(c.assigned_rep?.full_name || ''),
      String(c.sales_orders?.length || 0),
      esc(c.notes || ''),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) form.reset(); }}>
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
                  {/* Type + Rep — admin only */}
                  {isAdmin && (
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
                  )}

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

      <Card className="bg-card border-border/60">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search contacts"
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
            <Select
              value={sourceFilter}
              onValueChange={setSourceFilter}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="woocommerce">Website</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && reps && reps.length > 0 && (
              <Select
                value={repFilter}
                onValueChange={setRepFilter}
              >
                <SelectTrigger className="w-[160px]">
                  <Briefcase className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="All Reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reps</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {reps.map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.full_name || 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryError message="Failed to load contacts." onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredContacts?.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-muted-foreground">No contacts found</p>
              <p className="text-sm text-muted-foreground/70">Add your first customer or partner</p>
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {filteredContacts?.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                >
                  <Card
                    className="cursor-pointer hover:bg-accent/30 hover:shadow-card hover:border-border/80 transition-all"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-1.5">
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.email || contact.phone || 'No contact info'}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {contact.source === 'woocommerce' && (
                            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">Website</Badge>
                          )}
                          <Badge variant={typeColors[contact.type]} className="text-xs">{typeLabels[contact.type]}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {contact.company && <span>{contact.company}</span>}
                        {(() => {
                          const count = contact.sales_orders?.length || 0;
                          return count > 0 ? <span>{count} order{count !== 1 ? 's' : ''}</span> : null;
                        })()}
                        {contact.assigned_rep?.full_name && (
                          <span className="flex items-center gap-0.5 text-blue-500"><Briefcase className="h-3 w-3" />{contact.assigned_rep.full_name}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Assigned Rep</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts?.map((contact, index) => (
                  <motion.tr
                    key={contact.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }}
                    className="border-b transition-colors cursor-pointer hover:bg-muted/50 data-[state=selected]:bg-muted"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>
                      <Badge variant={typeColors[contact.type]}>
                        {typeLabels[contact.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {contact.source === 'woocommerce' ? (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                          Website
                        </Badge>
                      ) : contact.source === 'import' ? (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          Import
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Manual</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.assigned_rep?.full_name ? (
                        <div className="flex items-center gap-1 text-sm text-blue-600">
                          <Briefcase className="h-3 w-3" />
                          {contact.assigned_rep.full_name}
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
                        const count = contact.sales_orders?.length || 0;
                        return count > 0
                          ? <Badge variant="secondary" className="text-xs">{count}</Badge>
                          : <span className="text-muted-foreground text-xs">0</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(() => {
                        const orders = contact.sales_orders || [];
                        if (orders.length === 0) return '-';
                        const latest = orders.reduce((max, o) =>
                          new Date(o.created_at) > new Date(max.created_at) ? o : max
                        );
                        return format(new Date(latest.created_at), 'MMM d, yyyy');
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
                            aria-label="Edit contact"
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
                            aria-label="Delete contact"
                            onClick={() => setDeletingContact(contact)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
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
              {/* Type + Rep — admin only */}
              {isAdmin && (
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
              )}
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
              disabled={deleteContact.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContact.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
