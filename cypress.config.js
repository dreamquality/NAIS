const { defineConfig } = require('cypress');
const { allureCypress } = require('allure-cypress/reporter');
const { addMatchImageSnapshotPlugin } = require('@simonsmith/cypress-image-snapshot/plugin');
const cypressSplit = require('cypress-split');
const installLogsPrinter = require('cypress-terminal-report/src/installLogsPrinter');
const cyGrepPlugin = require('@bahmutov/cy-grep/src/plugin');
const { collectFailingTests } = require('cypress-plugin-last-failed');

module.exports = defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  screenshotsFolder: 'reports/screenshots',
  videosFolder: 'reports/videos',
  viewportWidth: 1366,
  viewportHeight: 900,
  defaultCommandTimeout: 10000,
  requestTimeout: 15000,
  pageLoadTimeout: 60000,
  // Live-network flakiness is absorbed by a single retry in CI. Tests that are
  // red by design (known bugs) opt out with `{ retries: 0 }` so they fail fast.
  retries: { runMode: 1, openMode: 0 },
  e2e: {
    baseUrl: 'https://test-me.vzl.one',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    // Cypress 16: non-sensitive runtime values live in `expose` (CLI: --expose k=v).
    expose: {
      // @bahmutov/cy-grep — `--expose grepTags=@smoke`, `grepTags=@ui+-@visual`
      grepOmitFiltered: true,
      grepFilterSpecs: true,
      // cypress-plugin-grep-boxes: set to true to pick tests before the first run
      disableInitialAutoRun: false,
    },
    setupNodeEvents(cypressOn, config) {
      // Cypress keeps only the LAST handler registered for an event; allure, cypress-split
      // and last-failed all listen to after:run/after:spec, so merge them.
      const on = require('cypress-on-fix')(cypressOn);

      // cypress-plugin-last-failed — records failures to test-results/last-run.json
      // so `npm run cy:last-failed` re-runs only them (and the runner's ↻ toggle in open mode)
      collectFailingTests(on, config);

      // @bahmutov/cy-grep — tag-based filtering; also powers grep-boxes and last-failed
      cyGrepPlugin(config);

      // cypress-terminal-report — browser console + cy commands printed for failed tests
      installLogsPrinter(on, { printLogsToConsole: 'onFail', includeSuccessfulHookLogs: false });

      // @simonsmith/cypress-image-snapshot — visual regression (specs tagged @visual)
      addMatchImageSnapshotPlugin(on);

      // allure-cypress — results in ./allure-results, report via `npm run allure:generate`
      allureCypress(on, config, {
        resultsDir: 'allure-results',
        environmentInfo: {
          baseUrl: config.baseUrl,
          node: process.version,
          cypress: config.version,
          split: process.env.SPLIT ? `${Number(process.env.SPLIT_INDEX) + 1}/${process.env.SPLIT}` : 'single',
        },
      });

      // cypress-split — shards specs across CI machines via SPLIT / SPLIT_INDEX; no-op locally.
      // Must be last: it rewrites config.specPattern and returns the config.
      return cypressSplit(on, config);
    },
  },
});
