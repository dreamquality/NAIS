/// <reference types="cypress" />
/**
 * "Мої замовлення" view (#orders-view): order cards with status pill and a
 * collapsible details block.
 */
import { money } from '../../support/constants';

class OrdersPage {
  get list() { return cy.get('#orders-list'); }
  get cards() { return cy.get('[data-testid=order-card]'); }
  get statusSelect() { return cy.get('#order-status'); }
  get searchInput() { return cy.get('#order-search'); }

  interceptList() {
    cy.intercept('GET', '/api/orders?*').as('orders');
    return this;
  }

  waitForList() {
    return cy.wait('@orders');
  }

  /** The app navigates here by hash after a successful checkout. */
  expectOpened() {
    cy.location('hash').should('eq', '#orders');
    return this.waitForList();
  }

  expectCardCount(n) {
    this.cards.should('have.length', n);
    return this;
  }

  /** Assert the first (newest) card: status pill, total and, after expanding, the details. */
  expectFirstOrder({ status, total, lines = [], items, discount, shipping }) {
    this.cards.first().within(() => {
      cy.get('.status-pill').should('have.text', status);
      cy.root().invoke('text').should('match', money(total));
      cy.get('summary').click();
      let chain = cy.root().invoke('text').should('match', /Повний номер: [0-9a-f]{24}/);
      lines.forEach((line) => {
        chain = chain.and('match', new RegExp(line));
      });
      if (items) chain = chain.and('match', money(`Товари: ${items}`));
      if (discount) chain = chain.and('match', money(`Знижка: ${discount}`));
      if (shipping) chain.and('match', money(`Доставка: ${shipping}`));
    });
    return this;
  }
}

export const ordersPage = new OrdersPage();
