
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
import { Plus, Trash2, PieChart, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useOrders } from '@/hooks/use-orders';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, CreditCard } from 'lucide-react';

export default function Finance() {
    const { data: expenses, isLoading: expensesLoading } = useExpenses();
    const { data: orders, isLoading: ordersLoading } = useOrders(); // Fetch all orders to find unpaids
    const createExpense = useCreateExpense();
    const deleteExpense = useDeleteExpense();
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        category: 'operating' as ExpenseCategory,
        amount: '',
        description: '',
        recipient: '',
        payment_method: 'credit_card'
    });

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
                            <CardTitle className="text-sm font-medium capitalise">{cat}</CardTitle>
                            <PieChart className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${amount.toFixed(2)}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Unpaid Invoices Section */}
            {unpaidOrders && unpaidOrders.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            Unpaid Invoices
                        </CardTitle>
                        <CardDescription>Pending payments for inventory orders.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
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
