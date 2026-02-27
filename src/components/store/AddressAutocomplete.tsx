import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY as string | undefined;
const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

interface Suggestion {
    formatted: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postcode: string;
}

interface AddressAutocompleteProps {
    value: string;
    onChange: (address: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

function parseApt(value: string): { address: string; apt: string } {
    const match = value.match(/,\s*(Apt|Suite|Unit|Ste|#)\s*.+$/i);
    if (match) {
        return { address: value.slice(0, match.index!), apt: match[0].replace(/^,\s*/, '') };
    }
    return { address: value, apt: '' };
}

export function AddressAutocomplete({ value, onChange, placeholder, disabled }: AddressAutocompleteProps) {
    const parsed = parseApt(value);
    const [inputValue, setInputValue] = useState(parsed.address);
    const [apt, setApt] = useState(parsed.apt);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync external value changes (e.g. auto-fill from contact profile)
    const lastEmittedRef = useRef(value);
    useEffect(() => {
        if (value !== lastEmittedRef.current) {
            const p = parseApt(value);
            setInputValue(p.address);
            setApt(p.apt);
            lastEmittedRef.current = value;
        }
    }, [value]);

    // Emit combined value whenever address or apt changes
    const emit = useCallback((addr: string, aptVal: string) => {
        const full = aptVal.trim() ? `${addr}, ${aptVal.trim()}` : addr;
        lastEmittedRef.current = full;
        onChange(full);
    }, [onChange]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const fetchSuggestions = useCallback(async (text: string) => {
        if (!GEOAPIFY_KEY || text.length < MIN_CHARS) {
            setSuggestions([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(
                `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&format=json&apiKey=${GEOAPIFY_KEY}&filter=countrycode:us&limit=5&type=amenity,street,housenumber`
            );
            if (!res.ok) { setSuggestions([]); return; }
            const data = await res.json();
            const results: Suggestion[] = (data.results || []).map((r: any) => ({
                formatted: r.formatted || '',
                address_line1: r.address_line1 || '',
                address_line2: r.address_line2 || '',
                city: r.city || '',
                state: r.state || '',
                postcode: r.postcode || '',
            }));
            setSuggestions(results);
            if (results.length > 0) setOpen(true);
        } catch {
            setSuggestions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        setActiveIndex(-1);
        emit(val, apt);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS);
    };

    const selectSuggestion = (s: Suggestion) => {
        setInputValue(s.formatted);
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
        emit(s.formatted, apt);
        // Focus apt field after selecting address
        setTimeout(() => {
            const aptInput = containerRef.current?.querySelector<HTMLInputElement>('[data-apt-input]');
            aptInput?.focus();
        }, 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!open || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const handleAptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setApt(val);
        emit(inputValue, val);
    };

    return (
        <div ref={containerRef} className="space-y-2">
            <label className="text-sm font-semibold">Shipping Address</label>
            <div className="relative">
                <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        ref={inputRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
                        placeholder={placeholder || 'Start typing your address...'}
                        disabled={disabled}
                        className="pl-9"
                        autoComplete="off"
                    />
                    {loading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                </div>

                {open && suggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-xl shadow-lg overflow-hidden">
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                                    i === activeIndex
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-foreground'
                                }`}
                                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                                onMouseEnter={() => setActiveIndex(i)}
                            >
                                <span className="font-medium">{s.address_line1}</span>
                                {s.address_line2 && (
                                    <span className="text-muted-foreground ml-1 text-xs">{s.address_line2}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Input
                data-apt-input
                value={apt}
                onChange={handleAptChange}
                placeholder="Apt, Suite, Unit (optional)"
                disabled={disabled}
                autoComplete="off"
            />
        </div>
    );
}
