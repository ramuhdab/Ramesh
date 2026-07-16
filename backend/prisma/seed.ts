/**
 * Seeds (all idempotent - safe to run on every deploy):
 *  - the platform permission catalog
 *  - one Sparquer Super Administrator account, so there is a way to log in
 *    and create organizations (WF1) on a fresh database
 *  - one pre-activated demo organization with working logins, so there's
 *    always something to test against without going through WF1 by hand
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS, SYSTEM_ROLES } from "../src/utils/permissions";
import { seedDefaultRolesAndPermissions } from "../src/modules/organizations/organization.service";

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

  // ---- Demo/test data: one pre-activated organization + working logins ----
  // Skips the WF1 email/token activation flow entirely (this deployment's
  // console mail adapter never sends real email - see mail.adapter.ts), so
  // there's always a known-good organization + set of logins to test with
  // immediately after a fresh deploy, with no Organizations > Create >
  // Activate steps and no digging through logs for a temp password.
  const demoOrgName = process.env.SEED_DEMO_ORG_NAME ?? "Demo Facilities Inc";
  const demoPassword = process.env.SEED_DEMO_USER_PASSWORD ?? "Demo@12345";

  const existingDemoOrg = await prisma.organization.findUnique({ where: { name: demoOrgName } });
  if (!existingDemoOrg) {
    console.log(`Creating demo organization "${demoOrgName}"...`);
    const demoOrg = await prisma.organization.create({
      data: { name: demoOrgName, subscriptionPlan: "standard", status: "active" },
    });
    await seedDefaultRolesAndPermissions(demoOrg.id);

    const demoUsers = [
      { username: "orgadmin", email: "orgadmin@demo.spqr", role: SYSTEM_ROLES.ORG_ADMIN },
      { username: "storekeeper", email: "storekeeper@demo.spqr", role: SYSTEM_ROLES.STORE_KEEPER },
      { username: "hruser", email: "hr@demo.spqr", role: SYSTEM_ROLES.HR },
    ];

    for (const u of demoUsers) {
      const user = await prisma.user.create({
        data: {
          organizationId: demoOrg.id,
          username: u.username,
          email: u.email,
          passwordHash: await bcrypt.hash(demoPassword, 12),
          // Demo accounts skip the forced first-login password change - real
          // Org Admin accounts created via Organizations > Create still
          // require it (see auth.service.ts changePassword).
          mustChangePassword: false,
        },
      });
      const role = await prisma.role.findFirstOrThrow({ where: { organizationId: demoOrg.id, name: u.role } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }

    console.log(`Demo organization "${demoOrgName}" ready. Logins (all password "${demoPassword}"):`);
    console.log(`  orgadmin    / ${demoPassword}  - full access within "${demoOrgName}"`);
    console.log(`  storekeeper / ${demoPassword}  - Store Keeper role`);
    console.log(`  hruser      / ${demoPassword}  - HR role`);
  } else {
    console.log(`Demo organization "${demoOrgName}" already exists, skipping.`);
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
