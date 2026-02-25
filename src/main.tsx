import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { installAutoErrorReporter } from './lib/auto-error-reporter'
import App from './App.tsx'
import './index.css'

// ─── Error Monitoring (Sentry) ──────────────────────────────────────────────
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0.3,
    replaysSessionSampleRate: 0,
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
      window.history.replaceState(null, '', window.location.pathname + '#/auth?ref=' + encodeURIComponent(refId) + '&role=' + encodeURIComponent(role));
    } else {
      // No referral — clean root path
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

createRoot(document.getElementById("root")!).render(<App />);

// ─── Web Vitals ─────────────────────────────────────────────────────────────
import { onCLS, onFID, onLCP, onTTFB, onINP } from 'web-vitals';

function reportVital(metric: { name: string; value: number; id: string }) {
  // In production, send to Sentry as custom measurement
  if (import.meta.env.PROD && sentryDsn) {
    Sentry.metrics?.distribution(metric.name, metric.value, { unit: 'millisecond', tags: { id: metric.id } });
  }
}

onCLS(reportVital);
onFID(reportVital);
onLCP(reportVital);
onTTFB(reportVital);
onINP(reportVital);
