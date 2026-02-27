import * as Sentry from '@sentry/react';

/**
 * Funnel Tracker — Sentry-powered user journey tracking.
 * Uses breadcrumbs for step-by-step flow and captureMessage for milestones.
 * No extra SDK needed — piggybacks on existing Sentry integration.
 */

type FunnelData = Record<string, string | number | boolean | null | undefined>;

function trackStep(step: string, data?: FunnelData) {
  Sentry.addBreadcrumb({
    category: 'funnel',
    message: step,
    data: data as Record<string, unknown>,
    level: 'info',
  });
}

function trackMilestone(name: string, data?: FunnelData) {
  Sentry.captureMessage(`funnel:${name}`, {
    level: 'info',
    extra: data as Record<string, unknown>,
  });
}

// ── Auth funnel ──────────────────────────────────────────────
export function trackAuthPageView() {
  trackStep('auth:page_view');
}

export function trackLoginStart() {
  trackStep('auth:login_start');
}

export function trackSignupStart() {
  trackStep('auth:signup_start');
}

export function trackOAuthStart(provider: string) {
  trackStep('auth:oauth_start', { provider });
}

export function trackAuthSuccess(method: string) {
  trackMilestone('auth:success', { method });
}

export function trackAuthError(method: string, error: string) {
  trackStep('auth:error', { method, error });
}

// ── Store funnel ─────────────────────────────────────────────
export function trackStorePageView() {
  trackStep('store:page_view');
}

export function trackProductView(productId: string, productName: string) {
  trackStep('store:product_view', { productId, productName });
}

export function trackAddToCart(productId: string, productName: string, quantity: number) {
  trackMilestone('store:add_to_cart', { productId, productName, quantity });
}

export function trackCartUpdate(productId: string, newQuantity: number) {
  trackStep('store:cart_update', { productId, newQuantity });
}

export function trackRemoveFromCart(productId: string) {
  trackStep('store:remove_from_cart', { productId });
}

export function trackBeginCheckout(itemCount: number, total: number) {
  trackMilestone('store:begin_checkout', { itemCount, total });
}

// ── Checkout funnel ──────────────────────────────────────────
export function trackCheckoutStart(itemCount: number) {
  trackStep('checkout:start', { itemCount });
}

export function trackOrderCreated(orderId: string, total: number) {
  trackMilestone('checkout:order_created', { orderId, total });
}

export function trackCheckoutRedirect(orderId: string) {
  trackStep('checkout:redirect', { orderId });
}

export function trackCheckoutError(error: string) {
  trackStep('checkout:error', { error });
}

// ── Payment result funnel ────────────────────────────────────
export function trackSuccessPageView(orderId: string | null) {
  trackStep('checkout:success_page', { orderId });
}

export function trackPaymentConfirmed(orderId: string, total: number) {
  trackMilestone('checkout:payment_confirmed', { orderId, total });
}

export function trackPaymentTimeout(orderId: string) {
  trackStep('checkout:payment_timeout', { orderId });
}

export function trackCheckoutCancelled(orderId: string | null) {
  trackMilestone('checkout:cancelled', { orderId });
}
