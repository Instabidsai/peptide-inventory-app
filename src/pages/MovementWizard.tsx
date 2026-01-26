import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useBottles, type Bottle } from '@/hooks/use-bottles';
import { useContacts } from '@/hooks/use-contacts';
import { useCreateMovement, type MovementType } from '@/hooks/use-movements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Check, X, Search, ShoppingCart } from 'lucide-react';

const movementTypes: { value: MovementType; label: string; description: string }[] = [
  { value: 'sale', label: 'Sale', description: 'Sell bottles to a customer' },
  { value: 'giveaway', label: 'Giveaway', description: 'Give bottles at cost or free' },
  { value: 'internal_use', label: 'Internal Use', description: 'Use for testing or samples' },
  { value: 'loss', label: 'Loss/Damage', description: 'Record lost or damaged bottles' },
  { value: 'return', label: 'Return', description: 'Bottles returned by customer' },
];

interface SelectedBottle {
  bottle: Bottle;
  price: number;
}

export default function MovementWizard() {
  const navigate = useNavigate();
  const { data: bottles } = useBottles({ status: 'in_stock' });
  const { data: contacts } = useContacts();
  const createMovement = useCreateMovement();

  const [step, setStep] = useState(1);
  const [movementType, setMovementType] = useState<MovementType | null>(null);
  const [contactId, setContactId] = useState<string>('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string>('unpaid');
  const [amountPaid, setAmountPaid] = useState<string>('0');
  const [selectedBottles, setSelectedBottles] = useState<SelectedBottle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [bottleProtocolMap, setBottleProtocolMap] = useState<Record<string, string>>({});
  const [extraItems, setExtraItems] = useState<{ id: string, description: string, price: number }[]>([]);

  const location = useLocation();

  // Handle Prefill from Requests
  useEffect(() => {
    const state = location.state as any;
    if (state?.prefill && bottles && contacts) {
      const { type, email, peptideId, quantity, notes: prefillNotes } = state.prefill;

      // 1. Set Basic Fields
      if (type) setMovementType(type);
      if (prefillNotes) setNotes(prev => prev ? prev : prefillNotes);

      // 2. Resolve Contact
      if (email) {
        const contact = contacts.find(c => c.email?.toLowerCase() === email.toLowerCase());
        if (contact) setContactId(contact.id);
      }

      // 3. Auto-select Bottles
      if (peptideId && quantity > 0) {
        // Find matching bottles
        const matchingBottles = bottles.filter(b => b.lots?.peptide_id === peptideId);
        // Take up to requested quantity
        const toSelect = matchingBottles.slice(0, quantity);

        if (toSelect.length > 0) {
          const selection = toSelect.map(b => {
            const msrp = b.lots?.peptides?.retail_price;
            const cost = Number(b.lots?.cost_per_unit || 0);
            return {
              bottle: b,
              price: msrp && msrp > 0 ? msrp : cost
            };
          });
          setSelectedBottles(selection);
        }
      }

      // Clear state so it doesn't re-run or persist weirdly
      // Actually, we don't clear it here or we lose it on re-renders, 
      // but we rely on the dependencies not changing too much. 
      // Ideally rely on a flag or just let it be.
    }
  }, [location.state, bottles, contacts]);

  // NEW: Fetch contact's protocols and protocol items
  const { data: contactProtocols } = useQuery({
    queryKey: ['contact-protocols', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('protocols')
        .select(`
          id,
          name,
          protocol_items(
            id,
            peptides(id, name)
          )
        `)
        .eq('contact_id', contactId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId
  });

  const filteredBottles = bottles?.filter((b) =>
    b.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.lots?.peptides?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isBottleSelected = (id: string) => selectedBottles.some((sb) => sb.bottle.id === id);

  const toggleBottle = (bottle: Bottle) => {
    if (isBottleSelected(bottle.id)) {
      setSelectedBottles(selectedBottles.filter((sb) => sb.bottle.id !== bottle.id));
    } else {
      const msrp = bottle.lots?.peptides?.retail_price;
      const cost = Number(bottle.lots?.cost_per_unit || 0);
      setSelectedBottles([
        ...selectedBottles,
        { bottle, price: msrp && msrp > 0 ? msrp : cost },
      ]);
    }
  };

  const updatePrice = (bottleId: string, price: number) => {
    setSelectedBottles(
      selectedBottles.map((sb) =>
        sb.bottle.id === bottleId ? { ...sb, price } : sb
      )
    );
  };

  const removeBottle = (bottleId: string) => {
    setSelectedBottles(selectedBottles.filter((sb) => sb.bottle.id !== bottleId));
  };

  const totalCost = selectedBottles.reduce(
    (sum, sb) => sum + Number(sb.bottle.lots?.cost_per_unit || 0),
    0
  );
  const extraPrice = extraItems.reduce((sum, item) => sum + item.price, 0);
  const totalPrice = selectedBottles.reduce((sum, sb) => sum + sb.price, 0) + extraPrice;

  const canProceedStep1 = movementType !== null;
  const canProceedStep2 = selectedBottles.length > 0 || extraItems.length > 0;
  const canSubmit = canProceedStep1 && canProceedStep2;

  const handleSubmit = async () => {
    const allItems = [
      ...selectedBottles.map((sb) => ({
        bottle_id: sb.bottle.id,
        price_at_sale: sb.price,
        protocol_item_id: bottleProtocolMap[sb.bottle.id] || undefined,
      })),
      ...extraItems.map((ei) => ({
        description: ei.description,
        price_at_sale: ei.price
      }))
    ];

    await createMovement.mutateAsync({
      type: movementType,
      contact_id: contactId || undefined,
      movement_date: movementDate,
      notes: notes || undefined,
      items: allItems,
      payment_status: paymentStatus as any,
      amount_paid: parseFloat(amountPaid) || 0,
      payment_date: paymentStatus === 'paid' || paymentStatus === 'partial' ? new Date().toISOString() : undefined
    });

    navigate('/movements');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/movements')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Record Movement</h1>
          <p className="text-muted-foreground">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'
              }`}
          />
        ))}
      </div>

      {/* Step 1: Type & Details */}
      {step === 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Movement Type</CardTitle>
            <CardDescription>Select the type of movement you want to record</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {movementTypes.map((type) => (
                <div
                  key={type.value}
                  onClick={() => setMovementType(type.value)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${movementType === type.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                    }`}
                >
                  <p className="font-medium">{type.label}</p>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Contact (optional)</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.company && `(${c.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Movement Date</Label>
                <Input
                  type="date"
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes about this movement..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Bottles */}
      {step === 2 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Select Bottles</CardTitle>
            <CardDescription>
              Choose bottles to include in this {movementType?.replace('_', ' ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by UID or peptide..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {selectedBottles.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-secondary/50 rounded-lg">
                {selectedBottles.map((sb) => (
                  <Badge key={sb.bottle.id} variant="secondary" className="gap-1">
                    {sb.bottle.uid}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeBottle(sb.bottle.id)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>UID</TableHead>
                    <TableHead>Peptide</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBottles?.map((bottle) => (
                    <TableRow
                      key={bottle.id}
                      className="cursor-pointer"
                      onClick={() => toggleBottle(bottle)}
                    >
                      <TableCell>
                        <Checkbox checked={isBottleSelected(bottle.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{bottle.uid}</TableCell>
                      <TableCell>{bottle.lots?.peptides?.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {bottle.lots?.lot_number}
                      </TableCell>
                      <TableCell>${Number(bottle.lots?.cost_per_unit || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-sm text-muted-foreground">
              {selectedBottles.length} bottle(s) selected
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Set Prices & Review */}
      {step === 3 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Review & Set Prices</CardTitle>
            <CardDescription>
              Set the sale price for each bottle (defaults to cost)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>Peptide</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Sale Price</TableHead>
                    <TableHead>Link to Regimen</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedBottles.map((sb) => {
                    const peptideId = sb.bottle.lots?.peptide_id;
                    const matchingProtocols = contactProtocols?.flatMap(p =>
                      (p.protocol_items || []).filter(item => item.peptides?.id === peptideId)
                        .map(item => ({ protocolName: p.name, item }))
                    ) || [];

                    return (
                      <TableRow key={sb.bottle.id}>
                        <TableCell className="font-mono text-sm">{sb.bottle.uid}</TableCell>
                        <TableCell>{sb.bottle.lots?.peptides?.name}</TableCell>
                        <TableCell>${Number(sb.bottle.lots?.cost_per_unit || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={sb.price}
                            onChange={(e) => updatePrice(sb.bottle.id, Number(e.target.value))}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>
                          {contactId && matchingProtocols.length > 0 ? (
                            <Select
                              value={bottleProtocolMap[sb.bottle.id] || ''}
                              onValueChange={(val) => setBottleProtocolMap({
                                ...bottleProtocolMap,
                                [sb.bottle.id]: val
                              })}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Select regimen (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                {matchingProtocols.map(({ protocolName, item }) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {protocolName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {!contactId ? 'Select contact first' : 'No matching regimens'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeBottle(sb.bottle.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Extra Items / Charges */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Other Charges (Supplies, Mixing, etc.)</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExtraItems([...extraItems, { id: Math.random().toString(), description: 'Bacteriostatic Water', price: 5.00 }])}
                  >
                    + Add Water ($5)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExtraItems([...extraItems, { id: Math.random().toString(), description: 'Custom charge', price: 0 }])}
                  >
                    + Custom Item
                  </Button>
                </div>
              </div>

              {extraItems.length > 0 && (
                <div className="space-y-2">
                  {extraItems.map((item, idx) => (
                    <div key={item.id} className="flex gap-2 items-center">
                      <Input
                        value={item.description}
                        onChange={(e) => {
                          const newItems = [...extraItems];
                          newItems[idx].description = e.target.value;
                          setExtraItems(newItems);
                        }}
                        className="flex-1"
                        placeholder="Item name"
                      />
                      <div className="flex items-center gap-1 group">
                        <span className="text-sm text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={item.price}
                          onChange={(e) => {
                            const newItems = [...extraItems];
                            newItems[idx].price = Number(e.target.value);
                            setExtraItems(newItems);
                          }}
                          className="w-24"
                        />
                        <div className="hidden group-hover:flex gap-1 absolute right-[-80px]">
                          <Button size="xs" variant="ghost" onClick={() => {
                            const newItems = [...extraItems];
                            newItems[idx].price = 5;
                            setExtraItems(newItems);
                          }}>$5</Button>
                          <Button size="xs" variant="ghost" onClick={() => {
                            const newItems = [...extraItems];
                            newItems[idx].price = 10;
                            setExtraItems(newItems);
                          }}>$10</Button>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExtraItems(extraItems.filter((_, i) => i !== idx))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2 justify-end text-[10px] text-muted-foreground">
                    Quick adjust:
                    <button onClick={() => {
                      const newItems = [...extraItems];
                      newItems[newItems.length - 1].price = 5;
                      setExtraItems(newItems);
                    }} className="hover:text-primary">5</button>
                    <button onClick={() => {
                      const newItems = [...extraItems];
                      newItems[newItems.length - 1].price = 10;
                      setExtraItems(newItems);
                    }} className="hover:text-primary">10</button>
                    <button onClick={() => {
                      const newItems = [...extraItems];
                      newItems[newItems.length - 1].price = 15;
                      setExtraItems(newItems);
                    }} className="hover:text-primary">15</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between p-4 bg-secondary/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-lg font-semibold">${totalCost.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Price</p>
                <p className="text-lg font-semibold">${totalPrice.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Margin</p>
                <p className={`text-lg font-semibold ${totalPrice - totalCost >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  ${(totalPrice - totalCost).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(val) => {
                  setPaymentStatus(val);
                  if (val === 'paid') setAmountPaid(totalPrice.toString());
                  if (val === 'unpaid') setAmountPaid('0');
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="paid">Paid (Full)</SelectItem>
                    <SelectItem value="partial">Partial Payment</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount Paid ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  disabled={paymentStatus === 'unpaid' || paymentStatus === 'refunded'}
                />
              </div>
            </div>

            {notes && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm">{notes}</p>
              </div>
            )}
          </CardContent>
        </Card >
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 1 ? navigate('/movements') : setStep(step - 1))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canSubmit || createMovement.isPending}>
            <Check className="mr-2 h-4 w-4" />
            {createMovement.isPending ? 'Recording...' : 'Record Movement'}
          </Button>
        )}
      </div>
    </div >
  );
}
