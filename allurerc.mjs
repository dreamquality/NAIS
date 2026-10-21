import { defineConfig } from "allure";

// Allure 3 config: the run history lives outside the report so CI can carry it
// between runs (restored from / published to the gh-pages branch).
export default defineConfig({
  name: "Test Me — e2e",
  output: "allure-report",
  historyPath: "allure-history/history.jsonl",
});
