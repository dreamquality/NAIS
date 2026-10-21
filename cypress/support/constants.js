/** Non-secret constants shared by specs and commands (Cypress 16 removed Cypress.env()). */
export const STORAGE_KEY = 'test-me:v2';
export const COUPON = 'WELCOME10';

/** Per-request SLA asserted on every cy.apiAs() call. */
export const RESPONSE_SLA_MS = 5000;

/**
 * Catalog requests made by the UI: the app also fetches `?limit=20` once at
 * boot for its product cache, so the alias matches only the paginated
 * catalog call (`limit=6`) to keep cy.wait() in step with user actions.
 */
export const CATALOG_URL = /\/api\/products\?.*limit=6/;

/** "2 400,00 ₴" (uk-UA, narrow no-break spaces) → 2400 */
export const priceOf = (text) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));

/** Regex that matches a formatted amount regardless of the thousands separator glyph. */
export const money = (amount) => new RegExp(String(amount).replace(/\s/g, '\\s?'));
