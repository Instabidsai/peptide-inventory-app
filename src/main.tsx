import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

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
    // Clear hash so HashRouter sees a clean root path
    window.history.replaceState(null, '', window.location.pathname + '#/');
  } else if (params.has('error')) {
    // OAuth error (user denied consent, etc.) — send to auth page
    sessionStorage.setItem('sb_oauth_error', params.get('error_description') || params.get('error') || 'Sign in failed');
    window.history.replaceState(null, '', window.location.pathname + '#/auth');
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
