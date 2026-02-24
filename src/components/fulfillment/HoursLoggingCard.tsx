import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Clock, Save } from 'lucide-react';
import type { HoursLoggingCardProps } from './types';

export default function HoursLoggingCard({
    todayHours,
    weekHours,
    hoursInput,
    hoursNotes,
    onHoursInputChange,
    onHoursNotesChange,
    onSave,
    isSaving,
}: HoursLoggingCardProps) {
    return (
        <Card className="border-primary/20">
            <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10">
                            <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="font-semibold">{format(new Date(), 'EEEE, MMMM d')}</p>
                            {todayHours ? (
                                <p className="text-sm text-muted-foreground">Logged: <strong>{todayHours.hours}h</strong> today | Week: <strong>{weekHours || 0}h</strong></p>
                            ) : (
                                <p className="text-sm text-muted-foreground">No hours logged today | Week: <strong>{weekHours || 0}h</strong></p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap flex-1 sm:justify-end w-full sm:w-auto">
                        <Input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            placeholder="Hours"
                            value={hoursInput || (todayHours?.hours?.toString() ?? '')}
                            onChange={e => onHoursInputChange(e.target.value)}
                            className="w-20"
                        />
                        <Input
                            placeholder="Notes (optional)"
                            value={hoursNotes || (todayHours?.notes ?? '')}
                            onChange={e => onHoursNotesChange(e.target.value)}
                            className="flex-1 min-w-[80px] sm:max-w-[200px]"
                        />
                        <Button
                            size="sm"
                            disabled={isSaving}
                            onClick={onSave}
                        >
                            <Save className="h-4 w-4 mr-1" />
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
