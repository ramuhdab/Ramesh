import { describe, it, expect, vi } from "vitest";
import { requirePermission, requireSuperAdmin } from "../src/middleware/requirePermission";
import type { Request, Response } from "express";

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

// BRD FR-3 / WF31: RBAC is enforced server-side on every request.
describe("requirePermission middleware", () => {
  it("rejects unauthenticated requests", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission("identity:user:create")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a user missing the required permission", () => {
    const req = { user: { sub: "u1", organizationId: "org1", isSuperAdmin: false, roles: ["Employee"], permissions: ["config:master:view"] } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission("identity:user:create")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a user with the required permission", () => {
    const req = { user: { sub: "u1", organizationId: "org1", isSuperAdmin: false, roles: ["Organization Administrator"], permissions: ["identity:user:create"] } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission("identity:user:create")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("Super Admins bypass organization-scoped permission checks (FR-3)", () => {
    const req = { user: { sub: "u1", organizationId: null, isSuperAdmin: true, roles: [], permissions: [] } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission("identity:user:create")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireSuperAdmin middleware", () => {
  it("blocks an Organization Administrator from Super Admin-only routes (FR-3)", () => {
    const req = { user: { sub: "u1", organizationId: "org1", isSuperAdmin: false, roles: ["Organization Administrator"], permissions: ["platform:org:update"] } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
