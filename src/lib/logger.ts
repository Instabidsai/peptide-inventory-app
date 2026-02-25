/**
 * Lightweight logger that wraps console methods.
 * - In production builds, console.log and console.debug are already stripped by vite (esbuild.pure).
 * - console.warn and console.error are kept for production visibility (Sentry captures these).
 * - This module centralizes logging so we can easily adjust verbosity later.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** Debug info — stripped from production builds by vite */
  debug: (...args: unknown[]) => {
    if (isDev) console.debug('[app]', ...args);
  },

  /** General info — stripped from production builds by vite */
  log: (...args: unknown[]) => {
    if (isDev) console.log('[app]', ...args);
  },

  /** Warnings — visible in production (Sentry captures) */
  warn: (...args: unknown[]) => {
    console.warn('[app]', ...args);
  },

  /** Errors — visible in production (Sentry captures) */
  error: (...args: unknown[]) => {
    console.error('[app]', ...args);
  },
} as const;
