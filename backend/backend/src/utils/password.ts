import bcrypt from "bcryptjs";

/**
 * Password policy per BRD FR-5 / workflow 32:
 * min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
 */
const POLICY_REGEX = {
  minLength: /.{8,}/,
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /[0-9]/,
  special: /[^A-Za-z0-9]/,
};

export function validatePasswordPolicy(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!POLICY_REGEX.minLength.test(password)) errors.push("Password must be at least 8 characters long.");
  if (!POLICY_REGEX.upper.test(password)) errors.push("Password must contain at least one uppercase letter.");
  if (!POLICY_REGEX.lower.test(password)) errors.push("Password must contain at least one lowercase letter.");
  if (!POLICY_REGEX.number.test(password)) errors.push("Password must contain at least one number.");
  if (!POLICY_REGEX.special.test(password)) errors.push("Password must contain at least one special character.");
  return { valid: errors.length === 0, errors };
}

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Password history check: reject reuse of the last 5 passwords (FR-5).
 * `history` is the list of previous password hashes, most recent first.
 */
export async function isPasswordReused(password: string, history: string[]): Promise<boolean> {
  const lastFive = history.slice(0, 5);
  for (const oldHash of lastFive) {
    if (await bcrypt.compare(password, oldHash)) return true;
  }
  return false;
}

export function generateTemporaryPassword(): string {
  // Guaranteed to satisfy the policy above.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%^&*";
  const all = upper + lower + numbers + special;

  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pwd = pick(upper) + pick(lower) + pick(numbers) + pick(special);
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}
