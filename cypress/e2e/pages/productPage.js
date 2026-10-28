/// <reference types="cypress" />


import { money } from '../../support/constants';

class ProductPage {
  get dialog() { return cy.get('#product-dialog'); }
  get title() { return cy.get('#detail-title'); }
  get workspaceStatus() { return cy.get('#workspace-status')}
  get savedReview() { return cy.get('#saved-review'); }
  get reviewForm() { return cy.get('#review-form'); }
  get ratingSelect() {return cy.findByLabelText('Оцінка')}
  get reviewText() { return cy.findByLabelText('Поділіться враженнями')}
  get submitReviewButton() { return this.reviewForm.findByRole('button', {name: 'Залишити відгук'}); }
  get reviewError() { return cy.get('#review-error')}
  get savedReviewCard() {return this.savedReview.find('.review-card')}

  interceptReview(id){
    cy.intercept('GET', `/api/products/${id}/review`).as('getReview')
    cy.intercept('POST', `/api/products/${id}/review`).as('postReview')
    return this;
  }

  waitForReview() {
    return cy.wait('@getReview')
  }

  leaveReview({rating, text}) {
    if ( rating !== undefined) this.ratingSelect.select(String(rating))
      this.reviewText.type(text)
      this.submitReviewButton.click()
      return cy.wait('@postReview')
  }

  // assertetions and expectations 


  expectOpen(name) {
    this.dialog.should('be.visible')
    if (name) this.title.should('contain', name)
    return this
  }

  expectNoReview() {
    this.savedReview.should('be.empty')
    return this 
  }

  expectError(...fragments) {
    fragments.forEach((f) => this.reviewError.should('contain', f) )
    return this
  }

  expectNoError() {
    this.reviewError.should('be.empty')
    return this     
  }

  expectSubmitEnabled(enabled = true) {
    this.submitReviewButton.should(enabled ? "be.enabled" : "be.disabled")
    return this 
  }

  expectSavedReview({rating, text}) {
    this.savedReviewCard.find('strong').should('have.text', `${'★'.repeat(rating)} · Ваш відгук`);
    this.savedReviewCard.find('p').should('have.text', text)
    this.reviewForm.should('not.be.visible');
    return this
  }



}

export const productPage = new ProductPage();
