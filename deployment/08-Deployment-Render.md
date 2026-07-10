# Deployment Guide: Render.com (Free Tier, for Testing)
## SPQR Inventory Management

**Version:** 1.0 | **Date:** 2026-07-10

This is a companion to 06-Deployment-AWS.md and 07-Deployment-Azure.md, for a different purpose: a **$0/month deployment good enough for letting real people test the app** from anywhere with internet access (there is nothing India-specific about reaching a public URL - any global host works). It is **not** the recommended path for an actual paying-customer production deployment - see Section 5 for exactly why, and what to move to when this app needs to stop being a test deployment.

## 1. What's Free, and What It Costs You Later

| Component | Render free tier | The catch |
|---|---|---|
| Backend (Node/Express, Docker) | Free Web Service, 750 shared instance-hours/month across your account | Spins down after 15 minutes idle - the first request after that takes ~30-60s to "wake up." Fine for testing, not for a demo where first impressions matter. |
| Frontend (React static build) | Free Static Site | No spin-down, no cold start - static files are served directly. |
| Database (PostgreSQL) | Free Postgres, 1GB storage | **Expires 30 days after creation**, then a 14-day grace period, then Render deletes it. You must recreate it (and re-run migrations/seed) roughly monthly for an ongoing test deployment - see Section 4. |
| File storage (Attachments, WF30) | Local disk inside the web service container | Free tier has **no persistent disk** - uploaded files are lost on every redeploy/restart/spin-down-wake-cycle. Acceptable for testing the workflow, not for anyone to rely on an uploaded file surviving. |
| Email | `MAIL_PROVIDER=console` (logs instead of sending) | Organization-activation tokens and temporary passwords only appear in Render's log stream, visible to whoever has your Render account - see Step 4. |

If none of this is acceptable once real users depend on it, that's exactly the point where you move to 06-Deployment-AWS.md or 07-Deployment-Azure.md instead (Section 5 has the migration path).

## 2. Prerequisites
- A Render account (render.com - free signup, no credit card required for the free tier).
- This repository pushed to a GitHub repo Render can access (see the root README for pushing it there if you haven't yet).
- Nothing else - no CLI to install, no cloud credentials to configure. Render builds directly from your GitHub repo.

## 3. Step-by-Step Setup

### Step 1 - Pick unique service names and know your URLs in advance
Render service names share one global `*.onrender.com` namespace across every Render user. Open `render.yaml` at the repo root and change `spqr-inventory-backend` / `spqr-inventory-frontend` (both the `name:` fields) to something more likely to be unique (e.g. add your own name or a random suffix) before deploying.

Whatever you choose becomes part of your public URLs, deterministically, before you've deployed anything: `https://<name>.onrender.com`. Write both URLs down now - you'll enter them in Step 2.

### Step 2 - Deploy the Blueprint
1. Render Dashboard -> **New** -> **Blueprint**.
2. Connect the GitHub repo. Render detects `render.yaml` at the root automatically and shows the three resources it's about to create (database + backend web service + frontend static site), each on `plan: free`.
3. Render prompts you for the two environment variables marked `sync: false` in `render.yaml` - enter them now, using the URLs from Step 1:
   - `CORS_ORIGIN` (on the backend) -> `https://<your-frontend-name>.onrender.com` (no trailing slash)
   - `VITE_API_BASE_URL` (on the frontend) -> `https://<your-backend-name>.onrender.com/api/v1`
4. Confirm. Render creates the database first, then builds and deploys both services. The backend build runs `backend/Dockerfile`; the frontend build runs `npm install && npm run build` in `frontend/`. First build typically takes a few minutes for the backend (TypeScript + Prisma generate) and under a minute for the frontend (static).
5. Two things happen automatically on the backend, so there's nothing manual to run afterward: `preDeployCommand` (`npx prisma migrate deploy`) creates the database schema before the first deploy, and `initialDeployHook` (`npm run prisma:seed`) runs once, right after that first deploy succeeds, to seed the platform permission catalog and the Sparquer Super Admin login.

**If Render tells you a name is taken:** it'll assign a different actual URL (or refuse and ask you to pick again, depending on the conflict). Either way, once you know the real, final URLs for both services, revisit Step 2.3's two values in Dashboard -> each service -> **Environment**, correct them if needed, and both services will redeploy automatically.

### Step 3 - Confirm the backend is actually up
1. Dashboard -> your backend service -> wait for status "Live."
2. Visit `https://<your-backend-name>.onrender.com/health` - you should get `{"status":"ok","service":"spqr-inventory-backend"}`. If it 502s, the service is likely still spinning up from cold (free tier) - wait ~30-60s and retry.

At this point the app is live end-to-end: open the frontend URL, and it should reach the backend without a CORS error in the browser console.

### Step 4 - Retrieve the Super Admin login
`initialDeployHook` already ran the seed script for you, but its one-time output (a randomly generated Super Admin username/password) only ever appears in one place:
1. Dashboard -> backend service -> **Logs** -> scroll/search near the first deploy for a line like `Super Admin created. TEMP PASSWORD: ...`.
2. Log in to the frontend with that username/password, change the password when prompted (forced on first login), then use the **Organizations** screen to create your first tenant organization.
3. `NODE_ENV=production` (correctly set for a public deployment) means that new organization's activation token and temporary admin password are **not** echoed back in the API response either - they likewise only appear in the backend's **Logs** tab, same as a real production deployment would email them instead. Retrieve them from there, activate the organization, and log in as its admin to finish setup and start creating the users who will actually test the app.

### Step 5 - Hand out logins to testers
Everyone testing from India (or anywhere else) just needs the frontend URL plus a username/password you create for them via the Users screen - no network configuration on their end, no VPN, nothing India-specific. Ordinary internet access to a public HTTPS URL is all that's required.

## 4. Monthly Upkeep This Free Setup Requires
- **Database (~every 30 days):** the free Postgres instance expires and enters a 14-day grace period before deletion. Before it's deleted: either upgrade it to a paid instance (a few dollars/month, keeps everything as-is), or create a fresh free database, point the backend's `DATABASE_URL` at it, and let `preDeployCommand`/`initialDeployHook` re-run migrations and seeding on the next deploy (you will lose existing data unless you `pg_dump` it out first from the old instance and restore into the new one while both still exist).
- **Backend cold starts:** every free web service spin-down means the next visitor waits ~30-60s. If that's disruptive during an active testing window, a free tool like UptimeRobot pinging `/health` every 10 minutes keeps it warm (uses part of your 750 free hours faster, but 750 hours covers an always-on single service for a full month already).
- **Attachments:** treat anything uploaded through the Attachments feature as temporary for the life of this deployment - it will not survive a redeploy.

## 5. Why This Isn't the Production Deployment
This entire guide exists because Render's free tier removes every piece of setup effort (no AWS/Azure account, no Lightsail/App Service, no IAM, no DNS) at the direct cost of: expiring/ephemeral storage, cold starts, and no real backup/retention (FR-31/WF27 is not satisfiable at all on the free tier - there is no automated backup of a database that itself expires in 30 days). Once this is genuinely serving customers rather than testers, move the same Docker images and the same `DATABASE_URL`-based Prisma connection to 06-Deployment-AWS.md or 07-Deployment-Azure.md - nothing about the application code changes, only the infrastructure it points at (per 02-Architecture.md's cloud-agnostic design).

---
*Companion documents: 06-Deployment-AWS.md, 07-Deployment-Azure.md (production-grade equivalents).*
