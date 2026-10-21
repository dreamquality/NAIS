/// <reference types="cypress" />
/**
 * Cart dialog (#bag-dialog): lines, coupon, delivery, totals and the checkout
 * form. Totals are recalculated through POST /api/quote on every change.
 * Form controls are queried by their accessible label (Testing Library).
 */
import { money } from '../../support/constants';

class CartPage {
  get dialog() { return cy.get('#bag-dialog'); }
  get items() { return cy.get('#bag-items'); }
  get lines() { return cy.get('#bag-items .bag-line'); }
  get couponInput() { return cy.findByLabelText('Промокод'); }
  get applyCouponButton() { return cy.get('.coupon-row').findByRole('button', { name: 'Застосувати' }); }
  get deliverySelect() { return cy.findByLabelText('Спосіб доставки'); }
  get totals() { return cy.get('#totals'); }
  get grandTotal() { return cy.get('[data-testid=cart-total]'); }
  get nameInput() { return cy.findByLabelText("Ім'я та прізвище"); }
  get emailInput() { return cy.findByLabelText('Електронна пошта'); }
  get addressInput() { return cy.findByLabelText('Адреса доставки'); }
  get paymentSelect() { return cy.findByLabelText('Результат тестової оплати'); }
  get error() { return cy.get('#checkout-error'); }
  get placeOrderButton() { return cy.get('[data-testid=place-order]'); }

  quantity(id) { return cy.get(`[data-testid=quantity-${id}]`); }

  /** Register the intercepts this page relies on; call before visiting. */
  interceptQuote() {
    cy.intercept('POST', '/api/quote').as('quote');
    return this;
  }

  interceptCheckout() {
    cy.intercept('POST', '/api/orders').as('checkout');
    return this;
  }

  waitForQuote() {
    return cy.wait('@quote');
  }

  applyCoupon(code) {
    this.couponInput.type(code);
    this.applyCouponButton.click();
    return this.waitForQuote();
  }

  fillContact({ name, email, address }) {
    this.nameInput.type(name);
    this.emailInput.type(email);
    this.addressInput.type(address);
    return this;
  }

  selectPayment(value) {
    this.paymentSelect.select(value);
    return this;
  }

  placeOrder() {
    this.placeOrderButton.click();
    return cy.wait('@checkout');
  }

  // ----------------------------------------------------------- assertions
  expectOpen() {
    this.dialog.should('be.visible');
    return this;
  }

  expectClosed() {
    this.dialog.should('not.be.visible');
    return this;
  }

  expectEmpty() {
    this.items.should('contain', 'Ваш кошик порожній');
    return this;
  }

  expectLine({ id, name, quantity, amount }) {
    this.lines.should('contain', name);
    this.quantity(id).should('have.text', String(quantity));
    this.lines.find('.price').invoke('text').should('match', money(amount));
    return this;
  }

  expectLineCount(n) {
    this.lines.should('have.length', n);
    return this;
  }

  /** @param {{items, discount, shipping, total}} amounts formatted like '2 400,00' */
  expectTotals({ items, discount, shipping, total }) {
    cy.contains('#totals div', 'Товари').invoke('text').should('match', money(items));
    cy.contains('#totals div', 'Знижка').invoke('text').should('match', money(discount));
    cy.contains('#totals div', 'Доставка').invoke('text').should('match', money(shipping));
    this.grandTotal.invoke('text').should('match', money(total));
    return this;
  }

  expectDelivery(value) {
    this.deliverySelect.should('have.value', value);
    return this;
  }

  expectNoError() {
    this.error.should('be.empty');
    return this;
  }

  expectError(...fragments) {
    fragments.forEach((f) => this.error.should('contain', f));
    return this;
  }

  expectPlaceOrderEnabled(enabled = true) {
    this.placeOrderButton.should(enabled ? 'be.enabled' : 'be.disabled');
    return this;
  }
}

export const cartPage = new CartPage();
