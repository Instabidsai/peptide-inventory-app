/**
 * Click Tracker — Detects "dead clicks" and "rage clicks" that indicate
 * broken UI elements. Feeds into bug_reports via the auto-error-reporter queue.
 *
 * Dead click: User clicks a button/link → nothing happens within 5 seconds
 *   (no navigation, no fetch, no DOM mutation in key containers).
 *
 * Rage click: User clicks the same element 3+ times within 2 seconds,
 *   indicating frustration with a non-responsive UI.
 *
 * Both are strong signals of silent failures that produce no JS error.
 */

const IS_TEST = import.meta.env.MODE === 'test' || import.meta.env.VITEST;

// ── Config ──────────────────────────────────────────────────
const DEAD_CLICK_TIMEOUT_MS = 5_000;
const RAGE_CLICK_COUNT = 3;
const RAGE_CLICK_WINDOW_MS = 2_000;
const COOLDOWN_PER_ELEMENT_MS = 30_000; // Don't re-report same element within 30s

// ── State ───────────────────────────────────────────────────
const recentClicks: { el: Element; time: number }[] = [];
const reportedElements = new Map<string, number>(); // fingerprint → last reported timestamp
let fetchesSinceClick = 0;
let domMutationsSinceClick = 0;

/** Build a concise fingerprint for an element */
function elFingerprint(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.split(/\s+/).slice(0, 2).join('.')
    : '';
  const text = (el.textContent || '').trim().slice(0, 30);
  return `${tag}${id}${cls}[${text}]`;
}

/** Get human-readable element description for bug reports */
function describeElement(el: Element): Record<string, unknown> {
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    className: typeof el.className === 'string' ? el.className.slice(0, 100) : undefined,
    text: (el.textContent || '').trim().slice(0, 50),
    ariaLabel: el.getAttribute('aria-label') || undefined,
    dataAction: el.getAttribute('data-action') || undefined,
    href: (el as HTMLAnchorElement).href || undefined,
    type: (el as HTMLButtonElement).type || undefined,
    disabled: (el as HTMLButtonElement).disabled || undefined,
  };
}

/**
 * Elements that are expected to produce no fetch/navigation on click.
 * These are NOT bugs — they change local UI state (tabs, accordions, toggles)
 * or are normal interaction patterns (quantity buttons, nav links that use hash routing).
 */
function isBenignClick(el: Element): boolean {
  // Tabs (Radix UI, shadcn) — they change data-state, not fetch
  if (el.getAttribute('role') === 'tab') return true;
  if (el.classList.contains('tab-trigger') || el.hasAttribute('data-radix-collection-item')) return true;

  // Accordion triggers — expand/collapse, no fetch
  if (el.hasAttribute('data-state') && el.closest('[data-radix-accordion-item]')) return true;

  // Sidebar/nav links — hash routing handled by React Router, may not trigger fetch
  if (el.closest('nav') || el.closest('[role="navigation"]') || el.closest('.sidebar')) return true;

  // Quantity increment/decrement buttons — they update local state
  const text = (el.textContent || '').trim();
  if ((text === '+' || text === '-' || text === '−') && el.tagName.toLowerCase() === 'button') return true;

  // Dialog/sheet/popover triggers — they toggle visibility via data-state
  if (el.hasAttribute('data-state') && (el.closest('[role="dialog"]') || el.closest('[data-radix-popper-content-wrapper]'))) return true;

  // Toggle/switch elements
  if (el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'checkbox') return true;

  // Dropdown menu triggers
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'menuitem') return true;
  if (el.hasAttribute('data-radix-dropdown-menu-trigger')) return true;

  // Tooltip triggers — hover-based, click does nothing
  if (el.hasAttribute('data-radix-tooltip-trigger')) return true;

  // Copy-to-clipboard buttons — they write to clipboard, no fetch
  if (el.getAttribute('data-action') === 'copy' || el.classList.contains('copy-button')) return true;

  // File input labels — they open the file picker
  if (el.tagName.toLowerCase() === 'label' && el.querySelector('input[type="file"]')) return true;

  // Informational cards without explicit click handlers (data display)
  if (el.classList.contains('card') && !el.getAttribute('onclick') && !el.hasAttribute('data-action')) return true;

  return false;
}

/** Check if an element is interactive (button, link, input, etc.) */
function isInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) return true;
  if (el.getAttribute('role') === 'button') return true;
  if (el.getAttribute('tabindex') !== null) return true;
  if (el.getAttribute('onclick') !== null) return true;
  if (el.classList.contains('cursor-pointer')) return true;
  return false;
}

/** Find the nearest interactive ancestor (e.g., click on <span> inside <button>) */
function findInteractiveAncestor(el: Element): Element | null {
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 5) {
    if (isInteractive(current)) return current;
    current = current.parentElement;
    depth++;
  }
  return null;
}

