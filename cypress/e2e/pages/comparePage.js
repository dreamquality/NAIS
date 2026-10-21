/// <reference types="cypress" />
/**
 * Compare bar (#compare-bar) and the comparison dialog (#compare-dialog).
 * The list is client-side only and persisted in localStorage test-me:v2.
 */
import { money } from '../../support/constants';

class ComparePage {
  get bar() { return cy.get('#compare-bar'); }
  get count() { return cy.get('#compare-count'); }
  get openButton() { return cy.get('#open-compare'); }
  get clearButton() { return cy.get('#clear-compare'); }
  get dialog() { return cy.get('#compare-dialog'); }
  get headerCells() { return cy.get('#compare-content thead th'); }
  get header() { return cy.get('#compare-content thead'); }
  get body() { return cy.get('#compare-content tbody'); }

  toggle(id) {
    cy.get(`[data-compare=${id}]`).click();
    return this;
  }

  open() {
    this.openButton.should('be.enabled').click();
    this.dialog.should('be.visible');
    return this;
  }

  clear() {
    this.clearButton.click();
    return this;
  }

  row(label) { return cy.contains('#compare-content tr', label); }

  // ----------------------------------------------------------- assertions
  expectCount(n) {
    this.count.should('have.text', String(n));
    return this;
  }

  expectSelected(id, selected = true) {
    cy.get(`[data-compare=${id}]`).should('have.attr', 'aria-pressed', String(selected));
    return this;
  }

  expectBarHidden() {
    this.bar.should('not.be.visible');
    return this;
  }

  expectColumns(names) {
    this.headerCells.should('have.length', names.length + 1); // "Параметр" + products
    names.forEach((name) => this.header.should('contain', name));
    return this;
  }

  expectRows(labels) {
    labels.forEach((label) => this.body.should('contain', label));
    return this;
  }

  expectRowAmounts(label, amounts) {
    let chain = this.row(label).invoke('text');
    amounts.forEach((amount) => {
      chain = chain.should('match', money(amount));
    });
    return this;
  }

  expectCell(label, column, text) {
    this.row(label).find('td').eq(column).should('contain', text);
    return this;
  }
}

export const comparePage = new ComparePage();
