import { describe, it, expect } from "vitest";
import { validatePasswordPolicy, generateTemporaryPassword, hashPassword, comparePassword, isPasswordReused } from "../src/utils/password";

// BRD FR-5 / WF32 password policy: 8+ chars, upper, lower, number, special.
describe("validatePasswordPolicy", () => {
  it("rejects a password missing every requirement", () => {
    const result = validatePasswordPolicy("short");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a password missing only a special character", () => {
    const result = validatePasswordPolicy("Password123");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain at least one special character.");
  });

  it("accepts a password meeting all requirements", () => {
    const result = validatePasswordPolicy("Str0ng!Pass");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("generateTemporaryPassword", () => {
  it("always generates a password that satisfies the policy", () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateTemporaryPassword();
      expect(validatePasswordPolicy(pwd).valid).toBe(true);
    }
  });
});

describe("password hashing", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    expect(await comparePassword("Str0ng!Pass", hash)).toBe(true);
    expect(await comparePassword("wrong", hash)).toBe(false);
  });
});

// BRD FR-5: cannot reuse any of the last 5 passwords.
describe("isPasswordReused", () => {
  it("detects reuse of a recent password", async () => {
    const oldHash = await hashPassword("OldPass1!");
    const reused = await isPasswordReused("OldPass1!", [oldHash]);
    expect(reused).toBe(true);
  });

  it("allows a genuinely new password", async () => {
    const oldHash = await hashPassword("OldPass1!");
    const reused = await isPasswordReused("BrandNew2@", [oldHash]);
    expect(reused).toBe(false);
  });
});
