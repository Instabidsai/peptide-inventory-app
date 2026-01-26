
const fs = require('fs');
const path = 'src/pages/ContactDetails.tsx';
let content = fs.readFileSync(path, 'utf8');

// Identify the Dialog content start
// The start of the main content div for "Add Peptide Regimen"
const startSearch = '<div className="grid gap-4 py-4">';
const endSearch = '<DialogFooter>';

// It's specific to the Add Peptide Dialog. 
// "Add Peptide Regimen" is the title.
const titleSearch = '{editingItemId ? \'Edit Regimen\' : \'Add Peptide Regimen\'}';
const titleIndex = content.indexOf(titleSearch);
if (titleIndex === -1) {
    console.error("Title not found");
    process.exit(1);
}

// Find the content div after title
const contentStart = content.indexOf(startSearch, titleIndex);
const contentEnd = content.indexOf(endSearch, contentStart);

if (contentStart === -1 || contentEnd === -1) {
    console.error("Content block not found");
    process.exit(1);
}

// We need the code between contentStart and contentEnd.
// But we want to REPLACE it.

const newContentBlock = `<div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label>Peptide</Label>
                                        <Select value={selectedPeptideId} onValueChange={(val) => {
                                            setSelectedPeptideId(val);
                                            const p = peptides?.find(pep => pep.id === val);
                                            if (p) {
                                                setVialSize(parseVialSize(p.name).toString());
                                            }
                                        }} disabled={!!editingItemId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select peptide..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {peptides?.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <Separator />

                                    {/* Calculator Inputs */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Dosage</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    value={dosageAmount}
                                                    onChange={(e) => setDosageAmount(e.target.value)}
                                                />
                                                <Select value={dosageUnit} onValueChange={setDosageUnit}>
                                                    <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="mg">mg</SelectItem>
                                                        <SelectItem value="mcg">mcg</SelectItem>
                                                        <SelectItem value="iu">IU</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Frequency</Label>
                                            <Select value={frequency} onValueChange={setFrequency}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="daily">Daily</SelectItem>
                                                    <SelectItem value="bid">Twice Daily</SelectItem>
                                                    <SelectItem value="weekly">Weekly</SelectItem>
                                                    <SelectItem value="biweekly">2x / Week</SelectItem>
                                                    <SelectItem value="5on2off">5 days on, 2 days off</SelectItem>
                                                    <SelectItem value="monthly">Monthly</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Duration (Days)</Label>
                                            <Input
                                                type="number"
                                                value={durationValue}
                                                onChange={(e) => setDurationValue(e.target.value)}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Vial Size (mg)</Label>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                value={vialSize}
                                                onChange={(e) => setVialSize(e.target.value)}
                                                placeholder="e.g 5"
                                            />
                                        </div>
                                    </div>

                                    {/* Calc Summary - Simplified */}
                                    <div className="bg-muted p-3 rounded-md text-sm space-y-2">
                                        <div className="flex items-center gap-2 font-semibold border-b border-border pb-2">
                                            <Calculator className="h-4 w-4" />
                                            <span>Regimen Supply Plan</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
                                            <div>Daily Dose: <span className="text-foreground">{dosageAmount}{dosageUnit}</span></div>
                                            <div>Freq: <span className="text-foreground capitalize">{frequency}</span></div>

                                            <div>Vial Lasts: <span className="text-foreground">{Math.floor(calculations.daysPerVial)} days</span></div>
                                            <div>Vials Needed: <span className="text-foreground font-semibold">{calculations.vialsNeeded}</span></div>
                                        </div>
                                    </div>
                                </div>
                                `;

// Replace
const newFileContent = content.substring(0, contentStart) + newContentBlock + content.substring(contentEnd);
fs.writeFileSync(path, newFileContent);
console.log("Refactored Regimen Modal!");
