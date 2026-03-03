/**
 * Service Guard — In-memory circuit breaker for external service calls.
 *
 * Prevents cascading failures when OpenAI, Resend, or other external
 * services are down. Instead of hammering a dead API and timing out,
 * the guard opens the circuit after N failures and returns fast errors
 * until the service recovers.
 *
 * Edge functions are short-lived — each invocation starts fresh.
 * To share state between invocations on the same Deno isolate,
 * we use module-level Maps. Different isolates will have independent
 * state, which is fine (conservative: each isolate discovers outages
 * independently).
 *
 * Usage:
 *   import { callWithGuard, ServiceUnavailableError } from "../_shared/service-guard.ts";
 *
 *   const result = await callWithGuard("openai", () =>
 *     openai.chat.completions.create({ ... })
 *   );
 */

/** How many consecutive failures before the circuit opens */
const FAILURE_THRESHOLD = 3;

/** How long (ms) the circuit stays open before allowing a probe request */
const OPEN_DURATION_MS = 30_000; // 30 seconds

/** Maximum time (ms) to wait for an external call before aborting */
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

interface CircuitState {
  failures: number;
  openedAt: number | null; // timestamp when circuit opened, null = closed
  lastError: string;
}

const circuits = new Map<string, CircuitState>();

function getCircuit(service: string): CircuitState {
  let state = circuits.get(service);
  if (!state) {
    state = { failures: 0, openedAt: null, lastError: "" };
    circuits.set(service, state);
  }
  return state;
}

/** Thrown when the circuit is open (service recently failed repeatedly) */
export class ServiceUnavailableError extends Error {
  public readonly service: string;
  public readonly retryAfterMs: number;

  constructor(service: string, lastError: string, retryAfterMs: number) {
    super(
      `${service} is temporarily unavailable (${lastError}). Try again in ${Math.ceil(retryAfterMs / 1000)}s.`
    );
    this.name = "ServiceUnavailableError";
    this.service = service;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Check if a service's circuit is currently open.
 * Returns { open: false } if the call should proceed,
 * or { open: true, retryAfterMs, lastError } if the circuit is open.
 */
export function checkCircuit(service: string): {
  open: boolean;
  retryAfterMs?: number;
  lastError?: string;
} {
  const state = getCircuit(service);
  if (state.openedAt === null) return { open: false };

  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= OPEN_DURATION_MS) {
    // Half-open: allow one probe request through
    return { open: false };
  }

  return {
    open: true,
    retryAfterMs: OPEN_DURATION_MS - elapsed,
    lastError: state.lastError,
  };
}

/** Record a success — resets the circuit to closed */
function recordSuccess(service: string): void {
  const state = getCircuit(service);
  state.failures = 0;
  state.openedAt = null;
  state.lastError = "";
}

/** Record a failure — may open the circuit */
function recordFailure(service: string, error: string): void {
  const state = getCircuit(service);
  state.failures++;
  state.lastError = error.slice(0, 200);

  if (state.failures >= FAILURE_THRESHOLD) {
    state.openedAt = Date.now();
    console.warn(
      `[service-guard] Circuit OPEN for ${service} after ${state.failures} failures: ${state.lastError}`
    );
  }
}

/**
 * Whether an error is transient (network/timeout/5xx) vs permanent (auth/validation).
 * Only transient errors should count toward the circuit breaker.
 */
function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  // Network failures
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("dns")) return true;
  // Timeouts
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted")) return true;
  // Server errors (5xx)
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("internal server")) return true;
  // Rate limits (temporary)
  if (msg.includes("429") || msg.includes("rate limit")) return true;
  // OpenAI specific
  if (msg.includes("overloaded") || msg.includes("capacity") || msg.includes("service unavailable")) return true;
  return false;
}

/**
 * Call an external service with circuit breaker protection and timeout.
 *
 * @param service - Name of the external service (e.g., "openai", "resend")
 * @param fn - The async function that calls the external service
 * @param timeoutMs - Max time to wait (default 30s)
 * @returns The result of fn()
 * @throws ServiceUnavailableError if the circuit is open
 * @throws The original error if fn() fails and the circuit isn't tripped yet
 */
export async function callWithGuard<T>(
  service: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  // 1. Check circuit
  const status = checkCircuit(service);
  if (status.open) {
    throw new ServiceUnavailableError(service, status.lastError!, status.retryAfterMs!);
  }

  // 2. Race the call against a timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${service} call timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    recordSuccess(service);
    return result;
  } catch (err) {
    if (isTransientError(err)) {
      recordFailure(service, err instanceof Error ? err.message : String(err));
    }
    throw err;
  }
}

/**
 * Get the health status of all tracked services.
 * Useful for health-probe / admin dashboard.
 */
export function getServiceHealth(): Record<string, {
  status: "healthy" | "degraded" | "down";
  failures: number;
  lastError: string;
  openedAt: number | null;
}> {
  const result: Record<string, any> = {};
  for (const [name, state] of circuits.entries()) {
    let status: "healthy" | "degraded" | "down" = "healthy";
    if (state.openedAt !== null) {
      const elapsed = Date.now() - state.openedAt;
      status = elapsed < OPEN_DURATION_MS ? "down" : "degraded";
    } else if (state.failures > 0) {
      status = "degraded";
    }
    result[name] = {
      status,
      failures: state.failures,
      lastError: state.lastError,
      openedAt: state.openedAt,
    };
  }
  return result;
}

/**
 * Build a user-friendly degradation message for a specific service.
 * Used by edge functions to return helpful 503 responses.
 */
export function degradedResponse(
  service: string,
  corsHeaders: Record<string, string>,
): Response {
  const status = checkCircuit(service);
  const retryAfter = status.retryAfterMs
    ? Math.ceil(status.retryAfterMs / 1000)
    : 30;

  const messages: Record<string, string> = {
    openai: "The AI assistant is temporarily unavailable. Your message has been saved and you can try again shortly.",
    resend: "Email delivery is temporarily unavailable. Your email has been queued and will be sent when the service recovers.",
    geoapify: "Address autocomplete is temporarily unavailable. You can type your address manually.",
    composio: "External integrations are temporarily unavailable. Please try again in a moment.",
  };

  return new Response(
    JSON.stringify({
      error: messages[service] || `${service} is temporarily unavailable. Try again shortly.`,
      service,
      retryAfterSeconds: retryAfter,
      degraded: true,
    }),
    {
      status: 503,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
