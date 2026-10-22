/**
 * UI defects found while reading assets/lab.js. Each test asserts the EXPECTED
 * behaviour from the business requirements and therefore fails on the current
 * build — that is the intended outcome (KNOWN BUG; tagged `known-bug` in
 * Allure, no retries). Anything else going red here is a regression.
 */
import { shopPage } from '../pages/shopPage';
import { cartPage } from '../pages/cartPage';
import { COUPON } from '../../support/constants';
import { KNOWN_BUG, labels } from '../../support/allure';
import { describeOnViewports } from '../../support/viewports';

describeOnViewports('UI · Known bugs (expected to fail until fixed)', { tags: ['@ui', '@known-bug'], retries: 0 }, () => {
  beforeEach(() => {
    labels({ epic: 'UI', feature: 'Known bugs' });
    cartPage.interceptQuote();
  });

  it('повторне додавання того самого товару збільшує кількість, а не створює другий рядок кошика (p07)', () => {
    KNOWN_BUG('UI-1', 'lab.js add(): `if (existing && id !== "p07") existing.quantity++; else cart.push(...)` — every click on p07 pushes a new line. Spec: «Одна позиція на product_id».');
    shopPage.launch().search('Фокус');
    shopPage.addToCart('p07').expectToast('Товар додано до кошика');
    shopPage.addToCart('p07');
    shopPage.cartCount.should('have.text', '2');

    shopPage.openCart();
    cartPage.waitForQuote();
    cartPage.expectLineCount(1).expectLine({ id: 'p07', name: 'Фокус', quantity: 2, amount: '1 500,00' }); // 2 × 750 ₴
  });

  it('застосований промокод зберігається після перезавантаження сторінки разом із кошиком', () => {
    KNOWN_BUG('UI-2', 'lab.js persist() writes only {token, cart, compare} to localStorage `test-me:v2`; `coupon` lives in a module variable and is lost on reload — the cart survives, the discount does not. Spec: «кошик і застосований промокод зберігаються після перезавантаження».');
    shopPage.launch().addToCart('p01').expectToast('Товар додано до кошика');
    shopPage.openCart();
    cartPage.expectOpen().waitForQuote();
    cartPage.applyCoupon(COUPON);
    cartPage.expectTotals({ items: '2 400,00', discount: '240,00', shipping: '0,00', total: '2 160,00' });

    cy.reload();
    shopPage.waitForCatalog();
    shopPage.cartCount.should('have.text', '1'); // the cart itself is persisted
    shopPage.openCart();
    cartPage.expectOpen().waitForQuote();
    cartPage.expectLine({ id: 'p01', name: 'Орбіта', quantity: 1, amount: '2 400,00' });
    cartPage.expectTotals({ items: '2 400,00', discount: '240,00', shipping: '0,00', total: '2 160,00' });
    cartPage.expectCoupon(COUPON);
  });

  it('невалідний промокод після очищення поля не блокує перерахунок і оформлення', () => {
    KNOWN_BUG('UI-3', 'lab.js: `coupon` is set only on «Застосувати»; clearing the input does not reset it, so every recalculation (delivery change, quantity ±) re-sends the rejected code → «422 · Невідомий промокод», empty totals, «Оформити» disabled. The only way out is «Застосувати» with an empty field; there is no «remove coupon» control.');
    shopPage.launch().addToCart('p01').expectToast('Товар додано до кошика');
    shopPage.openCart();
    cartPage.expectOpen().waitForQuote();

    // A wrong code is rejected — that part is correct.
    cartPage.applyCoupon('BAD').its('response.statusCode').should('eq', 422);
    cartPage.expectError('Невідомий промокод').expectPlaceOrderEnabled(false);

    // The user clears the field and goes on: the next recalculation must not carry the rejected code.
    cartPage.clearCoupon();
    cartPage.selectDelivery('express');
    cartPage.error.invoke('text').should('eq', ''); // actual: «422 · Невідомий промокод» (the error text is kept in the failure message)
    cartPage.expectTotals({ items: '2 400,00', discount: '0,00', shipping: '150,00', total: '2 550,00' });
    cartPage.expectPlaceOrderEnabled();

    // Same for a quantity change.
    cartPage.increaseQuantity('p01').its('request.body.coupon').should('eq', '');
    cartPage.expectNoError();
    cartPage.expectTotals({ items: '4 800,00', discount: '0,00', shipping: '150,00', total: '4 950,00' });
    cartPage.expectPlaceOrderEnabled();
  });
});
