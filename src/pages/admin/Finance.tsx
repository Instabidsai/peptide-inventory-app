
import { useState } from 'react';
import { useExpenses, useCreateExpense, useDeleteExpense, ExpenseCategory } from '@/hooks/use-expenses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { Plus, Trash2, PieChart, TrendingDown, ArrowRight, AlertCircle, CreditCard, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useOrders, useRecordOrderPayment } from '@/hooks/use-orders';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { useFinancialMetrics } from '@/hooks/use-financials';

export default function Finance() {
    const { data: expenses, isLoading: expensesLoading } = useExpenses();
    const { data: orders, isLoading: ordersLoading } = useOrders();
    const { data: financials } = useFinancialMetrics();
    const createExpense = useCreateExpense();
    const deleteExpense = useDeleteExpense();
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Bulk Payment State
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [isBulkPayOpen, setIsBulkPayOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        category: 'operating' as ExpenseCategory,
        amount: '',
        description: '',
        recipient: '',
        payment_method: 'credit_card'
    });

    // Bulk Payment Form State
    const [bulkPayData, setBulkPayData] = useState({
        date: new Date().toISOString().split('T')[0],
        method: 'wire',
        note: ''
    });

    // Batch Payment State
    const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
    const [batchPayAmount, setBatchPayAmount] = useState('');

    const toggleOrderSelection = (id: string) => {
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedOrders(newSelected);
    };

    const handleSelectAll = (checked: boolean, allIds: string[]) => {
        if (checked) {
            setSelectedOrders(new Set(allIds));
        } else {
            setSelectedOrders(new Set());
        }
    };

    const recordPayment = useRecordOrderPayment();

    // ... logic ...

    const handleBulkSubmit = async () => {
        const ordersToPay = orders?.filter(o => selectedOrders.has(o.id)) || [];

        for (const order of ordersToPay) {
            const totalCost = (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
            const paid = order.amount_paid || 0;
            const due = totalCost - paid;

            if (due > 0.01) {
                await recordPayment.mutateAsync({
                    orderId: order.id,
                    amount: due,
                    method: bulkPayData.method,
                    date: bulkPayData.date,
                    note: bulkPayData.note || 'Bulk Payment',
                    isFullPayment: true
                });
            }
        }
        setIsBulkPayOpen(false);
        setSelectedOrders(new Set());
        setBulkPayData({ ...bulkPayData, note: '' });
    };

    // Calculate total for selected
    const selectedTotal = orders?.filter(o => selectedOrders.has(o.id)).reduce((sum, o) => {
        const cost = (o.quantity_ordered * (o.estimated_cost_per_unit || 0));
        return sum + (cost - (o.amount_paid || 0));
    }, 0) || 0;

    // ... existing submit ...

    const handleSubmit = async () => {
        await createExpense.mutateAsync({
            ...formData,
            amount: Number(formData.amount),
            status: 'paid'
        });
        setIsAddOpen(false);
        setFormData({ ...formData, amount: '', description: '', recipient: '' });
    };

    if (expensesLoading || ordersLoading) return <div className="p-8">Loading financials...</div>;

    // Calc Expenses
    const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
    const categoryTotals = expenses?.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
        return acc;
    }, {} as Record<string, number>);

    // Calc Liabilities (Unpaid Orders)
    const unpaidOrders = orders?.filter(o => o.status !== 'cancelled' && o.payment_status !== 'paid');
    const totalLiabilities = unpaidOrders?.reduce((sum, o) => {
        const cost = (o.quantity_ordered * (o.estimated_cost_per_unit || 0));
        const paid = o.amount_paid || 0;
        return sum + (cost - paid);
    }, 0) || 0;

    // Group By Batch (Purchase Orders)
    const batches = orders?.reduce((acc, order) => {
        if (order.status === 'cancelled') return acc;

        const batchId = order.order_group_id || 'Unassigned';
        if (!acc[batchId]) {
            acc[batchId] = { id: batchId, total: 0, paid: 0, due: 0, orders: [] };
        }

        const cost = (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
        const paid = order.amount_paid || 0;

        acc[batchId].total += cost;
        acc[batchId].paid += paid;
        acc[batchId].due += (cost - paid);
        acc[batchId].orders.push(order);

        return acc;
    }, {} as Record<string, { id: string, total: number, paid: number, due: number, orders: typeof orders }>) || {};

    const handleBatchPayment = async () => {
        if (!selectedBatch || !batchPayAmount) return;

        const batch = batches[selectedBatch];
        let remainingAmount = Number(batchPayAmount);

        // Sort orders by due amount (smallest first? or oldest first? let's do oldest created_at)
        // actually, standard accounting might strictly apply to specific invoices, but here we just want to burn down the "pool".
        // Let's iterate through unpaid orders in the batch.

        const unpaidInBatch = batch.orders
            .filter(o => (o.quantity_ordered * (o.estimated_cost_per_unit || 0)) - (o.amount_paid || 0) > 0.01)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        for (const order of unpaidInBatch) {
            if (remainingAmount <= 0) break;

            const cost = (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
            const alreadyPaid = order.amount_paid || 0;
            const due = cost - alreadyPaid;

            const payAmount = Math.min(remainingAmount, due);

            await recordPayment.mutateAsync({
                orderId: order.id,
                amount: payAmount,
                method: 'wire', // Default or add selector
                date: new Date().toISOString().split('T')[0],
                note: `Batch Payment: ${selectedBatch}`,
                isFullPayment: Math.abs(payAmount - due) < 0.01
            });

            remainingAmount -= payAmount;
        }

        setSelectedBatch(null);
        setBatchPayAmount('');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Financials</h1>
                    <p className="text-muted-foreground">Track expenses, supplier payments, and overhead.</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" /> Add Expense
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Expense</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Date</Label>
                                    <Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Category</Label>
                                    <Select value={formData.category} onValueChange={(v: any) => setFormData({ ...formData, category: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="startup">Startup Cost</SelectItem>
                                            <SelectItem value="operating">Operating Expense</SelectItem>
                                            <SelectItem value="inventory">Inventory Purchase</SelectItem>
                                            <SelectItem value="commission">Commission Payout</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Amount ($)</Label>
                                <Input type="number" placeholder="0.00" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Recipient / Supplier</Label>
                                <Input placeholder="e.g. Amazon, PeptideDirect..." value={formData.recipient} onChange={e => setFormData({ ...formData, recipient: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input placeholder="What was this for?" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Payment Method</Label>
                                <Select value={formData.payment_method} onValueChange={v => setFormData({ ...formData, payment_method: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="credit_card">Credit Card</SelectItem>
                                        <SelectItem value="wire">Wire Transfer</SelectItem>
                                        <SelectItem value="cash">Cash / Zelle</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button className="w-full mt-4" onClick={handleSubmit}>Record Expense</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalExpenses.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">All time spending</p>
                    </CardContent>
                </Card>

                {/* Accounts Payable / Liabilities */}
                <Card className="border-l-4 border-l-amber-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Accounts Payable</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalLiabilities.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Unpaid inventory orders</p>
                    </CardContent>
                </Card>

                {/* Category Breakdowns */}
                {Object.entries(categoryTotals || {}).slice(0, 2).map(([cat, amount]) => (
                    <Card key={cat}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium capitalize">{cat}</CardTitle>
                            <PieChart className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
                        </CardContent>
                    </Card>
                ))}

                {/* Commission Liability Card */}
                <Card className="border-l-4 border-l-purple-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Commission Liability</CardTitle>
                        <Users className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${((financials?.commissionsOwed ?? 0) + (financials?.commissionsApplied ?? 0)).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">Pending + applied commissions</p>
                        {(financials?.commissionsPaid ?? 0) > 0 && (
                            <p className="text-xs text-green-500 mt-1">
                                ${(financials?.commissionsPaid ?? 0).toFixed(2)} already paid out
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Purchase Orders / Batches */}
            <h2 className="text-xl font-semibold mt-8 mb-4">Purchase Orders</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.values(batches).map(batch => (
                    <Card key={batch.id} className={batch.due > 0 ? 'border-l-4 border-l-blue-500' : 'opacity-70'}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-lg">{batch.id}</CardTitle>
                                    <CardDescription>{batch.orders.length} items</CardDescription>
                                </div>
                                <Badge variant={batch.due > 0.01 ? 'default' : 'secondary'}>
                                    {batch.due > 0.01 ? 'Open' : 'Paid'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1 mb-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="font-medium">${batch.total.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Paid:</span>
                                    <span className="font-medium text-green-600">${batch.paid.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Due:</span>
                                    <span className="font-bold text-amber-600">${batch.due.toFixed(2)}</span>
                                </div>
                            </div>

                            {batch.due > 0.01 && (
                                <Dialog open={selectedBatch === batch.id} onOpenChange={(open) => setSelectedBatch(open ? batch.id : null)}>
                                    <DialogTrigger asChild>
                                        <Button className="w-full" variant="outline">Make Payment</Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Pay towards {batch.id}</DialogTitle>
                                            <CardDescription>
                                                Apply a lump sum payment to this batch. The system will distribute it order-by-order.
                                            </CardDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label>Payment Amount ($)</Label>
                                                <Input
                                                    type="number"
                                                    value={batchPayAmount}
                                                    onChange={e => setBatchPayAmount(e.target.value)}
                                                    placeholder={`Max: ${batch.due.toFixed(2)}`}
                                                />
                                            </div>
                                            <Button onClick={handleBatchPayment} className="w-full">
                                                Confirm Payment
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </CardContent>
                    </Card>
                ))}
                {Object.keys(batches).length === 0 && (
                    <div className="col-span-full text-center p-8 border border-dashed rounded-lg text-muted-foreground">
                        No purchase orders found.
                    </div>
                )}
            </div>

            {/* Unpaid Invoices Section */}
            {unpaidOrders && unpaidOrders.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/10">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                Unpaid Invoices
                            </CardTitle>
                            <CardDescription>Pending payments for inventory orders.</CardDescription>
                        </div>
                        {selectedOrders.size > 0 && (
                            <Button onClick={() => setIsBulkPayOpen(true)} className="bg-green-600 hover:bg-green-700 text-white shadow-sm">
                                Pay Selected ({selectedOrders.size}) - ${selectedTotal.toFixed(2)}
                            </Button>
                        )}

                        <Dialog open={isBulkPayOpen} onOpenChange={setIsBulkPayOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Bulk Payment</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Payment Date</Label>
                                        <Input type="date" value={bulkPayData.date} onChange={e => setBulkPayData({ ...bulkPayData, date: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Payment Method</Label>
                                        <Select value={bulkPayData.method} onValueChange={v => setBulkPayData({ ...bulkPayData, method: v })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="wire">Wire Transfer</SelectItem>
                                                <SelectItem value="credit_card">Credit Card</SelectItem>
                                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                                <SelectItem value="cash">Cash</SelectItem>
                                                <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Note / Reference</Label>
                                        <Input placeholder="Batch Payment Ref..." value={bulkPayData.note} onChange={e => setBulkPayData({ ...bulkPayData, note: e.target.value })} />
                                    </div>
                                    <div className="pt-2 text-sm text-muted-foreground">
                                        Paying <strong>{selectedOrders.size}</strong> orders for a total of <strong>${selectedTotal.toFixed(2)}</strong>.
                                    </div>
                                    <Button className="w-full mt-2" onClick={handleBulkSubmit}>Confirm Payment</Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[30px]">
                                        <Checkbox
                                            checked={selectedOrders.size === unpaidOrders.length && unpaidOrders.length > 0}
                                            onCheckedChange={(c) => handleSelectAll(!!c, unpaidOrders.map(o => o.id))}
                                        />
                                    </TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead>Total Cost</TableHead>
                                    <TableHead>Paid So Far</TableHead>
                                    <TableHead>Balance Due</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {unpaidOrders.map(order => {
                                    const totalCost = (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
                                    const paid = order.amount_paid || 0;
                                    const due = totalCost - paid;

                                    return (
                                        <TableRow key={order.id}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedOrders.has(order.id)}
                                                    onCheckedChange={() => toggleOrderSelection(order.id)}
                                                />
                                            </TableCell>
                                            <TableCell>{format(new Date(order.order_date), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="font-medium">{order.supplier || 'Unknown'}</TableCell>
                                            <TableCell>{order.quantity_ordered}x {order.peptides?.name}</TableCell>
                                            <TableCell>${totalCost.toFixed(2)}</TableCell>
                                            <TableCell>${paid.toFixed(2)}</TableCell>
                                            <TableCell className="font-bold text-amber-600">${due.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="outline" asChild>
                                                    <Link to={`/orders?status=pending`}>
                                                        Pay Now <ArrowRight className="ml-2 h-3 w-3" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Expenses Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Recipient</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {expenses?.map((expense) => (
                                <TableRow key={expense.id}>
                                    <TableCell>{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="capitalize">{expense.category}</Badge>
                                    </TableCell>
                                    <TableCell>{expense.recipient}</TableCell>
                                    <TableCell className="text-muted-foreground">{expense.description}</TableCell>
                                    <TableCell className="capitalize text-xs">{expense.payment_method?.replace('_', ' ')}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        ${expense.amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteExpense.mutate(expense.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {expenses?.length === 0 && (
                                <TableRow><TableCell colSpan={7} className="text-center py-8">No expenses recorded yet.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
