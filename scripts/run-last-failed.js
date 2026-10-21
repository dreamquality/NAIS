#!/usr/bin/env node
/**
 * Re-run only the tests that failed in the previous `cypress run`.
 *
 * `cypress-plugin-last-failed` records failures to test-results/last-run.json
 * (see collectFailingTests in cypress.config.js). Its own CLI passes the filter
 * through the CYPRESS_grep environment variable, which Cypress 16 no longer
 * exposes to the browser, so this runner builds the same grep string and hands
 * it to @bahmutov/cy-grep via `expose` using cypress.last-failed.config.js.
 *
 *   npm run cy:last-failed              # electron
 *   node scripts/run-last-failed.js --browser chrome
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'test-results', 'last-run.json');

if (!fs.existsSync(file)) {
  console.log('No previous failed tests detected (test-results/last-run.json missing). Run `npx cypress run` first.');
  process.exit(0);
}

const failed = JSON.parse(fs.readFileSync(file, 'utf8'));
const titles = [...new Set(failed.map(({ parent, test }) => (parent && parent.length ? `${parent.join(' ')} ` : '') + test))];

if (titles.length === 0) {
  console.log('Previous run had no failed tests — nothing to re-run.');
  process.exit(0);
}

console.log(`Re-running ${titles.length} failed test(s):`);
titles.forEach((t) => console.log(`  - ${t}`));

const args = ['cypress', 'run', '--config-file', 'cypress.last-failed.config.js', ...process.argv.slice(2)];
const result = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, LAST_FAILED_GREP: titles.join('; ') },
});
process.exit(result.status ?? 1);
