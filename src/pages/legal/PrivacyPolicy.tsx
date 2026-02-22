import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const PLATFORM = {
    name: 'ThePeptideAI',
    supportEmail: 'hello@thepeptideai.com',
    legalEmail: 'legal@thepeptideai.com',
} as const;

export default function PrivacyPolicy() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-3xl mx-auto px-4 py-12">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-6">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>

                <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: February 22, 2026</p>

                <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">1. Introduction</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {PLATFORM.name} ("we," "our," or "us") operates a multi-tenant software-as-a-service platform
                            for peptide inventory management, customer relationship management, and business operations.
                            This Privacy Policy explains how we collect, use, disclose, and safeguard your information
                            when you use our platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">2. Information We Collect</h2>
                        <h3 className="text-base font-medium mt-4 mb-2">Account Information</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            When you create an account, we collect your name, email address, and organization details.
                            If you sign up as a partner or customer through a referral link, we associate your account
                            with the referring organization.
                        </p>
                        <h3 className="text-base font-medium mt-4 mb-2">Business Data</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Data you enter into the platform — including inventory records, customer contacts, orders,
                            protocols, commissions, and communications — is stored within your organization's isolated
                            tenant environment.
                        </p>
                        <h3 className="text-base font-medium mt-4 mb-2">Usage Data</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            We automatically collect information about how you interact with the platform, including
                            pages visited, features used, and error reports, to improve service quality.
                        </p>
                        <h3 className="text-base font-medium mt-4 mb-2">Payment Information</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Payment processing is handled by Stripe. We do not store your full credit card numbers.
                            We retain Stripe customer IDs and transaction records for billing purposes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">3. Multi-Tenant Data Isolation</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Each organization on our platform operates in a fully isolated tenant environment.
                            Your data is segregated at the database level using row-level security policies.
                            No other tenant can access, view, or modify your organization's data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">4. How We Use Your Information</h2>
                        <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                            <li>To provide and maintain the platform services</li>
                            <li>To process transactions and manage subscriptions</li>
                            <li>To send service-related communications (account confirmations, billing, security alerts)</li>
                            <li>To provide AI-powered features (chat assistants, automation, analytics)</li>
                            <li>To detect and prevent fraud or abuse</li>
                            <li>To improve and develop new features</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">5. AI Features & Data Processing</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Our platform includes AI-powered features that process your business data to provide
                            intelligent assistance. AI conversations and inputs are processed by third-party AI providers
                            (OpenAI) and are not used to train their models. AI-generated content should be reviewed
                            for accuracy before use in business decisions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Sharing</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We do not sell your personal information. We may share data with:
                        </p>
                        <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                            <li><strong>Service providers</strong>: Supabase (hosting/database), Stripe (payments), Shippo (shipping), OpenAI (AI features), Vercel (application hosting)</li>
                            <li><strong>Legal requirements</strong>: When required by law, subpoena, or to protect our rights</li>
                            <li><strong>Business transfers</strong>: In connection with a merger, acquisition, or sale of assets</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">7. Data Retention</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We retain your data for as long as your account is active or as needed to provide services.
                            When you cancel your subscription, your data is retained for 90 days to allow for reactivation,
                            after which it is permanently deleted.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">8. Security</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We implement industry-standard security measures including encrypted data transmission (TLS),
                            row-level security policies, role-based access control, secure authentication via Supabase Auth,
                            and regular security audits. API keys are stored encrypted and are never exposed in client-side code.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">9. Your Rights</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You may request access to, correction of, or deletion of your personal data by contacting us
                            at <a href={`mailto:${PLATFORM.legalEmail}`} className="text-primary hover:underline">{PLATFORM.legalEmail}</a>.
                            Organization administrators can export their tenant data at any time through the platform settings.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For privacy-related inquiries, contact us at{' '}
                            <a href={`mailto:${PLATFORM.legalEmail}`} className="text-primary hover:underline">{PLATFORM.legalEmail}</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
