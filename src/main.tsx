import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { installAutoErrorReporter, reportPoorVital } from './lib/auto-error-reporter'
import { installClickTracker } from './lib/click-tracker'
import App from './App.tsx'
import './index.css'

// ─── Error Monitoring (Sentry) ──────────────────────────────────────────────
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    release: __APP_VERSION__,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: 0.3,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// ─── Console Error Capture (for bug reports) ─────────────────────────────
;(function captureConsoleErrors() {
  const errors: string[] = [];
  const origError = console.error;
  console.error = (...args: any[]) => {
    errors.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    if (errors.length > 20) errors.shift();
    origError.apply(console, args);
  };
  (window as unknown as { __recentConsoleErrors: string[] }).__recentConsoleErrors = errors;
})();

// ─── SMS-Safe Referral Interceptor ───────────────────────────────────────────
// Referral links sent via text use /join?ref=...&role=...&org=... (no hash)
// because SMS apps strip everything after # in URLs.
// Convert to HashRouter format before React renders.
;(function interceptReferralPath() {
  if (window.location.pathname !== '/join') return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (!ref) return;
  const role = params.get('role') || 'customer';
  const org = params.get('org');
  const tier = params.get('tier');
  const orgSuffix = org ? `&org=${encodeURIComponent(org)}` : '';
  const tierSuffix = tier ? `&tier=${encodeURIComponent(tier)}` : '';
  // Store referral in sessionStorage + localStorage as backup
  sessionStorage.setItem('partner_ref', ref);
  sessionStorage.setItem('partner_ref_role', role);
  if (org) sessionStorage.setItem('partner_ref_org', org);
  if (tier) sessionStorage.setItem('partner_ref_tier', tier);
  localStorage.setItem('pending_referral', JSON.stringify({ refId: ref, role, orgId: org || null, tier: tier || null, ts: Date.now() }));
  // Rewrite URL to hash-based route
  window.history.replaceState(null, '', `/#/auth?ref=${encodeURIComponent(ref)}&role=${encodeURIComponent(role)}${orgSuffix}${tierSuffix}`);
})();

// ─── OAuth Hash Interceptor ───────────────────────────────────────────────
// Recover pending referral from localStorage when sessionStorage is empty
// (email confirmation may open in a new tab where sessionStorage doesn't persist).
function recoverReferralFromStorage(): { refId: string; role: string; org: string; tier: string } | null {
  const refId = sessionStorage.getItem('partner_ref');
  if (refId) {
    return {
      refId,
      role: sessionStorage.getItem('partner_ref_role') || 'customer',
      org: sessionStorage.getItem('partner_ref_org') || '',
      tier: sessionStorage.getItem('partner_ref_tier') || '',
    };
  }
  try {
    const backup = localStorage.getItem('pending_referral');
    if (!backup) return null;
    const parsed = JSON.parse(backup);
    const ttl = 24 * 60 * 60 * 1000; // 24h — matches link-referral.ts
    if (!parsed.refId || Date.now() - (parsed.ts || 0) >= ttl) return null;
    // Restore to sessionStorage so Auth.tsx finds it
    sessionStorage.setItem('partner_ref', parsed.refId);
    sessionStorage.setItem('partner_ref_role', parsed.role || 'customer');
    if (parsed.orgId) sessionStorage.setItem('partner_ref_org', parsed.orgId);
    if (parsed.tier) sessionStorage.setItem('partner_ref_tier', parsed.tier);
    return { refId: parsed.refId, role: parsed.role || 'customer', org: parsed.orgId || '', tier: parsed.tier || '' };
  } catch { return null; }
}

// Supabase implicit OAuth puts tokens in the URL hash (#access_token=xxx&...)
// which conflicts with HashRouter (also uses the hash for routing).
// Intercept tokens synchronously BEFORE React renders so HashRouter never
// sees the raw token hash (which would cause a 404 flash).
;(function interceptOAuthHash() {
  const hash = window.location.hash;
  if (!hash || hash.startsWith('#/')) return; // normal hash-route, skip

  const params = new URLSearchParams(hash.substring(1));

  if (params.has('access_token') && params.has('refresh_token')) {
    // Stash tokens for AuthContext to pick up via setSession()
    sessionStorage.setItem('sb_oauth_access_token', params.get('access_token')!);
    sessionStorage.setItem('sb_oauth_refresh_token', params.get('refresh_token')!);

    // If there's a pending referral, redirect to /auth with the referral
    // params so Auth.tsx can handle linking directly.
    const ref = recoverReferralFromStorage();
    if (ref) {
      const orgSuffix = ref.org ? '&org=' + encodeURIComponent(ref.org) : '';
      const tierSuffix = ref.tier ? '&tier=' + encodeURIComponent(ref.tier) : '';
      window.history.replaceState(null, '', window.location.pathname + '#/auth?ref=' + encodeURIComponent(ref.refId) + '&role=' + encodeURIComponent(ref.role) + orgSuffix + tierSuffix);
    } else if (localStorage.getItem('selected_plan')) {
      // SaaS signup via /get-started — send to onboarding to create org
      window.history.replaceState(null, '', window.location.pathname + '#/onboarding');
    } else {
      // No referral, no plan — clean root path
      window.history.replaceState(null, '', window.location.pathname + '#/');
    }
  } else if (params.has('error')) {
    // OAuth error (user denied consent, etc.) — send to auth page
    sessionStorage.setItem('sb_oauth_error', params.get('error_description') || params.get('error') || 'Sign in failed');
    window.history.replaceState(null, '', window.location.pathname + '#/auth');
  }
})();

// ─── Auto Error Reporter (writes runtime errors to DB for auto-heal) ─────
installAutoErrorReporter();

// ─── Click Tracker (detects dead clicks + rage clicks → bug_reports) ─────
installClickTracker();

createRoot(document.getElementById("root")!).render(<App />);

// Signal to the boot sentinel that React mounted successfully.
// If this line runs, the bundle loaded and React rendered — clear the deadline.
(window as any).__APP_BOOTED = true;
clearTimeout((window as any).__BOOT_DEADLINE);

// ─── Web Vitals ─────────────────────────────────────────────────────────────
import { onCLS, onFID, onLCP, onTTFB, onINP } from 'web-vitals';

function reportVital(metric: { name: string; value: number; id: string; rating: string }) {
  // Report to Sentry
  if (import.meta.env.PROD && sentryDsn) {
    Sentry.setMeasurement(metric.name, metric.value, metric.name === 'CLS' ? '' : 'millisecond');
    if (metric.rating === 'poor') {
      Sentry.captureMessage(`Poor Web Vital: ${metric.name} = ${metric.value}`, { level: 'warning', tags: { vital: metric.name, rating: metric.rating } });
    }
  }
  // Report to auto-error-reporter → bug_reports → sentinel
  reportPoorVital(metric.name, metric.value, metric.rating);
}

onCLS(reportVital);
onFID(reportVital);
onLCP(reportVital);
onTTFB(reportVital);
onINP(reportVital);
