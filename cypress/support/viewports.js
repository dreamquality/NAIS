/**
 * Viewport matrix for UI specs. The shop is responsive from 360px (spec.txt), so
 * every UI scenario runs on a desktop and a phone viewport. Use
 * `describeOnViewports()` instead of a plain `describe()`; it creates one
 * `describe` per viewport, sets `cy.viewport()` before the spec's own hooks and
 * adds `@desktop` / `@mobile` tags for @bahmutov/cy-grep:
 *
 *   npx cypress run --expose grepTags=@mobile
 *   npx cypress run --expose grepTags=@ui+-@mobile
 */
export const VIEWPORTS = {
  desktop: { width: 1366, height: 900, tag: '@desktop' },
  mobile: { width: 390, height: 844, tag: '@mobile' }, // iPhone 12/13/14 CSS pixels
};

/** True when the current test runs inside a mobile viewport block. */
export const isMobile = () => Cypress.config('viewportWidth') <= 650;

export function describeOnViewports(title, options, fn) {
  const { tags = [], ...rest } = options;
  Object.entries(VIEWPORTS).forEach(([name, vp]) => {
    describe(`${title} [${name}]`, { ...rest, tags: [...tags, vp.tag] }, () => {
      beforeEach(() => {
        cy.viewport(vp.width, vp.height);
      });
      fn({ name, ...vp });
    });
  });
}
