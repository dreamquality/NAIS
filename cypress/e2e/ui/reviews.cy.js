import { productPage } from "../pages/productPage"
import { shopPage } from "../pages/shopPage"
import { describeOnViewports } from "../../support/viewports";


describeOnViewports('UI - Verify reviews of product page',{ tags: ["@id"]}, () => {

  const PRODUCT = { id: "p01", name: "Орбіта"}
  const REVIEW = { rating: 4, text: "Test review"}

  beforeEach(() => {
    productPage.interceptReview("p01")
    cy.createWorkspace().then(token => {
      shopPage.launchWithToken(token);
    });
    shopPage.openProduct(PRODUCT.id)
    productPage.expectOpen(PRODUCT.name).waitForReview()
  });

  it('verify review has been added', () => {

    productPage.expectNoReview()

    productPage.leaveReview(REVIEW).then(({request, response})=> {
      expect(response.statusCode, "Status").to.eq(201)
    })

    productPage.expectNoError()

    cy.reload()

    shopPage.openProduct(PRODUCT.id)
    productPage.expectOpen(PRODUCT.name).waitForReview()
    productPage.expectSavedReview(REVIEW)

  });

  it('verify review has not been added', () => {
    cy.visit('/')
    cy.get('#workspace-status').should('contain', 'Особисте середовище · діє 24 години')
    cy.get('[data-testid="product-p01"]').click()
    cy.get('#product-dialog').should('be.visible')
    cy.get('#detail-title').should('contain', 'Бездротові навушники «Орбіта»')
    cy.wait('@getReview')
    cy.get('#review-form').should('be.visible')
    cy.get('#saved-review').should('be.empty')
    cy.get('#review-rating').select('4')
    cy.get('#review-text').type('                    ok     ')
    cy.contains('#review-form button', 'Залишити відгук').click()

    cy.wait('@postReview').then((response) => {
      expect(response.response.statusCode).to.eq(422)
    })

    cy.get('#review-error').should('be.visible')
    cy.get('#saved-review').should('be.empty')
    cy.contains('#review-form button', 'Залишити відгук').should('be.enabled')

  });


});
