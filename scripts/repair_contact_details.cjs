
const fs = require('fs');
const path = 'src/pages/ContactDetails.tsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = "function RegimenCard({ protocol, onDelete, onEdit,";
const endMarker = "function AddResourceForm";

// Find start
const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find markers: Start=" + startIndex + ", End=" + endIndex);
    process.exit(1);
}

const newCode = `function RegimenCard({ protocol, onDelete, onEdit, onLog, onAddSupplement, onDeleteSupplement, onAssignInventory, peptides, movements }: { protocol: any, onDelete: (id: string) => void, onEdit: () => void, onLog: (args: any) => void, onAddSupplement: (args: any) => Promise<void>, onDeleteSupplement: (id: string) => void, onAssignInventory: (id: string) => void, peptides: any[] | undefined, movements?: any[] }) {
    // Determine Status Logic
    const { latestMovement, statusColor, statusLabel } = useMemo(() => {
        if (!movements || !protocol.protocol_items?.[0]) return { latestMovement: null, statusColor: 'hidden', statusLabel: 'No History' };

        const peptideId = protocol.protocol_items[0].peptide_id;

        const relevant = movements.filter(m =>
            m.movement_items?.some((item: any) => {
                const lot = item.bottles?.lots;
                return lot?.peptide_id === peptideId || lot?.peptides?.id === peptideId;
            })
        );

        if (relevant.length === 0) return { latestMovement: null, statusColor: 'hidden', statusLabel: 'No Orders' };

        const latest = relevant[0];
        let color = 'bg-gray-100 text-gray-800 border-gray-200';
        let label = latest.payment_status;

        if (latest.type === 'giveaway') {
            color = 'bg-purple-100 text-purple-800 border-purple-200';
            label = 'Giveaway';
        } else {
            if (latest.payment_status === 'paid') color = 'bg-green-100 text-green-800 border-green-200';
            if (latest.payment_status === 'unpaid') color = 'bg-amber-100 text-amber-800 border-amber-200';
            if (latest.payment_status === 'partial') color = 'bg-blue-100 text-blue-800 border-blue-200';
        }

        return { latestMovement: latest, statusColor: color, statusLabel: label };
    }, [movements, protocol]);

    const lastSoldDetails = useMemo(() => {
        if (!latestMovement || !protocol.protocol_items?.[0]) return null;
        const peptideId = protocol.protocol_items[0].peptide_id;
        const item = latestMovement.movement_items?.find((i: any) => {
            const lot = i.bottles?.lots;
            return lot?.peptide_id === peptideId || lot?.peptides?.id === peptideId;
        });
        return {
            price: item?.price_at_sale || 0,
            lot: item?.bottles?.lots?.lot_number,
            date: latestMovement.movement_date
        };
    }, [latestMovement, protocol]);

    const totalCost = useMemo(() => {
        if (!protocol.protocol_items || !peptides) return 0;
        return protocol.protocol_items.reduce((acc: number, item: any) => {
            const peptide = peptides.find(p => p.id === item.peptide_id);
            if (!peptide) return acc;

            const amount = parseFloat(item.dosage_amount) || 0;
            const duration = item.duration_days || (item.duration_weeks * 7) || 0;
            const multiplier = parseFloat(item.cost_multiplier) || 1;
            const unit = item.dosage_unit || 'mg';

            let amountInMg = amount;
            if (unit === 'mcg') amountInMg = amount / 1000;

            let totalAmountNeededMg = amountInMg * duration;
            if (item.frequency === 'weekly') {
                totalAmountNeededMg = amountInMg * (duration / 7);
            } else if (item.frequency === 'bid') {
                totalAmountNeededMg = amountInMg * 2 * duration;
            } else if (item.frequency === 'biweekly') {
                totalAmountNeededMg = amountInMg * 2 * (duration / 7);
            }

            const parseVialSize = (name: string): number => {
                const match = name.match(/(\\d+(?:\\.\\d+)?)\\s*(mg|mcg|iu)/i);
                if (!match) return 5;
                const val = parseFloat(match[1]);
                const unit = match[2].toLowerCase();
                if (unit === 'mcg') return val / 1000;
                return val;
            };

            const vialSizeMg = parseVialSize(peptide.name);
            const vialsNeeded = Math.ceil(totalAmountNeededMg / vialSizeMg);
            const unitCost = peptide.avg_cost || 0;

            return acc + (vialsNeeded * unitCost * multiplier);
        }, 0);
    }, [protocol, peptides]);

    const [isAddSuppOpen, setIsAddSuppOpen] = useState(false);
    const returnToStock = useRestockInventory();
    const updateBottleQuantity = useUpdateBottleQuantity();
    const deleteMovement = useDeleteMovement(); 

    const { data: assignedBottles } = useQuery({
        queryKey: ['regimen-bottles', protocol.id, protocol.contact_id],
        queryFn: async () => {
            if (!protocol.contact_id) return [];

            const protocolItems = protocol.protocol_items || [];
            if (protocolItems.length === 0) return [];

            const { data, error } = await supabase
                .from('client_inventory')
                .select(\`
                    id,
                    peptide_id,
                    batch_number,
                    current_quantity_mg,
                    initial_quantity_mg,
                    movement_id,
                    created_at
                \`)
                .eq('contact_id', protocol.contact_id)
                .in('peptide_id', protocolItems.map((item: any) => item.peptide_id));

            if (error) throw error;
            return data || [];
        },
        enabled: !!protocol.contact_id
    });

    const supplyCalculations = useMemo(() => {
        if (!protocol.protocol_items || !assignedBottles) return [];

        return protocol.protocol_items.map((item: any) => {
            const itemBottles = assignedBottles.filter(
                (b: any) => b.peptide_id === item.peptide_id
            );

            return {
                protocolItem: item,
                supply: calculateSupply(item, itemBottles.map(b => ({
                    id: b.id,
                    uid: b.batch_number || 'Unknown',
                    batch_number: b.batch_number,
                    current_quantity_mg: b.current_quantity_mg,
                    initial_quantity_mg: b.initial_quantity_mg
                })))
            };
        });
    }, [protocol.protocol_items, assignedBottles]);

    return (
        <Card className={\`hover:border-primary/50 transition-colors cursor-pointer group flex flex-col h-full \${!latestMovement ? 'border-l-4 border-l-amber-400' : ''}\`} onClick={onEdit}>
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">{protocol.name}</CardTitle>
                        <CardDescription>{protocol.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={onEdit}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => {
                            if (window.confirm('Are you sure you want to delete this regimen? This will verify delete all logs and history.')) {
                                onDelete(protocol.id);
                            }
                        }}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {protocol.protocol_items?.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-muted rounded-lg md:flex-row flex-col gap-2 md:gap-0 items-start md:items-center">
                            <div className="flex items-center gap-3">
                                <div className="bg-primary/10 p-2 rounded-full">
                                    <FlaskConical className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <div className="font-semibold">{item.peptides?.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {item.dosage_amount}{item.dosage_unit} • {item.frequency} • {item.duration_days || (item.duration_weeks * 7)} days
                                    </div>
                                </div>
                            </div>
                            <Button size="sm" variant="secondary" className="w-full md:w-auto" onClick={(e) => { e.stopPropagation(); onLog({ itemId: item.id }); }}>
                                <CheckCircle2 className="mr-2 h-3 w-3" /> Log Dose
                            </Button>
                        </div>
                    ))}
                    {(!protocol.protocol_items || protocol.protocol_items.length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No peptides in this regimen.</p>
                    )}
                </div>

                <div className="pt-2" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                            <Pill className="h-3 w-3" /> Supplement Stack
                        </h4>
                        <Dialog open={isAddSuppOpen} onOpenChange={setIsAddSuppOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-6 text-xs">
                                    <Plus className="h-3 w-3 mr-1" /> Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Supplement</DialogTitle>
                                    <DialogDescription>Add a supporting supplement to this stack.</DialogDescription>
                                </DialogHeader>
                                <AddSupplementForm
                                    protocolId={protocol.id}
                                    onAdd={onAddSupplement}
                                    onCancel={() => setIsAddSuppOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        {protocol.protocol_supplements?.map((supp: any) => (
                            <div key={supp.id} className="relative group border rounded-md p-3 hover:bg-muted/50 transition-colors">
                                <div className="flex gap-3">
                                    {supp.supplements?.image_url ? (
                                        <img src={supp.supplements.image_url} className="h-10 w-10 rounded object-cover bg-muted" alt="" />
                                    ) : (
                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                            <Pill className="h-5 w-5 opacity-20" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-medium text-sm">{supp.supplements?.name || 'Unknown'}</div>
                                        <div className="text-xs text-muted-foreground">{supp.dosage} <span className="mx-1">•</span> {supp.frequency}</div>
                                        {supp.notes && <div className="text-[10px] text-muted-foreground mt-1 italic">"{supp.notes}"</div>}
                                    </div>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); onDeleteSupplement(supp.id); }}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-3 border-t grid gap-2">
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Inventory & Billing</span>
                        {latestMovement && (
                            <Badge
                                variant={latestMovement.status === 'active' ? 'default' : 'outline'}
                                className={latestMovement.status === 'active' ? 'bg-green-500' : 'border-amber-500 text-amber-600'}
                            >
                                <Package className="h-3 w-3 mr-1" />
                                {latestMovement.status === 'active' ? 'Has Inventory' : 'Needs Inventory'}
                            </Badge>
                        )}
                    </div>

                    {latestMovement ? (
                        <div className="bg-slate-50 p-2 rounded border text-sm grid grid-cols-2 gap-2 relative group-billing">
                            <div>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">Status</span>
                                <Badge variant="outline" className={\`\${statusColor} capitalize font-normal border px-2 py-0 h-5\`}>
                                    {statusLabel}
                                </Badge>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">Sold At</span>
                                <div className="flex items-center justify-end gap-2">
                                    <span className="font-mono font-medium">\${lastSoldDetails?.price.toFixed(2)}</span>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-5 w-5 opacity-0 group-hover-billing:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                        title="Void Invoice / Delete Movement"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if(confirm(\`Are you sure you want to void this \${latestMovement.type} record? This will return items to stock.\`)) {
                                                deleteMovement.mutate(latestMovement.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            <div className="col-span-2 flex justify-between items-center border-t border-slate-200 pt-2 mt-1">
                                <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                                    <ShoppingBag className="h-3 w-3" />
                                    <span>From Inventory</span>
                                    {lastSoldDetails?.lot && <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1 bg-slate-200 text-slate-700">Lot {lastSoldDetails.lot}</Badge>}
                                </div>
                                <span className="text-[10px] text-muted-foreground">{new Date(lastSoldDetails?.date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50 p-3 rounded border border-amber-200 text-sm flex justify-between items-center">
                            <div className="text-amber-800">
                                <p className="font-semibold text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No Billing Record</p>
                                <p className="text-[10px] opacity-80">Inventory not yet assigned.</p>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-50 text-amber-900" onClick={(e) => {
                                e.stopPropagation();
                                const peptideId = protocol.protocol_items?.[0]?.peptide_id;
                                if (peptideId) onAssignInventory(peptideId);
                            }}>
                                Assign Now
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1 pt-2 border-t border-dashed">
                    <span>Est. Monthly Usage Cost:</span>
                    <span className="font-medium">\${totalCost.toFixed(2)}</span>
                </div>

                {/* NEW: Assigned Bottles & Supply Section */}
                <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            Assigned Bottles & Supply
                        </span>
                    </div>

                    {supplyCalculations.length === 0 || supplyCalculations.every(s => s.supply.bottles.length === 0) ? (
                        <div className="text-xs text-muted-foreground italic p-2 bg-muted/20 rounded">
                            No bottles assigned yet. Click "Assign Inventory" above to link bottles to this regimen.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {supplyCalculations.filter(s => s.supply.bottles.length > 0).map(({ protocolItem, supply }) => (
                                <div key={protocolItem.id} className="border rounded-lg p-2 bg-muted/10">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <div className="font-medium text-xs">
                                            {peptides?.find(p => p.id === protocolItem.peptide_id)?.name}
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={\`\${getSupplyStatusColor(supply.status)} text-white border-0 text-[10px] px-1.5 py-0\`}
                                        >
                                            {getSupplyStatusLabel(supply.daysRemaining)}
                                        </Badge>
                                    </div>

                                    <div className="text-[10px] text-muted-foreground mb-1.5 grid grid-cols-2 gap-1">
                                        <div>Supply: {supply.totalSupplyMg.toFixed(1)} mg</div>
                                        <div>Usage: {supply.dailyUsageMg.toFixed(1)} mg/day</div>
                                    </div>

                                    <Accordion type="single" collapsible>
                                        <AccordionItem value="bottles" className="border-0">
                                            <AccordionTrigger className="py-1 text-[10px] hover:no-underline">
                                                {supply.bottles.length} bottle{supply.bottles.length !== 1 ? 's' : ''}
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <div className="space-y-1 mt-1">
                                                    {supply.bottles.map(bottle => (
                                                        <div key={bottle.id} className="flex justify-between items-center text-[10px] bg-white p-1.5 rounded border">
                                                            <div className="flex-1">
                                                                <div className="font-mono text-[10px]">{bottle.uid}</div>
                                                                <div className="text-muted-foreground">
                                                                    {bottle.currentQuantityMg.toFixed(1)} mg
                                                                    {bottle.usagePercent > 0 && \` • \${bottle.usagePercent.toFixed(0)}% used\`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// 
`;

const newContent = content.substring(0, startIndex) + newCode + content.substring(endIndex);
fs.writeFileSync(path, newContent);
console.log("File patched successfully!");
