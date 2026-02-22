/** Shared AI chat utilities */

/** Map raw error objects to user-friendly messages */
export function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed'))
    return "Looks like you're offline or the server is unreachable. Check your connection and try again.";
  if (lower.includes('timeout') || lower.includes('timed out'))
    return "The AI took too long to respond. Try a simpler request or try again shortly.";
  if (lower.includes('rate limit') || lower.includes('429'))
    return "Too many requests — please wait a few seconds and try again.";
  if (lower.includes('500') || lower.includes('internal server'))
    return "The AI service hit an internal error. This is usually temporary — try again shortly.";
  if (lower.includes('401') || lower.includes('unauthorized'))
    return "Your session may have expired. Try refreshing the page and signing in again.";
  return `Something went wrong: ${msg}. Please try again.`;
}
