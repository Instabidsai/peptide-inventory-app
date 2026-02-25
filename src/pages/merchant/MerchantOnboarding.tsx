import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useSubdomainCheck } from '@/hooks/use-wholesale-pricing';
// MarginCalculator available at '@/components/wholesale/MarginCalculator' for future use
import {
    Loader2,
    Building2,
    Rocket,
    ArrowRight,
    ArrowLeft,
    Check,
    LogOut,
    Globe,
    PartyPopper,
    LinkIcon,
    Sparkles,
    ExternalLink,
    FlaskConical,
} from 'lucide-react';

type OnboardingPath = 'new' | 'existing' | null;

interface StepProps {
    onNext: () => void;
    onBack?: () => void;
}

// ── Scraped brand data types ──
interface ScrapedBrand {
    company_name: string;
    primary_color: string;
    secondary_color: string;
    font_family: string;
    logo_url: string;
    favicon_url: string;
    tagline: string;
}

interface ScrapedPeptide {
    name: string;
    price: number | null;
    description: string;
    image_url: string;
    confidence: number;
}

interface ScrapeResult {
    brand: ScrapedBrand;
    peptides: ScrapedPeptide[];
}

// ── Step: Website URL Input ──
function WebsiteScrapeStep({
    onResult,
    onSkip,
    onBack,
}: {
    onResult: (result: ScrapeResult, url: string) => void;
    onSkip: () => void;
    onBack: () => void;
}) {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleScrape = async () => {
        if (!url.trim()) return;
        setIsLoading(true);
        setError('');

        try {
            const { data, error: fnErr } = await supabase.functions.invoke('scrape-brand', {
                body: { url: url.trim(), persist: false },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);

            onResult(
                { brand: data.brand, peptides: data.peptides },
                url.trim()
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to scrape website. Try again or skip this step.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <LinkIcon className="h-5 w-5" /> Enter Your Website
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    We'll extract your branding, colors, and peptide catalog automatically.
                </p>
            </div>
            <div className="space-y-2">
                <Label>Website URL</Label>
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://yourpeptideshop.com"
                    autoFocus
                    disabled={isLoading}
                    onKeyDown={(e) => e.key === 'Enter' && url.trim() && handleScrape()}
                />
                {error && (
                    <p className="text-xs text-destructive">{error}</p>
                )}
            </div>
            <div className="flex gap-3">
                <Button variant="outline" onClick={onBack} disabled={isLoading}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                    className="flex-1"
                    disabled={!url.trim() || isLoading}
                    onClick={handleScrape}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Scanning your site...
                        </>
                    ) : (
                        <>
                            <Sparkles className="h-4 w-4 mr-1" /> Extract My Brand
                        </>
                    )}
                </Button>
            </div>
            <button
                onClick={onSkip}
                disabled={isLoading}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center mt-1"
            >
                Skip — I'll set up branding manually
            </button>
        </div>
    );
}

// ── Step: Scraped Preview (review extracted brand + peptides) ──
function ScrapedPreviewStep({
    scrapeResult,
    websiteUrl,
    onAccept,
    onBack,
}: {
    scrapeResult: ScrapeResult;
    websiteUrl: string;
    onAccept: (brand: ScrapedBrand, peptides: ScrapedPeptide[]) => void;
    onBack: () => void;
}) {
    const { brand, peptides } = scrapeResult;
    const [selectedPeptides, setSelectedPeptides] = useState<Set<number>>(
        new Set(peptides.map((_, i) => i))
    );

    const togglePeptide = (idx: number) => {
        setSelectedPeptides((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-emerald-500" /> We Found Your Brand
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Review what we extracted from{' '}
                    <a href={websiteUrl} target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-0.5">
                        your website <ExternalLink className="h-3 w-3" />
                    </a>
                </p>
            </div>

            {/* Brand preview */}
            <Card className="border-primary/30">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        {brand.logo_url && (
                            <img
                                src={brand.logo_url}
                                alt="Logo"
                                className="w-10 h-10 rounded-lg object-contain bg-muted"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        )}
                        <div>
                            <p className="font-semibold">{brand.company_name || 'Your Company'}</p>
                            {brand.tagline && (
                                <p className="text-xs text-muted-foreground">{brand.tagline}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: brand.primary_color || '#7c3aed' }} />
                            <span className="text-xs text-muted-foreground">Primary</span>
                        </div>
                        {brand.secondary_color && (
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: brand.secondary_color }} />
                                <span className="text-xs text-muted-foreground">Secondary</span>
                            </div>
                        )}
                        {brand.font_family && (
                            <span className="text-xs px-2 py-0.5 rounded bg-muted">{brand.font_family}</span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Peptide catalog preview */}
            {peptides.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1.5">
                            <FlaskConical className="h-3.5 w-3.5" />
                            Peptides Found ({selectedPeptides.size} of {peptides.length} selected)
                        </Label>
                        <button
                            onClick={() =>
                                setSelectedPeptides(
                                    selectedPeptides.size === peptides.length
                                        ? new Set()
                                        : new Set(peptides.map((_, i) => i))
                                )
                            }
                            className="text-xs text-primary hover:underline"
                        >
                            {selectedPeptides.size === peptides.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {peptides.map((p, i) => (
                            <div
                                key={i}
                                onClick={() => togglePeptide(i)}
                                className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                                    selectedPeptides.has(i)
                                        ? 'border-primary/50 bg-primary/5'
                                        : 'border-border/40 opacity-50'
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                            selectedPeptides.has(i) ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                                        }`}
                                    >
                                        {selectedPeptides.has(i) && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-medium truncate">{p.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {p.price != null && (
                                        <span className="text-sm text-emerald-600 font-medium">
                                            ${p.price.toFixed(2)}
                                        </span>
                                    )}
                                    <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                            p.confidence >= 0.8
                                                ? 'bg-emerald-500/10 text-emerald-500'
                                                : p.confidence >= 0.5
                                                ? 'bg-yellow-500/10 text-yellow-600'
                                                : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        {Math.round(p.confidence * 100)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-3">
                <Button variant="outline" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Re-scan
                </Button>
                <Button
                    className="flex-1"
                    onClick={() =>
                        onAccept(
                            brand,
                            peptides.filter((_, i) => selectedPeptides.has(i))
                        )
                    }
                >
                    Use This Brand <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </div>
    );
}

// ── Step 0: Choose Your Path ──
function ChoosePathStep({ onSelect }: { onSelect: (path: OnboardingPath) => void }) {
    return (
        <div className="space-y-6 text-center">
            <div>
                <h2 className="text-2xl font-bold">Welcome to ThePeptideAI</h2>
                <p className="text-muted-foreground mt-1">
                    Your all-in-one peptide business platform — with a built-in supply chain so you can start selling immediately.
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card
                    className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
                    onClick={() => onSelect('existing')}
                >
                    <CardContent className="pt-6 pb-5 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Building2 className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-lg">I Have a Business</CardTitle>
                        <CardDescription>
                            Replace your cobbled tools with one AI-powered platform. We'll import your catalog — or connect you to our peptide supply chain if you need one.
                        </CardDescription>
                    </CardContent>
                </Card>
                <Card
                    className="cursor-pointer hover:border-emerald-500/50 hover:shadow-lg transition-all group"
                    onClick={() => onSelect('new')}
                >
                    <CardContent className="pt-6 pb-5 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                            <Rocket className="h-6 w-6 text-emerald-500" />
                        </div>
                        <CardTitle className="text-lg">Start a Business</CardTitle>
                        <CardDescription>
                            Launch your peptide business in minutes. Full supply chain included — we provide the peptides, you sell them under your brand.
                        </CardDescription>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ── Step 1: Company Name ──
function CompanyNameStep({ value, onChange, onNext, onBack }: StepProps & { value: string; onChange: (v: string) => void }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold">Name Your Company</h2>
                <p className="text-sm text-muted-foreground mt-1">This is how your customers will see your business.</p>
            </div>
            <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="Acme Peptides"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && value.trim() && onNext()}
                />
            </div>
            <div className="flex gap-3">
                {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>}
                <Button className="flex-1" disabled={!value.trim()} onClick={onNext}>
                    Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </div>
    );
}

// ── Step: Subdomain ──
function SubdomainStep({ value, onChange, onNext, onBack }: StepProps & { value: string; onChange: (v: string) => void }) {
    const { data: check, isLoading: checking } = useSubdomainCheck(value);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Globe className="h-5 w-5" /> Choose Your Subdomain</h2>
                <p className="text-sm text-muted-foreground mt-1">Your customers will visit this URL to browse your store.</p>
            </div>
            <div className="space-y-2">
                <Label>Subdomain</Label>
                <div className="flex items-center gap-1">
                    <Input
                        value={value}
                        onChange={e => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="acmepeptides"
                        className="flex-1"
                        autoFocus
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">.thepeptideai.com</span>
                </div>
                {value.length >= 3 && (
                    <p className={`text-xs ${check?.available ? 'text-emerald-600' : 'text-destructive'}`}>
                        {checking ? 'Checking...' : check?.available ? 'Available!' : check?.reason}
                    </p>
                )}
            </div>
            <div className="flex gap-3">
                {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>}
                <Button className="flex-1" disabled={!check?.available} onClick={onNext}>
                    Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </div>
    );
}

// ── Step: Confirm & Launch (single plan — $500/mo, 7-day trial) ──
function ConfirmLaunchStep({ onNext, onBack, submitting }: StepProps & { submitting?: boolean }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Rocket className="h-5 w-5" /> Ready to Launch</h2>
                <p className="text-sm text-muted-foreground mt-1">You're almost there. Review your plan and launch your business.</p>
            </div>
            <Card className="border-primary ring-2 ring-primary/20">
                <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="font-semibold text-lg">ThePeptideAI Platform</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Everything you need to run your peptide business</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                            <p className="text-2xl font-bold">$500</p>
                            <p className="text-xs text-muted-foreground">/month</p>
                        </div>
                    </div>
                    <div className="border-t border-border/50 pt-3 space-y-1.5">
                        <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5" /> 7-day free trial — no payment required today
                        </p>
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-500" /> Peptide supply chain included</span>
                            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> AI-powered inventory</span>
                            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Client portal & store</span>
                            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Fulfillment & shipping</span>
                            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Partner network</span>
                            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> Automations & workflows</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-2">
                            Don't have a peptide supplier? No problem — your account comes pre-loaded with our full catalog at wholesale pricing. Bring your own supplier anytime.
                        </p>
                    </div>
                </CardContent>
            </Card>
            <div className="flex gap-3">
                {onBack && <Button variant="outline" onClick={onBack} disabled={submitting}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>}
                <Button className="flex-1" disabled={submitting} onClick={onNext}>
                    {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Setting up...</> : <>Launch My Business <Rocket className="h-4 w-4 ml-1" /></>}
                </Button>
            </div>
        </div>
    );
}

// ── Step 5: Success ──
function SuccessStep() {
    const navigate = useNavigate();
    return (
        <div className="space-y-6 text-center py-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <PartyPopper className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
                <h2 className="text-2xl font-bold">You're Live!</h2>
                <p className="text-muted-foreground mt-1">
                    Your peptide business is ready to go — complete with a pre-loaded product catalog and supply chain access.
                </p>
            </div>
            <div className="space-y-3">
                <Button className="w-full" onClick={() => navigate('/', { replace: true })}>
                    Go to Dashboard <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate('/settings', { replace: true })}>
                    Customize Settings
                </Button>
            </div>
        </div>
    );
}

// ── Main Wizard ──
export default function MerchantOnboarding() {
    const { user, profile, refreshProfile, signOut } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [path, setPath] = useState<OnboardingPath>(null);
    const [step, setStep] = useState(0);
    const [isCreating, setIsCreating] = useState(false);

    const [companyName, setCompanyName] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#7c3aed');
    const [subdomain, setSubdomain] = useState('');

    // Website scraping state (for "existing" path)
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
    const [acceptedPeptides, setAcceptedPeptides] = useState<ScrapedPeptide[]>([]);

    // If no user, redirect to auth with merchant signup flag
    useEffect(() => {
        if (!user) {
            navigate('/auth?signup=merchant', { replace: true });
        }
    }, [user, navigate]);

    // If user already has org, redirect to dashboard
    useEffect(() => {
        if (profile?.org_id) {
            navigate('/', { replace: true });
        }
    }, [profile?.org_id, navigate]);

    // "existing" path: 0=choose, 1=website, 2=preview, 3=name, 4=subdomain, 5=confirm → 6=success
    // "new" path:      0=choose, 1=name, 2=subdomain, 3=confirm → 4=success
    const totalSteps = path === 'existing' ? 6 : 4;

    if (profile?.org_id) return null;

    const handleSelectPath = (selected: OnboardingPath) => {
        setPath(selected);
        setStep(1);
    };

    const handleCreate = async () => {
        if (!user || !companyName.trim()) return;
        setIsCreating(true);

        try {
            const { data, error } = await supabase.functions.invoke('self-signup', {
                body: {
                    org_name: companyName.trim(),
                    plan_name: 'platform',
                },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            // Update tenant config with branding + subdomain + path
            if (data?.org_id) {
                const updates: Record<string, any> = {
                    primary_color: primaryColor,
                    onboarding_path: path,
                };
                if (subdomain) updates.subdomain = subdomain;
                if (websiteUrl) updates.website_url = websiteUrl;
                if (scrapeResult) {
                    updates.scraped_brand_data = scrapeResult;
                    if (scrapeResult.brand.secondary_color) {
                        updates.secondary_color = scrapeResult.brand.secondary_color;
                    }
                    if (scrapeResult.brand.font_family) {
                        updates.font_family = scrapeResult.brand.font_family;
                    }
                    if (scrapeResult.brand.favicon_url) {
                        updates.favicon_url = scrapeResult.brand.favicon_url;
                    }
                    if (scrapeResult.brand.logo_url) {
                        updates.logo_url = scrapeResult.brand.logo_url;
                    }
                }

                await supabase
                    .from('tenant_config')
                    .update(updates)
                    .eq('org_id', data.org_id);

                // Insert accepted scraped peptides for import
                if (acceptedPeptides.length > 0) {
                    await supabase.from('scraped_peptides').insert(
                        acceptedPeptides.map((p) => ({
                            org_id: data.org_id,
                            name: p.name,
                            price: p.price,
                            description: p.description || '',
                            image_url: p.image_url || '',
                            source_url: websiteUrl,
                            confidence: p.confidence,
                            status: 'pending',
                            raw_data: p,
                        }))
                    );
                }

                // Seed default feature flags
                await supabase.rpc('seed_default_features', { p_org_id: data.org_id });
            }

            sessionStorage.removeItem('selected_plan');
            sessionStorage.removeItem('merchant_signup');
            await refreshProfile();

            toast({ title: 'Welcome aboard!', description: `${companyName.trim()} is ready to go.` });
            setStep(totalSteps);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not create your organization.';
            toast({ variant: 'destructive', title: 'Setup failed', description: message });
        } finally {
            setIsCreating(false);
        }
    };

    const handleSignOut = async () => {
        sessionStorage.removeItem('selected_plan');
        sessionStorage.removeItem('merchant_signup');
        await signOut();
        navigate('/auth', { replace: true });
    };

    // Progress indicator — last input step (4) should show 100%
    const progress = step === 0 ? 0 : Math.round((step / (totalSteps - 1)) * 100);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
            </div>

            <Card className="w-full max-w-xl bg-card/70 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/20 relative z-10">
                {/* Progress bar */}
                {step > 0 && step < totalSteps && (
                    <div className="h-1 bg-muted rounded-t-xl overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                )}

                <CardContent className="p-6">
                    {/* Step 0: Choose path */}
                    {step === 0 && <ChoosePathStep onSelect={handleSelectPath} />}

                    {/* ── "EXISTING" PATH: website → preview → name → subdomain → confirm ── */}
                    {path === 'existing' && (
                        <>
                            {/* Step 1: Website URL */}
                            {step === 1 && (
                                <WebsiteScrapeStep
                                    onResult={(result, url) => {
                                        setScrapeResult(result);
                                        setWebsiteUrl(url);
                                        if (result.brand.company_name) setCompanyName(result.brand.company_name);
                                        if (result.brand.primary_color) setPrimaryColor(result.brand.primary_color);
                                        setStep(2);
                                    }}
                                    onSkip={() => {
                                        setScrapeResult(null);
                                        setWebsiteUrl('');
                                        setStep(3);
                                    }}
                                    onBack={() => { setStep(0); setPath(null); }}
                                />
                            )}

                            {/* Step 2: Preview scraped data */}
                            {step === 2 && scrapeResult && (
                                <ScrapedPreviewStep
                                    scrapeResult={scrapeResult}
                                    websiteUrl={websiteUrl}
                                    onAccept={(brand, peptides) => {
                                        setAcceptedPeptides(peptides);
                                        if (brand.company_name) setCompanyName(brand.company_name);
                                        if (brand.primary_color) setPrimaryColor(brand.primary_color);
                                        setStep(3);
                                    }}
                                    onBack={() => setStep(1)}
                                />
                            )}

                            {/* Step 3: Company name */}
                            {step === 3 && (
                                <CompanyNameStep
                                    value={companyName}
                                    onChange={setCompanyName}
                                    onNext={() => setStep(4)}
                                    onBack={() => setStep(scrapeResult ? 2 : 1)}
                                />
                            )}

                            {/* Step 4: Subdomain */}
                            {step === 4 && (
                                <SubdomainStep
                                    value={subdomain}
                                    onChange={setSubdomain}
                                    onNext={() => setStep(5)}
                                    onBack={() => setStep(3)}
                                />
                            )}

                            {/* Step 5: Confirm & Launch */}
                            {step === 5 && (
                                <ConfirmLaunchStep
                                    onNext={handleCreate}
                                    onBack={() => setStep(4)}
                                    submitting={isCreating}
                                />
                            )}
                        </>
                    )}

                    {/* ── "NEW" PATH: name → subdomain → confirm ── */}
                    {path === 'new' && (
                        <>
                            {/* Step 1: Company name */}
                            {step === 1 && (
                                <CompanyNameStep
                                    value={companyName}
                                    onChange={setCompanyName}
                                    onNext={() => setStep(2)}
                                    onBack={() => { setStep(0); setPath(null); }}
                                />
                            )}

                            {/* Step 2: Subdomain */}
                            {step === 2 && (
                                <SubdomainStep
                                    value={subdomain}
                                    onChange={setSubdomain}
                                    onNext={() => setStep(3)}
                                    onBack={() => setStep(1)}
                                />
                            )}

                            {/* Step 3: Confirm & Launch */}
                            {step === 3 && (
                                <ConfirmLaunchStep
                                    onNext={handleCreate}
                                    onBack={() => setStep(2)}
                                    submitting={isCreating}
                                />
                            )}
                        </>
                    )}

                    {/* Success step (same for both paths) */}
                    {step === totalSteps && <SuccessStep />}
                </CardContent>

                {/* Sign out footer */}
                {step < totalSteps && (
                    <div className="px-6 pb-4">
                        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleSignOut}>
                            <LogOut className="mr-2 h-3.5 w-3.5" /> Sign Out
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
