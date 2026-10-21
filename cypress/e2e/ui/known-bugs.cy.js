/**
 * UI defect found while reading assets/lab.js. The test asserts the EXPECTED
 * behaviour from spec.txt and therefore fails on the current build — that is
 * the intended outcome (KNOWN BUG; tagged `known-bug` in Allure, no retries).
 */
import { shopPage } from '../pages/shopPage';
import { cartPage } from '../pages/cartPage';
import { KNOWN_BUG, labels } from '../../support/allure';
import { describeOnViewports } from '../../support/viewports';

describeOnViewports('UI · Known bugs (expected to fail until fixed)', { tags: ['@ui', '@known-bug'], retries: 0 }, () => {
  beforeEach(() => {
    labels({ epic: 'UI', feature: 'Known bugs' });
  });

  it('повторне додавання того самого товару збільшує кількість, а не створює другий рядок кошика (p07)', () => {
    KNOWN_BUG('UI-1', 'lab.js add(): `if (existing && id !== "p07") existing.quantity++; else cart.push(...)` — every click on p07 pushes a new line. Spec: «Одна позиція на product_id».');
    cartPage.interceptQuote();
    shopPage.launch().search('Фокус');
    shopPage.addToCart('p07').expectToast('Товар додано до кошика');
    shopPage.addToCart('p07');
    shopPage.cartCount.should('have.text', '2');

    shopPage.openCart();
    cartPage.waitForQuote();
    cartPage.expectLineCount(1).expectLine({ id: 'p07', name: 'Фокус', quantity: 2, amount: '1 500,00' }); // 2 × 750 ₴
  });
});
