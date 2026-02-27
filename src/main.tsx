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
  const orgSuffix = org ? `&org=${encodeURIComponent(org)}` : '';
  // Store referral in sessionStorage + localStorage as backup
  sessionStorage.setItem('partner_ref', ref);
  sessionStorage.setItem('partner_ref_role', role);
  if (org) sessionStorage.setItem('partner_ref_org', org);
  localStorage.setItem('partner_ref', JSON.stringify({ refId: ref, role, orgId: org || null, ts: Date.now() }));
  // Rewrite URL to hash-based route
  window.history.replaceState(null, '', `/#/auth?ref=${encodeURIComponent(ref)}&role=${encodeURIComponent(role)}${orgSuffix}`);
})();

// ─── OAuth Hash Interceptor ───────────────────────────────────────────────
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

    // If there's a pending referral in sessionStorage, redirect to /auth
    // with the referral params so Auth.tsx can handle linking directly.
    // This is more robust than relying on Onboarding to pick it up later.
    const refId = sessionStorage.getItem('partner_ref');
    if (refId) {
      const role = sessionStorage.getItem('partner_ref_role') || 'customer';
      const org = sessionStorage.getItem('partner_ref_org') || '';
      const orgSuffix = org ? '&org=' + encodeURIComponent(org) : '';
      window.history.replaceState(null, '', window.location.pathname + '#/auth?ref=' + encodeURIComponent(refId) + '&role=' + encodeURIComponent(role) + orgSuffix);
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
