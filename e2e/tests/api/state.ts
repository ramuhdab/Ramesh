import fs from "fs";
import path from "path";

/**
 * Cross-spec-file shared state. `global.setup.ts` (a Playwright "setup"
 * project - see playwright.config.ts `dependencies`) provisions one
 * organization, its full set of role users, and core master data ONCE,
 * then writes everything every other spec file needs here. Each spec file
 * is independent Node module scope, so this file-based handoff is the
 * standard Playwright pattern for stateful, multi-file integration suites
 * (the alternative - one giant spec file - would make failures much harder
 * to isolate in the HTML report).
 */
export type E2EState = {
  organizationId: string;
  orgAdmin: { username: string; password: string; token: string };
  users: Record<
    "hr" | "storeKeeper" | "techManager" | "seniorManager" | "finance" | "managingDirector",
    { username: string; password: string; token: string; userId: string }
  >;
  masterData: {
    buildingId: string;
    departmentId: string;
    positionId: string;
    employeeCategoryId: string;
    inventoryCategoryId: string;
    itemPolicyId: string;
  };
};

const STATE_FILE = path.join(__dirname, "..", "..", ".e2e-state.json");

export function saveState(state: E2EState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadState(): E2EState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      `E2E state file not found at ${STATE_FILE}. The "setup" project (global.setup.ts) must run before any other spec file - ` +
        `run the full suite with "npx playwright test" (not a single file in isolation) so project dependencies are respected.`
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as E2EState;
}