/** Report to bug_reports via the auto-error-reporter's queueError */
function reportClickIssue(source: 'dead_click' | 'rage_click', el: Element, extra: Record<string, unknown> = {}) {
  const fp = source + ':' + elFingerprint(el);
  const now = Date.now();
  const lastReported = reportedElements.get(fp);
  if (lastReported && now - lastReported < COOLDOWN_PER_ELEMENT_MS) return;
  reportedElements.set(fp, now);

  // Clean old entries
  if (reportedElements.size > 100) {
    const cutoff = now - COOLDOWN_PER_ELEMENT_MS;
    for (const [k, v] of reportedElements) {
      if (v < cutoff) reportedElements.delete(k);
    }
  }

  const description = describeElement(el);
  const page = window.location.hash || '/';
  const message = source === 'rage_click'
    ? `Rage click (${RAGE_CLICK_COUNT}x in ${RAGE_CLICK_WINDOW_MS / 1000}s): ${elFingerprint(el)}`
    : `Dead click (no response in ${DEAD_CLICK_TIMEOUT_MS / 1000}s): ${elFingerprint(el)}`;

  // Use the auto-error-reporter's raw fetch to write directly
  const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SB_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!SB_URL || !SB_ANON_KEY) return;

  // Try to get JWT from localStorage
  let jwt = SB_ANON_KEY;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.access_token) { jwt = parsed.access_token; break; }
        }
      }
    }
  } catch { /* ignore */ }

  const row = {
    description: `[AUTO] ${source}: ${message}`.slice(0, 500),
    page_url: page,
    user_agent: navigator.userAgent,
    status: 'open',
    console_errors: JSON.stringify({
      source,
      element: description,
      ...extra,
      timestamp: new Date().toISOString(),
    }),
  };

  // Fire and forget — don't block UI
  fetch(`${SB_URL}/rest/v1/bug_reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_ANON_KEY,
      'Authorization': `Bearer ${jwt}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => { /* best effort */ });
}

/**
 * Install click tracking. Call once at app startup.
 */
export function installClickTracker() {
  if (IS_TEST) return;

  // ── DOM mutation observer (counts mutations after click) ──
  let mutationObserver: MutationObserver | null = null;
  try {
    mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
          domMutationsSinceClick++;
        }
        // Count attribute changes that indicate UI state transitions (Radix tabs, dialogs, etc.)
        if (m.type === 'attributes') {
          const attr = m.attributeName;
          if (attr === 'data-state' || attr === 'aria-selected' || attr === 'aria-hidden' || attr === 'hidden') {
            domMutationsSinceClick++;
          }
        }
      }
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'aria-selected', 'aria-hidden', 'hidden'],
    });
  } catch { /* fallback: skip mutation tracking */ }

  // ── Fetch counter (patched into window.fetch) ──
  const prevFetch = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    fetchesSinceClick++;
    return prevFetch(...args);
  };

  // ── Click handler (delegated on document) ──
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (!target) return;

    const interactive = findInteractiveAncestor(target);
    if (!interactive) return; // Not an interactive element, skip

    // Skip disabled elements
    if ((interactive as HTMLButtonElement).disabled) return;

    const now = Date.now();

    // ── Skip benign elements entirely (tabs, nav, quantity buttons, etc.) ──
    if (isBenignClick(interactive)) return;

    // ── Rage click detection ──
    recentClicks.push({ el: interactive, time: now });
    // Clean old entries
    while (recentClicks.length > 0 && now - recentClicks[0].time > RAGE_CLICK_WINDOW_MS) {
      recentClicks.shift();
    }
    // Count clicks on same element
    const sameElClicks = recentClicks.filter(c => c.el === interactive).length;
    if (sameElClicks >= RAGE_CLICK_COUNT) {
      reportClickIssue('rage_click', interactive, { click_count: sameElClicks });
      recentClicks.length = 0; // Reset to avoid re-reporting
      return;
    }

    // ── Dead click detection ──
    // Clicking an input/textarea/select to focus is normal — not a dead click
    const tagLower = interactive.tagName.toLowerCase();
    if (tagLower === 'input' || tagLower === 'textarea' || tagLower === 'select') return;

    // Skip elements inside external links — opening a new tab produces no in-page effect
    if (interactive.closest('a[target="_blank"]')) return;
    if (tagLower === 'a' && (interactive as HTMLAnchorElement).target === '_blank') return;

    // Snapshot current counters
    const fetchBaseline = fetchesSinceClick;
    const mutationBaseline = domMutationsSinceClick;
    const hashBaseline = window.location.hash;

    setTimeout(() => {
      const fetchesFired = fetchesSinceClick - fetchBaseline;
      const mutationsFired = domMutationsSinceClick - mutationBaseline;
      const navigated = window.location.hash !== hashBaseline;

      // If nothing happened after the click — it's dead
      if (fetchesFired === 0 && mutationsFired === 0 && !navigated) {
        // Double-check the element is still in the DOM (wasn't removed by a dialog closing, etc.)
        if (document.body.contains(interactive)) {
          reportClickIssue('dead_click', interactive, {
            fetches_fired: fetchesFired,
            mutations_fired: mutationsFired,
            navigated,
          });
        }
      }
    }, DEAD_CLICK_TIMEOUT_MS);
  }, { capture: true, passive: true });
}
