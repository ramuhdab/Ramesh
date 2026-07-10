/**
 * Seeds:
 *  - the platform permission catalog (idempotent)
 *  - one Sparquer Super Administrator account, so there is a way to log in
 *    and create the first organization (WF1) on a fresh database.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../src/utils/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding permission catalog...");
  for (const value of Object.values(PERMISSIONS)) {
    const parts = value.split(":");
    const screen = parts.length === 3 ? parts[1] : "";
    const action = parts.length === 3 ? parts[2] : parts[1];
    const module = parts[0];
    await prisma.permission.upsert({
      where: { module_screen_action: { module, screen, action } },
      update: {},
      create: { module, screen, action },
    });
  }

  const superAdminUsername = process.env.SEED_SUPER_ADMIN_USERNAME ?? "superadmin";
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@sparquer.example";
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe!2026";

  const existing = await prisma.superAdmin.findUnique({ where: { username: superAdminUsername } });
  if (!existing) {
    console.log(`Creating Sparquer Super Administrator "${superAdminUsername}"...`);
    await prisma.superAdmin.create({
      data: {
        username: superAdminUsername,
        email: superAdminEmail,
        passwordHash: await bcrypt.hash(superAdminPassword, 12),
        mustChangePassword: true,
      },
    });
    console.log(`Super Admin created. TEMP PASSWORD: ${superAdminPassword} (change immediately - set SEED_SUPER_ADMIN_PASSWORD for real deployments).`);
  } else if (process.env.SEED_SUPER_ADMIN_PASSWORD) {
    // Self-service password reset with no direct DB access required: set
    // SEED_SUPER_ADMIN_PASSWORD to a new value and restart the service. This
    // only resets the password when the env var is explicitly provided, so
    // a normal redeploy (var unset) never silently touches an existing
    // account - see deployment/08-Deployment-Render.md for how to do this
    // from the Render Dashboard alone (no psql/SQL client needed).
    await prisma.superAdmin.update({
      where: { id: existing.id },
      data: {
        passwordHash: await bcrypt.hash(superAdminPassword, 12),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    console.log(`Super Admin "${superAdminUsername}" password reset from SEED_SUPER_ADMIN_PASSWORD.`);
  } else {
    console.log("Super Administrator already exists, skipping.");
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
