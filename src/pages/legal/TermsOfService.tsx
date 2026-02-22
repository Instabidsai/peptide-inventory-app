import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const PLATFORM = {
    name: 'ThePeptideAI',
    supportEmail: 'hello@thepeptideai.com',
    legalEmail: 'legal@thepeptideai.com',
} as const;

export default function TermsOfService() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-3xl mx-auto px-4 py-12">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-6">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>

                <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: February 22, 2026</p>

                <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">1. Agreement to Terms</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            By accessing or using {PLATFORM.name} ("the Platform"), you agree to be bound by these
                            Terms of Service. If you are using the Platform on behalf of an organization, you represent
                            that you have the authority to bind that organization to these terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">2. Description of Service</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {PLATFORM.name} provides a multi-tenant software-as-a-service platform for peptide inventory
                            management, customer relationship management, order processing, fulfillment operations,
                            commission tracking, and AI-assisted business operations. Each subscribing organization
                            ("Tenant") receives an isolated environment for their business data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">3. Account Registration</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You must provide accurate and complete information when creating an account. You are
                            responsible for maintaining the confidentiality of your login credentials and for all
                            activities under your account. You must notify us immediately of any unauthorized access.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">4. Subscription & Billing</h2>
                        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                            <li>Subscriptions are billed monthly or annually through Stripe based on your selected plan.</li>
                            <li>Plan features and pricing are displayed on the Platform and may be updated with 30 days' notice.</li>
                            <li>You may upgrade, downgrade, or cancel your subscription at any time through your account settings.</li>
                            <li>Refunds are handled on a case-by-case basis. Contact {PLATFORM.supportEmail} for assistance.</li>
                            <li>Failure to pay may result in suspension of access to your tenant environment.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">5. Acceptable Use</h2>
                        <p className="text-muted-foreground leading-relaxed">You agree not to:</p>
                        <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                            <li>Use the Platform for any unlawful purpose</li>
                            <li>Attempt to access other tenants' data or circumvent security controls</li>
                            <li>Upload malicious code, viruses, or harmful content</li>
                            <li>Reverse engineer, decompile, or attempt to extract the source code</li>
                            <li>Use automated tools to scrape or collect data from the Platform</li>
                            <li>Exceed reasonable usage limits that would degrade service for other users</li>
                            <li>Resell or sublicense access without written authorization</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Ownership</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You retain ownership of all data you enter into the Platform ("Your Data"). We do not
                            claim ownership of Your Data. You grant us a limited license to host, process, and display
                            Your Data solely for the purpose of providing the Platform services. Upon account
                            termination, you may request a full export of Your Data within the 90-day retention period.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">7. AI Features Disclaimer</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            The Platform includes AI-powered features for business assistance. AI-generated content,
                            recommendations, and analyses are provided "as is" and should not be considered professional
                            medical, legal, or financial advice. You are responsible for reviewing and verifying all
                            AI-generated output before acting on it. We are not liable for decisions made based on
                            AI-generated content.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">8. Service Availability</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We strive for high availability but do not guarantee uninterrupted service. We may perform
                            scheduled maintenance with advance notice. We are not liable for downtime caused by
                            third-party service providers, network outages, or force majeure events.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">9. Limitation of Liability</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            To the maximum extent permitted by law, {PLATFORM.name} shall not be liable for any
                            indirect, incidental, special, consequential, or punitive damages, including loss of
                            profits, data, or business opportunities, arising from your use of or inability to use
                            the Platform. Our total liability shall not exceed the amount you paid in the 12 months
                            preceding the claim.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">10. Indemnification</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You agree to indemnify and hold harmless {PLATFORM.name} from any claims, damages, or
                            expenses arising from your use of the Platform, your violation of these Terms, or your
                            violation of any rights of a third party.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">11. Termination</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Either party may terminate this agreement at any time. We may suspend or terminate your
                            account for violation of these Terms. Upon termination, your right to use the Platform
                            ceases. Your Data will be retained for 90 days post-termination, after which it will
                            be permanently deleted.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">12. Changes to Terms</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update these Terms at any time. Material changes will be communicated via email
                            or in-app notification at least 30 days before taking effect. Continued use after changes
                            constitutes acceptance of the updated Terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">13. Governing Law</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            These Terms are governed by the laws of the State of Delaware, United States. Any disputes
                            shall be resolved through binding arbitration in accordance with the American Arbitration
                            Association rules.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mt-8 mb-3">14. Contact</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For questions about these Terms, contact us at{' '}
                            <a href={`mailto:${PLATFORM.legalEmail}`} className="text-primary hover:underline">{PLATFORM.legalEmail}</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
