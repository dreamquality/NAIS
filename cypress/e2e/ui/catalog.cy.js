/**
 * UI: catalog search, price filter, reset (Page Object: pages/shopPage.js).
 */
import { shopPage } from '../pages/shopPage';
import { labels } from '../../support/allure';
import { describeOnViewports } from '../../support/viewports';

describeOnViewports('UI · Catalog filters and search', { tags: ['@ui', '@catalog'] }, (viewport) => {
  beforeEach(() => {
    labels({ epic: 'UI', feature: 'Catalog' });
    shopPage.launch();
  });

  it('показує 6 товарів на сторінці та лічильник total', () => {
    shopPage.expectCardCount(6).expectStatus(16).expectPage('1 / 3');
    shopPage.productTotal.should('have.text', '16');
  });

  it(`розкладає сітку адаптивно (${viewport.name})`, () => {
    // ≤650px: `.products{grid-template-columns:repeat(2,…)}` — two cards per row; wider: more.
    shopPage.cards.then(($cards) => {
      const columns = new Set([...$cards].map((el) => el.offsetLeft)).size;
      if (viewport.name === 'mobile') expect(columns, 'cards per row').to.eq(2);
      else expect(columns, 'cards per row').to.be.above(2);
    });
    shopPage.card('p01').should('be.visible');
    shopPage.cartButton.should('be.visible');
  });

  it('знаходить наявний товар за фрагментом назви', () => {
    shopPage.search('Орбіта').its('request.url').should('include', 'q=%D0%9E%D1%80%D0%B1%D1%96%D1%82%D0%B0');
    shopPage.expectStatus(1).expectCardCount(1);
    shopPage.card('p01').should('be.visible').and('contain', 'Бездротові навушники «Орбіта»');
    shopPage.expectPricesWithin(2400, 2400);
  });

  it('показує порожній стан для фрагмента без збігів', () => {
    shopPage.search('qwertyuiop');
    shopPage.expectStatus(0);
    shopPage.emptyState.should('be.visible').and('contain', 'Тут поки порожньо');
  });

  it('застосовує ціновий фільтр (1 000 – 2 000 ₴) і показує лише товари в межах діапазону', () => {
    shopPage.applyPriceRange(1000, 2000).its('request.url').should('include', 'min_price=100000').and('include', 'max_price=200000');
    shopPage.expectStatus(5).expectCardCount(5).expectPricesWithin(1000, 2000);
  });

  it('поєднує пошук із категорією та ціною і скидає все', () => {
    shopPage.selectCategory('Audio');
    shopPage.search('нав');
    shopPage.applyPriceRange(2000).its('request.url').should('include', 'category=Audio').and('include', 'min_price=200000');
    shopPage.expectStatus(1).expectCardCount(1);
    shopPage.card('p01').should('exist');

    shopPage.clearFilters().its('request.url').should('include', 'q=&category=&sort=featured&page=1');
    shopPage.expectFiltersCleared().expectCardCount(6).expectStatus(16);
  });

  it('зміна фільтра повертає на сторінку 1', () => {
    shopPage.nextPage().its('request.url').should('include', 'page=2');
    shopPage.expectPage('2 / 3');
    shopPage.selectCategory('Audio').its('request.url').should('include', 'page=1');
    shopPage.expectPage('1 / 1').expectCardCount(3);
  });

  it('«лише в наявності» ховає товар без наявності', () => {
    shopPage.search('Мандрівник');
    shopPage.card('p06').should('contain', 'Немає в наявності');
    shopPage.addToCartButton('p06').should('be.disabled');
    shopPage.toggleInStock().its('request.url').should('include', 'in_stock=true');
    shopPage.expectStatus(0);
  });

  it('сортує за зростанням ціни', () => {
    shopPage.sortBy('price_asc').its('request.url').should('include', 'sort=price_asc');
    shopPage.grid.should('have.attr', 'aria-busy', 'false');
    shopPage.expectPricesAscending();
  });
});
