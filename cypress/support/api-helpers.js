/**
 * Assertion helpers shared by the API specs. They mirror the checks of the
 * Postman collection (status, schema, error *reason*) so the two suites stay
 * comparable.
 */
import { ERROR, TOTALS, expectSchema } from './schemas';

export const AUTH = 'X-Workspace-Token';
export const STOCK = 'Недостатньо товару';
export const NOT_FOUND = 'не знайдено';
export const BAD_FIELDS = 'Перевірте правильність';

export const TEST_DATA = Object.freeze({
  name: 'Олександр Тестовий',
  email: 'test@example.test',
  address: 'Київ, вул. Тестова, 12',
});

export const CHECKOUT_OK = Object.freeze({
  items: [{ product_id: 'p01', quantity: 1 }],
  coupon: 'WELCOME10',
  delivery: 'standard',
  ...TEST_DATA,
  payment: 'approved',
});

export const checkout = (overrides = {}) => ({ ...CHECKOUT_OK, ...overrides });

/** Every product that can be bought (p06 has stock 0). */
export const IN_STOCK_IDS = Array.from({ length: 16 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`).filter(
  (id) => id !== 'p06',
);

/** Assert an error response: status, `{detail}` schema and, optionally, why. */
export function expectError(res, status, { detail, field } = {}) {
  expect(res.status, 'status').to.eq(status);
  expectSchema(res.body, ERROR, 'error body');
  if (detail) expect(res.body.detail, 'error reason').to.include(detail);
  if (field) {
    const fields = (res.body.fields || []).map((f) => JSON.stringify(f));
    expect(fields, '422 points at the offending field').to.include(JSON.stringify(field));
  }
}

/** Assert a quote / order totals block. */
export function expectTotals(totals, { subtotal, discount, shipping }) {
  expectSchema(totals, TOTALS, 'totals');
  expect(totals.subtotal, 'subtotal').to.eq(subtotal);
  expect(totals.discount, 'discount').to.eq(discount);
  expect(totals.shipping, 'shipping').to.eq(shipping);
  expect(totals.total, 'total').to.eq(subtotal - discount + shipping);
  expect(totals.currency).to.eq('UAH');
}
