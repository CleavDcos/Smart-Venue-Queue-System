/**
 * services/analytics.js — Google Analytics 4 (GA4) integration
 *
 * Uses gtag.js loaded via index.html.
 * Measurement ID is read from VITE_GA_MEASUREMENT_ID env var.
 *
 * GA4 docs: https://developers.google.com/analytics/devguides/collection/ga4
 */

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

/**
 * Check whether GA4 is available in the current browser context.
 */
const isGaAvailable = () =>
  typeof window !== 'undefined' &&
  typeof window.gtag === 'function' &&
  Boolean(GA_ID);

/**
 * Track a page view.
 * Called on every route change from the router.
 *
 * @param {string} path   — e.g. '/', '/admin', '/queue'
 * @param {string} title  — Human-readable page title
 */
export const trackPageView = (path, title) => {
  if (!isGaAvailable()) return;
  window.gtag('config', GA_ID, {
    page_path: path,
    page_title: title || document.title,
  });
};

/**
 * Track a custom event.
 *
 * @param {string} eventName  — GA4 event name (snake_case recommended)
 * @param {Object} params     — Optional event parameters
 */
export const trackEvent = (eventName, params = {}) => {
  if (!isGaAvailable()) return;
  window.gtag('event', eventName, params);
};

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Called when a user successfully joins a queue */
export const trackQueueJoin = (category, stallName) =>
  trackEvent('queue_join', { event_category: 'Queue', queue_category: category, stall_name: stallName });

/** Called when an admin opens the dashboard */
export const trackAdminDashboardView = (eventId) =>
  trackEvent('admin_dashboard_view', { event_category: 'Admin', event_id: eventId });

/** Called when the rebalance action is triggered */
export const trackRebalanceTrigger = (eventId) =>
  trackEvent('rebalance_trigger', { event_category: 'Admin', event_id: eventId });

/** Called when a user cancels their token */
export const trackQueueCancel = () =>
  trackEvent('queue_cancel', { event_category: 'Queue' });
