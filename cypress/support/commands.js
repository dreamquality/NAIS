/**
 * Shared commands for API and UI specs.
 *
 * Every API call goes through cy.api() (cypress-plugin-api) so the request and
 * response are rendered in the runner. Authentication is the plain
 * X-Workspace-Token header — never a Bearer prefix.
 */
import { STORAGE_KEY, CATALOG_URL, RESPONSE_SLA_MS } from './constants';

/** POST /api/workspaces → yields the new token (201 asserted). */
Cypress.Commands.add('createWorkspace', () =>
  cy
    .api({ method: 'POST', url: '/api/workspaces' })
    .then((res) => {
      expect(res.status, 'workspace created').to.eq(201);
      expect(res.body.token, 'token').to.be.a('string').and.have.length.above(16);
      return res.body.token;
    }),
);

/**
 * cy.api() with the workspace header and failOnStatusCode disabled, so
 * negative cases can assert on 4xx responses.
 *   cy.apiAs(token, { method: 'POST', url: '/api/quote', body })
 * Pass token = null to send the request without the header.
 */
Cypress.Commands.add('apiAs', (token, options) => {
  const headers = { ...(options.headers || {}) };
  if (token !== null && token !== undefined) headers['X-Workspace-Token'] = token;
  return cy.api({ failOnStatusCode: false, ...options, headers }).then((res) => {
    // Cross-cutting checks that apply to every endpoint (success and error alike).
    expect(res.headers['content-type'], 'content-type').to.include('application/json');
    expect(res.duration, 'response time (ms)').to.be.below(RESPONSE_SLA_MS);
    return res;
  });
});

/**
 * Poll the orders list until it holds `count` orders (cypress-wait-until).
 * Used after a UI checkout to cross-check the server without a fixed sleep.
 */
Cypress.Commands.add('waitForOrderCount', (token, count) =>
  cy.waitUntil(
    () => cy.apiAs(token, { url: '/api/orders?status=all' }).then((res) => res.body.items.length === count && res.body),
    { timeout: 10000, interval: 500, errorMsg: `orders list did not reach ${count} orders` },
  ),
);

const waitForCatalog = () => {
  cy.wait('@products');
  cy.get('#catalog-status').should('contain', 'Знайдено товарів');
  cy.get('[data-testid=product-grid]').should('have.attr', 'aria-busy', 'false');
};

/**
 * Open the shop with a known workspace token injected into localStorage
 * (key test-me:v2) before the app script runs, exactly like a returning
 * browser session. Waits for the catalog to finish loading.
 */
Cypress.Commands.add('visitWithToken', (token, { cart = [], compare = [] } = {}) => {
  cy.intercept('GET', CATALOG_URL).as('products');
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, cart, compare }));
    },
  });
  waitForCatalog();
  cy.get('#workspace-status').should('contain', 'Особисте середовище');
});

/**
 * Open the shop on a workspace shared by the whole spec file.
 *
 * The API soft-limits workspace creation to 30/min per IP; letting the app
 * create one on every `cy.visit()` trips that limit once UI specs run on two
 * viewports (the app then shows a 429 in #workspace-status and never loads
 * the catalog). Specs that need isolation (checkout) call
 * `cy.visitWithToken()` with their own fresh token instead.
 */
let sharedToken;
Cypress.Commands.add('visitShop', () => {
  if (sharedToken) {
    cy.visitWithToken(sharedToken);
    return;
  }
  cy.createWorkspace().then((token) => {
    sharedToken = token;
    cy.visitWithToken(token);
  });
});

/**
 * Set a search/number input in one go and fire a single `input` event.
 * cy.type() fires one event per character, which would queue one catalog
 * request per keystroke and desynchronise cy.wait('@products').
 */
Cypress.Commands.add('setInput', { prevSubject: 'element' }, (subject, value) =>
  cy.wrap(subject).invoke('val', value).trigger('input'),
);

/** Read the token the app stored in localStorage. */
Cypress.Commands.add('storedToken', () =>
  cy.window().then((win) => JSON.parse(win.localStorage.getItem(STORAGE_KEY) || '{}').token),
);

/** Toast helper: asserts the message is shown (it auto-hides after 3.5 s). */
Cypress.Commands.add('expectToast', (text) => {
  cy.get('#toast').should('be.visible').and('contain', text);
});
