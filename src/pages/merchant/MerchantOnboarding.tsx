import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useSubdomainCheck } from '@/hooks/use-wholesale-pricing';
import MarginCalculator from '@/components/wholesale/MarginCalculator';
import {
    Loader2, Building2, Rocket, ArrowRight, ArrowLeft, Check,
    LogOut, Globe, Palette, CreditCard, PartyPopper,
} from 'lucide-react';

type OnboardingPath = 'new' | 'existing' | null;

interface StepProps {
    onNext: () => void;
    onBack?: () => void;
}

// ── Step 0: Choose Your Path ──
function ChoosePathStep({ onSelect }: { onSelect: (path: OnboardingPath) => void }) {
    return (
        <div className="space-y-6 text-center">
            <div>
                <h2 className="text-2xl font-bold">Welcome to ThePeptideAI</h2>
                <p className="text-muted-foreground mt-1">How would you like to get started?</p>
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
                            Replace your cobbled tools with one AI-powered platform. Import your existing inventory or start fresh.
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
                            Launch your peptide business in minutes. Pre-loaded catalog, AI assistant, and instant storefront included.
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

// ── Step 2: Branding ──
function BrandingStep({ color, onColorChange, onNext, onBack }: StepProps & { color: string; onColorChange: (v: string) => void }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Palette className="h-5 w-5" /> Brand Your Store</h2>
                <p className="text-sm text-muted-foreground mt-1">Pick your brand color. You can upload a logo and customize further later.</p>
            </div>
            <div className="flex items-center gap-4">
                <Label>Brand Color</Label>
                <input
                    type="color"
                    value={color}
                    onChange={e => onColorChange(e.target.value)}
                    className="h-12 w-16 rounded-lg border border-input cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{color}</span>
            </div>
            <div className="h-3 rounded-full" style={{ backgroundColor: color }} />
            <div className="flex gap-3">
                {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>}
                <Button className="flex-1" onClick={onNext}>
                    Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </div>
    );
}

// ── Step 3: Subdomain ──
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

// ── Step 4: Choose Plan ──
const PLANS = [
    { name: 'starter', display: 'Starter', price: 349, desc: 'Full inventory management, AI chat, client portal, supplier catalog, 5 team members.' },
    { name: 'professional', display: 'Professional', price: 499, desc: 'Everything in Starter + advanced fulfillment, partner network, automations, 25 team members.' },
    { name: 'enterprise', display: 'Enterprise', price: 1299, desc: 'Full Jarvis AI ecosystem, autonomous operations, unlimited users, white-label, SLA.' },
];

function PlanStep({ value, onChange, onNext, onBack }: StepProps & { value: string; onChange: (v: string) => void }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5" /> Choose a Plan</h2>
                <p className="text-sm text-muted-foreground mt-1">All plans include a 14-day free trial. No credit card required.</p>
            </div>
            <div className="space-y-3">
                {PLANS.map(plan => (
                    <Card
                        key={plan.name}
                        className={`cursor-pointer transition-all ${value === plan.name ? 'border-primary ring-2 ring-primary/20' : 'hover:border-muted-foreground/30'}`}
                        onClick={() => onChange(plan.name)}
                    >
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="font-semibold">{plan.display}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{plan.desc}</p>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                                <p className="text-lg font-bold">${plan.price}</p>
                                <p className="text-xs text-muted-foreground">/month</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="flex gap-3">
                {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>}
                <Button className="flex-1" disabled={!value} onClick={onNext}>
                    Continue <ArrowRight className="h-4 w-4 ml-1" />
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
                <p className="text-muted-foreground mt-1">Your peptide business is ready to go. Let's set it up.</p>
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
    const [planName, setPlanName] = useState('');

    // If user already has org, redirect
    if (profile?.org_id) {
        navigate('/', { replace: true });
        return null;
    }

    const totalSteps = path === 'new' ? 5 : 5; // Both paths: path choice + name + branding + subdomain + plan

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
                    plan_name: planName || '',
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

                await supabase
                    .from('tenant_config')
                    .update(updates)
                    .eq('org_id', data.org_id);
            }

            sessionStorage.removeItem('selected_plan');
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
        await signOut();
        navigate('/auth', { replace: true });
    };

    // Progress indicator
    const progress = step === 0 ? 0 : Math.round((step / totalSteps) * 100);

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

                    {/* Step 1: Company name */}
                    {step === 1 && (
                        <CompanyNameStep
                            value={companyName}
                            onChange={setCompanyName}
                            onNext={() => setStep(2)}
                            onBack={() => { setStep(0); setPath(null); }}
                        />
                    )}

                    {/* Step 2: Branding */}
                    {step === 2 && (
                        <BrandingStep
                            color={primaryColor}
                            onColorChange={setPrimaryColor}
                            onNext={() => setStep(3)}
                            onBack={() => setStep(1)}
                        />
                    )}

                    {/* Step 3: Subdomain */}
                    {step === 3 && (
                        <SubdomainStep
                            value={subdomain}
                            onChange={setSubdomain}
                            onNext={() => setStep(4)}
                            onBack={() => setStep(2)}
                        />
                    )}

                    {/* Step 4: Choose plan */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <PlanStep
                                value={planName}
                                onChange={setPlanName}
                                onNext={handleCreate}
                                onBack={() => setStep(3)}
                            />
                            {isCreating && (
                                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-sm">Setting up your business...</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 5: Success */}
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
