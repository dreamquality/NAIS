/**
 * UI: full purchase flow (TM-CHECKOUT-001) on a workspace created via cy.api()
 * and injected into localStorage `test-me:v2` before the app boots.
 * Page Objects: pages/shopPage.js, pages/cartPage.js, pages/ordersPage.js.
 */
import { faker } from '@faker-js/faker';
import { shopPage } from '../pages/shopPage';
import { cartPage } from '../pages/cartPage';
import { ordersPage } from '../pages/ordersPage';
import { COUPON } from '../../support/constants';
import { labels } from '../../support/allure';
import { describeOnViewports } from '../../support/viewports';

describeOnViewports('UI · Checkout with WELCOME10 (TM-CHECKOUT-001)', { tags: ['@ui', '@checkout'] }, () => {
  const customer = () => ({
    name: `${faker.person.firstName()} Тестовий`,
    email: faker.internet.email({ provider: 'example.test' }).toLowerCase(),
    address: `Київ, вул. ${faker.location.street()}, ${faker.number.int({ min: 1, max: 99 })}`,
  });

  beforeEach(() => {
    labels({ epic: 'UI', feature: 'Checkout' });
    cartPage.interceptQuote().interceptCheckout();
    ordersPage.interceptList();
  });

  it('оформлює рівно одне підтверджене замовлення на 2 160 грн і спорожнює кошик', { tags: '@smoke' }, () => {
    const contact = customer();
    cy.createWorkspace().as('token');
    cy.get('@token').then((token) => {
      shopPage.launchWithToken(token);
      cy.storedToken().should('eq', token); // the app kept our token instead of creating its own
    });
    shopPage.cartCount.should('have.text', '0');

    // Step 1: add the headphones from the catalog
    shopPage.addToCart('p01').expectToast('Товар додано до кошика');
    shopPage.cartCount.should('have.text', '1');

    // Step 2: open the cart
    shopPage.openCart();
    cartPage.expectOpen().waitForQuote();
    cartPage.expectLineCount(1).expectLine({ id: 'p01', name: 'Орбіта', quantity: 1, amount: '2 400,00' });

    // Step 3: apply the coupon, keep standard delivery
    cartPage.applyCoupon(COUPON).its('request.body').should('deep.include', { coupon: COUPON, delivery: 'standard' });
    cartPage.expectDelivery('standard').expectTotals({ items: '2 400,00', discount: '240,00', shipping: '0,00', total: '2 160,00' });

    // Step 4: contact data + approved payment
    cartPage.fillContact(contact).selectPayment('approved').expectNoError().expectPlaceOrderEnabled();

    // Step 5: place the order once
    cartPage.placeOrder().then(({ request, response }) => {
      expect(response.statusCode).to.eq(201);
      expect(request.body).to.deep.include({ coupon: COUPON, delivery: 'standard', payment: 'approved', ...contact });
      expect(response.body.status).to.eq('confirmed');
      expect(response.body.totals.total).to.eq(216000);
    });
    shopPage.expectToast('Замовлення успішно оформлено');
    cartPage.expectClosed();
    shopPage.cartCount.should('have.text', '0');

    // Step 6: the order is listed with the right status, amount and details
    ordersPage.expectOpened();
    ordersPage.expectCardCount(1).expectFirstOrder({
      status: 'Підтверджено',
      total: '2 160,00',
      lines: ['Орбіта» × 1'],
      items: '2 400,00',
      discount: '240,00',
      shipping: '0,00',
    });

    // API cross-check in the same workspace: exactly one order, no duplicate (polled, no fixed sleep)
    cy.get('@token').then((token) => {
      cy.waitForOrderCount(token, 1).then((body) => {
        expect(body.items[0].totals.total).to.eq(216000);
      });
    });

    // Step 7: reload — the order survives, the cart stays empty
    cy.reload();
    ordersPage.waitForList();
    ordersPage.expectCardCount(1);
    ordersPage.cards.should('contain', 'Підтверджено');
    shopPage.cartCount.should('have.text', '0');
    shopPage.openCart();
    cartPage.expectEmpty();
  });

  it('відхилений платіж показує помилку та зберігає кошик', () => {
    cy.createWorkspace().then((token) => {
      shopPage.launchWithToken(token, { cart: [{ product_id: 'p01', quantity: 1 }] });
    });
    shopPage.cartCount.should('have.text', '1');
    shopPage.openCart();
    cartPage.fillContact(customer()).selectPayment('declined');
    cartPage.placeOrder().its('response.statusCode').should('eq', 402);
    cartPage.expectError('402', 'відхилено').expectOpen();
    shopPage.cartCount.should('have.text', '1');
  });

  it('невідомий промокод відхиляється з повідомленням сервера', () => {
    cy.createWorkspace().then((token) => {
      shopPage.launchWithToken(token, { cart: [{ product_id: 'p01', quantity: 1 }] });
    });
    shopPage.openCart();
    cartPage.waitForQuote();
    cartPage.applyCoupon('NOPE').its('response.statusCode').should('eq', 422);
    cartPage.expectError('Невідомий промокод').expectPlaceOrderEnabled(false);
  });
});
