import { APIRequestContext, expect } from "@playwright/test";

/**
 * Shared helpers for the API test suite. Reads Super Admin credentials from
 * env vars so they match whatever was actually seeded (see backend/prisma/seed.ts) -
 * defaults match that script's own defaults.
 */
export const SUPER_ADMIN_USERNAME = process.env.SEED_SUPER_ADMIN_USERNAME ?? "superadmin";
export const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe!2026";

// Unique suffix per test run so re-running the suite against a persistent
// dev database doesn't collide on unique constraints (org name, employee
// code, item code, username/email are all unique - see docs/03-Data-Model.md).
export const RUN_ID = Date.now().toString(36);

type Envelope<T> = { data: T; meta?: Record<string, unknown> };

export async function loginSuperAdmin(request: APIRequestContext) {
  const res = await request.post("/auth/login", { data: { username: SUPER_ADMIN_USERNAME, password: SUPER_ADMIN_PASSWORD } });
  expect(res.ok(), `Super Admin login failed: ${await res.text()}`).toBeTruthy();
  const { data } = (await res.json()) as Envelope<{ accessToken: string }>;
  return data.accessToken;
}

export async function login(request: APIRequestContext, username: string, password: string) {
  const res = await request.post("/auth/login", { data: { username, password } });
  expect(res.ok(), `Login failed for ${username}: ${await res.text()}`).toBeTruthy();
  const { data } = (await res.json()) as Envelope<{ accessToken: string; mustChangePassword: boolean }>;
  return data;
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function json<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const body = (await res.json()) as Envelope<T>;
  return body.data;
}

/** Fails with the response body inlined, so a 400/403/404 is legible in the test report instead of a bare "expected 200/201". */
export async function expectOk(res: Awaited<ReturnType<APIRequestContext["get"]>>, label: string) {
  if (!res.ok()) {
    throw new Error(`${label} -> HTTP ${res.status()}: ${await res.text()}`);
  }
}
