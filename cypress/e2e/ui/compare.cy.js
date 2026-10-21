/**
 * UI: product comparison (Page Objects: pages/shopPage.js, pages/comparePage.js).
 */
import { shopPage } from '../pages/shopPage';
import { comparePage } from '../pages/comparePage';
import { STORAGE_KEY } from '../../support/constants';
import { labels } from '../../support/allure';
import { describeOnViewports } from '../../support/viewports';

describeOnViewports('UI · Compare products', { tags: ['@ui', '@compare'] }, () => {
  beforeEach(() => {
    labels({ epic: 'UI', feature: 'Compare' });
    shopPage.launch();
  });

  it('додає два товари та відкриває таблицю порівняння', () => {
    comparePage.expectBarHidden();
    comparePage.toggle('p01').expectSelected('p01').expectCount(1);
    shopPage.compareButton('p01').should('contain', 'У порівнянні');
    comparePage.openButton.should('be.disabled'); // the table opens from 2 products

    comparePage.toggle('p02').expectCount(2).open();
    comparePage
      .expectColumns(['Орбіта', 'Хвиля'])
      .expectRows(['Ціна', 'Категорія', 'Наявність'])
      .expectRowAmounts('Ціна', ['2 400,00', '1 500,00']);
    comparePage.row('Категорія').find('td').each(($td) => expect($td.text()).to.eq('Аудіо'));
    // p02 has a "Захист" (IPX5) spec that p01 lacks → shown as "—"
    comparePage.expectCell('Захист', 0, '—').expectCell('Захист', 1, 'IPX5');
    comparePage.row('Покупка').find('button[data-add]').should('have.length', 2);
  });

  it('обмежує список трьома товарами', () => {
    ['p01', 'p02', 'p03'].forEach((id) => comparePage.toggle(id));
    comparePage.expectCount(3).toggle('p04');
    shopPage.expectToast('Можна порівняти до трьох товарів');
    comparePage.expectCount(3).expectSelected('p04', false);
  });

  it('прибирає товар повторним натисканням і зберігає список після reload', () => {
    comparePage.toggle('p01').toggle('p02').toggle('p01').expectCount(1);

    cy.reload();
    shopPage.waitForCatalog();
    comparePage.expectCount(1).expectSelected('p02');
    cy.window().then((win) => {
      const saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY));
      expect(saved.compare).to.deep.eq(['p02']);
    });
  });

  it('кнопка очищення спорожнює список', () => {
    comparePage.toggle('p01').toggle('p02').clear();
    comparePage.expectBarHidden().expectSelected('p01', false).expectSelected('p02', false);
  });
});
