/**
 * Thin wrappers over the Allure runtime API so specs stay declarative.
 * A test that is red by design (server deviates from spec.txt) is tagged
 * `known-bug` and linked to the README defect table, which makes it easy to
 * filter in the report and to tell real regressions from expected failures.
 */
import { tag, severity, link, description, epic, feature, story } from 'allure-js-commons';

export const KNOWN_BUG = (id, summary) => {
  tag('known-bug');
  severity('normal');
  link(`https://github.com/dreamquality/NAIS#known-bugs`, `BUG-${id}`, 'issue');
  description(`**KNOWN BUG-${id}.** ${summary}\n\nThe test asserts the behaviour required by spec.txt; it stays red until the server is fixed.`);
};

export const labels = ({ epic: e, feature: f, story: s }) => {
  if (e) epic(e);
  if (f) feature(f);
  if (s) story(s);
};
