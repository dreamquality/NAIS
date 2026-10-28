/// <reference types="cypress" />
/**
 * Catalog view (#shop-view): search, category buttons, price filters,
 * sorting, pagination and product cards.
 *
 * Selector strategy (Testing Library priority): accessible role/label first
 * (`findByRole`, `findByLabelText`), then `data-testid`, CSS ids only where
 * the markup offers nothing better.
 */
import { CATALOG_URL, priceOf } from '../../support/constants';

class ShopPage {
  get searchInput() { return cy.findByLabelText('Пошук товарів'); }
  get sortSelect() { return cy.findByLabelText('Сортування товарів'); }
  get minPriceInput() { return cy.findByLabelText('Мінімальна ціна'); }
  get maxPriceInput() { return cy.findByLabelText('Максимальна ціна'); }
  get applyPriceButton() { return cy.get('#price-filters').findByRole('button', { name: 'Застосувати' }); }
  get inStockCheckbox() { return cy.findByLabelText('Лише в наявності'); }
  get clearFiltersButton() { return cy.findByRole('button', { name: 'Скинути фільтри' }); }
  get catalogStatus() { return cy.get('#catalog-status'); }
  get productTotal() { return cy.get('#product-total'); }
  get grid() { return cy.get('[data-testid=product-grid]'); }
  get cards() { return this.grid.find('article.product-card'); }
  get emptyState() { return this.grid.find('.empty-state'); }
  get pageInfo() { return cy.get('#page-info'); }
  get prevButton() { return cy.findByRole('button', { name: 'Попередня сторінка' }); }
  get nextButton() { return cy.findByRole('button', { name: 'Наступна сторінка' }); }
  get cartCount() { return cy.get('#cart-count'); }
  get cartButton() { return cy.get('[data-testid=cart-open]'); }

  card(id) { return cy.get(`[data-testid=product-${id}]`); }
  addToCartButton(id) { return this.card(id).find(`[data-add=${id}]`); }
  compareButton(id) { return cy.get(`[data-compare=${id}]`); }
  categoryButton(category) { return cy.get(`[data-category="${category}"]`); }

  /** Open the shop and let the app create its own workspace. */
  launch() {
    cy.visitShop();
    return this;
  }

  /** Open the shop with a known token injected into localStorage before boot. */
  launchWithToken(token, state) {
    cy.visitWithToken(token, state);
    return this;
  }

  /** The app fires one catalog request per `input` event; `setInput` fires exactly one. */
  search(text) {
    this.searchInput.setInput(text);
    return this.waitForCatalog();
  }

  selectCategory(category) {
    this.categoryButton(category).click();
    return this.waitForCatalog();
  }

  applyPriceRange(min, max) {
    if (min !== undefined) this.minPriceInput.setInput(String(min));
    if (max !== undefined) this.maxPriceInput.setInput(String(max));
    this.applyPriceButton.click();
    return this.waitForCatalog();
  }

  toggleInStock() {
    this.inStockCheckbox.check();
    return this.waitForCatalog();
  }

  sortBy(value) {
    this.sortSelect.select(value);
    return this.waitForCatalog();
  }

  nextPage() {
    this.nextButton.click();
    return this.waitForCatalog();
  }

  clearFilters() {
    this.clearFiltersButton.click();
    return this.waitForCatalog();
  }

  /** Waits for the next paginated catalog request and yields its interception. */
  waitForCatalog() {
    return cy.wait('@products');
  }

  addToCart(id) {
    this.addToCartButton(id).should('contain', 'До кошика').click();
    return this;
  }

  openCart() {
    this.cartButton.click();
    return this;
  }

  // ----------------------------------------------------------- assertions
  expectStatus(total) {
    this.catalogStatus.should('contain', `Знайдено товарів: ${total}`);
    return this;
  }

  expectCardCount(n) {
    this.cards.should('have.length', n);
    return this;
  }

  expectPage(text) {
    this.pageInfo.should('have.text', text);
    return this;
  }

  expectFiltersCleared() {
    this.searchInput.should('have.value', '');
    this.minPriceInput.should('have.value', '');
    this.maxPriceInput.should('have.value', '');
    this.categoryButton('').should('have.class', 'selected');
    return this;
  }

  /** Every visible card price is within [min, max] ₴. */
  expectPricesWithin(min, max) {
    this.cards.each(($card) => {
      expect(priceOf($card.find('.price').text()), $card.find('h3').text()).to.be.within(min, max);
    });
    return this;
  }

  expectPricesAscending() {
    this.cards.find('.price').then(($prices) => {
      const values = [...$prices].map((el) => priceOf(el.textContent));
      expect(values).to.deep.eq([...values].sort((a, b) => a - b));
    });
    return this;
  }

  expectToast(text) {
    cy.expectToast(text);
    return this;
  }

  productTitle(id) {
    return this.card(id).find(`.product-title[data-detail=${id}]`)
  }

  openProduct(id) {
    this.productTitle(id).click()
    return this
  }
 
}

export const shopPage = new ShopPage();
export { CATALOG_URL };
