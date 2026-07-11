# Deployment Guide: Railway (Usage-Based, for Testing)
## SPQR Inventory Management

**Version:** 1.0 | **Date:** 2026-07-10

This is a companion to 06-Deployment-AWS.md, 07-Deployment-Azure.md, and 08-Deployment-Render.md, for the same purpose as the Render guide - letting real people test the app from anywhere with internet access - but on Railway instead. **Railway is not free the way Render's free tier is**: new accounts get a one-time $5 credit that expires after 30 days, then you're on either the Free plan ($1/month credit, capped at 1 project - likely too little for a Postgres + backend + frontend setup) or the $5/month Hobby plan (which includes $5 of usage credit, but you always pay the $5 subscription fee even if you use less). If cost is the deciding factor, use 08-Deployment-Render.md instead. This guide exists because you asked for Railway specifically.

Like the Render guide, this is **not** the recommended path for an actual paying-customer production deployment - see Section 5.

## 1. What This Costs, and Why It's Structured Differently From Render

| Component | Railway | The catch |
|---|---|---|
| Backend (Node/Express) | A Railway service, billed by actual CPU/RAM/network usage | No free spin-down/wake cycle like Render - it runs continuously, so it also bills continuously. |
| Frontend (React static build) | **Also a full Railway service**, not a CDN static site | Railway has no free "static site" hosting tier the way Render does - every service is a running process. This deployment runs a tiny static file server (`serve`) over the built frontend, which means the frontend also consumes usage-based billing, unlike on Render where it's free. |
| Database (PostgreSQL) | A Railway-managed Postgres service, billed the same usage-based way | No 30-day expiry like Render's free Postgres - but it never stops costing money either, since there's no free tier fallback. |
| File storage (Attachments, WF30) | Local disk inside the backend service container | Same as Render: no persistent volume attached in this setup, so uploaded files are lost on redeploy/restart. Railway does support persistent volumes if you want to fix this, at additional cost - out of scope for this guide. |
| Email | `MAIL_PROVIDER=console` (logs instead of sending) | Same as Render - tokens and temp passwords appear in Railway's log stream instead. |

If none of this is acceptable, move to 08-Deployment-Render.md (genuinely free tier) or, for production, 06-Deployment-AWS.md / 07-Deployment-Azure.md.

## 2. Prerequisites
- A Railway account (railway.com) with a payment method attached once the trial credit runs out (not required to start).
- This repository pushed to a GitHub repo Railway can access.
- Nothing to install locally - Railway builds directly from your GitHub repo using its own build system (Railpack), same idea as Render's native Node runtime, no Docker required.

## 3. Step-by-Step Setup

Unlike Render's single Blueprint file that provisions everything in one pass, Railway does **not** support baking multiple services, a database, and environment variables into one config-as-code file - `backend/railway.toml` and `frontend/railway.toml` in this repo only cover each service's build/deploy settings. Services, the database, and all environment variables are set up individually in the Railway Dashboard. Railway also can't tell you a service's public URL before that service is deployed and listening (unlike Render's deterministic `*.onrender.com` naming), so this is unavoidably a few more manual steps than the Render guide, done in a specific order so you're not wiring one service's URL into another before it exists.

### Step 1 - Create the project and add Postgres
1. railway.com -> **New Project** -> **Deploy PostgreSQL** (or **Empty Project** then **+ New -> Database -> Add PostgreSQL**).
2. This gives you a `Postgres` service in the project. You don't need its connection string yourself - other services reference it directly (Step 3).

### Step 2 - Add the backend service
1. In the same project: **+ New -> GitHub Repo** -> select this repository.
2. Open the new service's **Settings** tab:
   - **Root Directory**: `backend`
   - **Config-as-code Path**: `backend/railway.toml` (Root Directory does *not* make Railway look inside that folder for the config file automatically - this path is relative to the repo root, not the Root Directory).
3. Don't deploy yet - set the environment variables first (Step 3), since the backend will crash-loop without them.

### Step 3 - Set the backend's environment variables
Service -> **Variables** tab -> add each of these:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway's reference-variable syntax - resolves to the Postgres service's private connection string automatically) |
| `JWT_SECRET` | a random secret - generate one locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (or `openssl rand -hex 48`) and paste the output |
| `JWT_REFRESH_SECRET` | a second, different random secret, generated the same way |
| `MAIL_PROVIDER` | `console` |
| `STORAGE_PROVIDER` | `local` |
| `CORS_ORIGIN` | a placeholder for now, e.g. `http://localhost:5173` - you'll come back and fix this in Step 6 once the frontend's real URL exists |

