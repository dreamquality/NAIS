/**
 * Config used only by scripts/run-last-failed.js: the base config plus a
 * cy-grep title filter taken from LAST_FAILED_GREP. Lives in the project root
 * so cypress-plugin-last-failed keeps writing to ./test-results.
 */
const base = require('./cypress.config');

module.exports = {
  ...base,
  e2e: {
    ...base.e2e,
    expose: {
      ...base.e2e.expose,
      grep: process.env.LAST_FAILED_GREP || '',
      grepFilterSpecs: true,
      grepOmitFiltered: true,
    },
  },
};
