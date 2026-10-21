/**
 * Daily smoke: one self-contained happy path through the API.
 *   npx cypress run --spec cypress/e2e/smoke.cy.js
 */
import { HEALTH, PRODUCTS, PRODUCT, TOTALS, ORDER, expectSchema } from '../support/schemas';
import { CHECKOUT_OK } from '../support/api-helpers';

describe('00 Smoke', { tags: ['@api', '@smoke'] }, () => {
  let token;
  let orderId;

  it('health відповідає ok', () => {
    cy.api({ url: '/api/health' }).then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, HEALTH);
    });
  });

  it('створює середовище', () => {
    cy.createWorkspace().then((t) => (token = t));
  });

  it('каталог завантажується і містить p01', () => {
    cy.api({ url: '/api/products' }).then((res) => {
      expectSchema(res.body, PRODUCTS);
      expect(res.body.items.map((p) => p.id)).to.include('p01');
    });
    cy.api({ url: '/api/products/p01' }).then((res) => expectSchema(res.body, PRODUCT));
  });

  it('розраховує кошик із WELCOME10 на 2 160 грн', () => {
    cy.apiAs(token, { method: 'POST', url: '/api/quote', body: { items: CHECKOUT_OK.items, coupon: 'WELCOME10', delivery: 'standard' } }).then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, TOTALS);
      expect(res.body.total).to.eq(216000);
    });
  });

  it('оформлює, читає та скасовує замовлення', () => {
    cy.apiAs(token, { method: 'POST', url: '/api/orders', body: CHECKOUT_OK }).then((res) => {
      expect(res.status).to.eq(201);
      expectSchema(res.body, ORDER);
      expect(res.body.status).to.eq('confirmed');
      expect(res.body.totals.total).to.eq(216000);
      orderId = res.body.id;
    });
    cy.then(() => {
      cy.apiAs(token, { url: `/api/orders/${orderId}` }).then((res) => expect(res.status).to.eq(200));
      cy.apiAs(token, { method: 'POST', url: `/api/orders/${orderId}/cancel` }).then((res) => expect(res.body.status).to.eq('cancelled'));
    });
  });
});