Save, then let it deploy. Watch the **Deployments** tab; once it's built and `preDeployCommand` (schema push + seed) has run, the service should reach a "Success"/running state.

**If the build fails with a Prisma/OpenSSL error (schema engine can't parse its response), or otherwise looks like it built from a Dockerfile instead of running `buildCommand`/`startCommand` from `railway.toml`:** Railway auto-detects a file literally named `Dockerfile` in the build context and can silently use it instead of `builder = "RAILPACK"`, even though that's explicitly set. This repo avoids that by naming its Dockerfiles `Dockerfile.compose` instead (see the note at the top of `backend/railway.toml`) - if you've renamed anything back to a plain `Dockerfile` inside `backend/` or `frontend/`, rename it back to `Dockerfile.compose` (or anything other than the exact name `Dockerfile`) and redeploy.

### Step 4 - Generate a public domain for the backend
Service -> **Settings** -> **Networking** -> **Public Networking** -> **Generate Domain**. Railway can only do this once the service is deployed and listening (this is why Step 3 came before this step). Copy the resulting `https://<something>.up.railway.app` URL - you'll need it in Step 5.

Confirm it works: visit `https://<your-backend-domain>/health` - you should get `{"status":"ok","service":"spqr-inventory-backend"}`.

### Step 5 - Add the frontend service
1. Same project: **+ New -> GitHub Repo** -> this repository again (a second service from the same repo).
2. Settings: **Root Directory** = `frontend`, **Config-as-code Path** = `frontend/railway.toml`.
3. Variables tab: add `VITE_API_BASE_URL` = `https://<your-backend-domain-from-step-4>/api/v1`.
4. Deploy. Once it's running, **Settings -> Networking -> Generate Domain** for this service too, and copy its URL.

### Step 6 - Wire the backend's CORS_ORIGIN to the real frontend URL
Go back to the **backend** service -> **Variables** -> update `CORS_ORIGIN` to `https://<your-frontend-domain-from-step-5>` (no trailing slash). Saving this triggers an automatic redeploy of the backend - wait for it to finish.

At this point the app is live end-to-end: open the frontend URL, and it should reach the backend without a CORS error in the browser console.

### Step 7 - Retrieve the Super Admin login
Same mechanism as the Render guide: the username is `superadmin` unless you set `SEED_SUPER_ADMIN_USERNAME`, and the password is the fixed default `ChangeMe!2026` unless you set `SEED_SUPER_ADMIN_PASSWORD` as a Variable on the backend service before its first deploy (strongly recommended - see the security note in 08-Deployment-Render.md Step 4, which applies identically here).
1. Backend service -> **Deployments** -> click the deployment -> **View Logs** -> look for `Super Admin created. TEMP PASSWORD: ...`.
2. Log in to the frontend with that username/password, change the password when prompted, then use **Organizations** to create your first tenant organization.
3. As with Render, `NODE_ENV=production` means the new organization's activation token and admin temp password are only in the backend's Logs, not the API response - retrieve them there.

**Resetting the Super Admin password later:** identical mechanism to Render - set/update `SEED_SUPER_ADMIN_PASSWORD` on the backend service's Variables, then redeploy (Deployments -> ... -> Redeploy, or just trigger any redeploy). `prisma/seed.ts` resets the existing account's password when this var is set, rather than skipping.

### Step 8 - Hand out logins to testers
Same as Render: anyone anywhere just needs the frontend URL plus a username/password from the Users screen - no region-specific setup needed.

## 4. Ongoing Costs This Setup Involves
- **No free spin-down**: unlike Render, both services (and Postgres) run continuously and bill continuously - there's no equivalent of "sleeps after 15 minutes idle, so it's free while unused."
- **Trial credit runs out in 30 days**: after that, add a payment method and move to the Hobby plan ($5/month minimum) or stay on the Free plan if usage is low enough (1 project limit, $1/month credit - likely too tight for 3 services).
- **Attachments**: same as Render - local disk is ephemeral, files don't survive a redeploy.

## 5. Why This Isn't the Production Deployment
Same reasoning as 08-Deployment-Render.md Section 5: this setup optimizes for zero/low setup effort, not for the durability, backup, and persistent-storage guarantees a real production deployment needs (FR-31/WF27 backup requirements aren't met here). Once this is genuinely serving customers, move to 06-Deployment-AWS.md or 07-Deployment-Azure.md - the application code doesn't change, only the infrastructure it points at (02-Architecture.md's cloud-agnostic design).

---
*Companion documents: 06-Deployment-AWS.md, 07-Deployment-Azure.md (production-grade equivalents), 08-Deployment-Render.md (genuinely free-tier alternative).*
