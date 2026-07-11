import { defineConfig, devices } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000/api/v1";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // the API tests are stateful (org onboarding -> employee -> vendor -> ...), run serially
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    extraHTTPHeaders: { "Content-Type": "application/json" },
  },
  projects: [
    {
      // Provisions one organization + role users + master data ONCE; every
      // other API spec file reads the result from .e2e-state.json instead
      // of re-onboarding an organization per file (see tests/api/state.ts).
      name: "setup",
      testDir: "./tests/api",
      testMatch: /global\.setup\.ts/,
      use: { baseURL: API_BASE_URL },
    },
    {
      name: "api",
      testDir: "./tests/api",
      testIgnore: /global\.setup\.ts/,
      dependencies: ["setup"],
      use: { baseURL: API_BASE_URL },
    },
    {
      // Depends on "setup" too, so UI tests can log in with the same
      // provisioned org admin instead of re-onboarding an organization
      // through the browser (that's exercised thoroughly by the API suite).
      name: "ui",
      testDir: "./tests/ui",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: WEB_BASE_URL },
    },
  ],
});
