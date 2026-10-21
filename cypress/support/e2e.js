import 'cypress-plugin-api';
import 'allure-cypress';
import '@testing-library/cypress/add-commands';
import 'cypress-wait-until';
import 'cypress-plugin-grep-boxes'; // checkboxes in the runner to run a subset of tests / tags
import registerCypressGrep from '@bahmutov/cy-grep/src/support';
import failedTestToggle from 'cypress-plugin-last-failed/src/toggle';
import { addMatchImageSnapshotCommand } from '@simonsmith/cypress-image-snapshot/command';
import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector';
import './commands';

registerCypressGrep();
failedTestToggle(); // ↻ "run last failed" toggle in the runner (reads test-results/last-run.json)

installLogsCollector({
  collectTypes: ['cons:warn', 'cons:error', 'cy:log', 'cy:intercept', 'cy:request', 'cy:command'],
});

addMatchImageSnapshotCommand({
  customSnapshotsDir: 'cypress/snapshots',
  customDiffDir: 'reports/snapshot-diffs',
  capture: 'viewport',
  failureThreshold: 0.02,
  failureThresholdType: 'percent',
  customDiffConfig: { threshold: 0.1 },
});
