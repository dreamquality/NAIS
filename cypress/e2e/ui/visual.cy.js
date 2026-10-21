/**
 * Visual regression (@simonsmith/cypress-image-snapshot). Baselines live in
 * cypress/snapshots and are produced by the browser that first ran the spec,
 * so the suite is tagged @visual and excluded from the cross-browser CI matrix:
 *   npx cypress run --expose grepTags=@visual          # run / create baselines
 *   npx cypress run --expose grepTags=@visual,updateSnapshots=true
 */
import { shopPage } from '../pages/shopPage';
import { comparePage } from '../pages/comparePage';
import { labels } from '../../support/allure';
import { describeOnViewports } from '../../support/viewports';

describeOnViewports('UI · Visual snapshots', { tags: ['@ui', '@visual'] }, (viewport) => {
  beforeEach(() => {
    labels({ epic: 'UI', feature: 'Visual' });
    shopPage.launch();
  });

  it('картка товару p01 виглядає як очікувано', () => {
    shopPage.card('p01').find('img').should('be.visible').and(($img) => expect($img[0].naturalWidth).to.be.above(0));
    shopPage.card('p01').matchImageSnapshot(`product-card-p01-${viewport.name}`);
  });

  it('таблиця порівняння p01 + p02 виглядає як очікувано', () => {
    comparePage.toggle('p01').toggle('p02').open();
    // retryable: images inside the freshly opened dialog may still be loading
    cy.get('#compare-content img').each(($img) => cy.wrap($img).should((img) => expect(img[0].naturalWidth).to.be.above(0)));
    cy.get('#compare-content').matchImageSnapshot(`compare-p01-p02-${viewport.name}`);
  });
});
