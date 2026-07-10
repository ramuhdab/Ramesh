# Deployment Guide: AWS (Low-Cost Path)
## SPQR Inventory Management

**Version:** 1.0 | **Date:** 2026-07-09

## 1. Recommended Service Choices & Why

| Need | Service | Why this over the "obvious enterprise" choice |
|---|---|---|
| Run backend + frontend containers | **Amazon Lightsail Containers** | Flat monthly pricing (no ALB, no NAT Gateway charges), simplest container hosting AWS offers. ECS Fargate + ALB is the "textbook enterprise" answer but adds ~$20-35/mo of fixed load-balancer/NAT cost before you serve a single request — not justified at pilot scale. |
| Database | **Amazon Lightsail Managed Database (PostgreSQL)** or **RDS PostgreSQL (db.t4g.micro, single-AZ)** | Lightsail DB bundles a fixed low price incl. backups; RDS is the fallback if you need finer-grained parameter control later. Either is a straight Prisma connection string swap. |
| File storage | **Amazon S3** | Pay-per-GB, effectively pennies at this scale; standard SDK, no adapter changes needed later. |
| Email | **Amazon SES** | Pay-per-email (fractions of a cent), no mail server to run. |
| DNS + TLS | **Route 53 + AWS Certificate Manager** (or Lightsail's built-in HTTPS if using their domain/cert tooling) | Free/near-free TLS certs, standard. |
| Backups | **Automated Lightsail/RDS snapshots** + a nightly export to S3 (matches FR-31/WF27) | Built into the managed DB tier; no custom backup infra required. |
| Monitoring | **CloudWatch (free tier metrics + basic alarms)** | No extra cost at this scale. |

**Estimated starting monthly cost:** roughly $30–$60/month total (small Lightsail container service + small Lightsail Postgres + S3/SES usage), scaling up predictably as usage grows. This can be validated against current AWS pricing before go-live since prices change.

## 2. Prerequisites
- AWS account with billing enabled.
- AWS CLI v2 installed and configured (`aws configure`).
- Docker installed locally, and the backend/frontend Docker images buildable (see repo `Dockerfile`s once code phase begins).
- A domain name you control (for TLS + custom URL).

## 3. Step-by-Step Setup

### Step 1 — Create the database
1. AWS Console → Lightsail → Databases → Create database.
2. Choose PostgreSQL, pick the smallest plan (micro), single-AZ for v1.
3. Set the master username/password; note the endpoint.
4. Under "Networking," restrict public access to only the IP/VPC that will host the app once the container service exists (tighten this after Step 2).
5. Once created, run the Prisma migrations against it (from a machine with the connection string):
   ```
   DATABASE_URL="postgresql://<user>:<pass>@<endpoint>:5432/spqr" npx prisma migrate deploy
   ```

### Step 2 — Create S3 bucket for attachments
1. S3 → Create bucket, e.g. `spqr-inventory-attachments-prod`.
2. Block all public access (files are served via signed URLs, not public links).
3. Create an IAM policy granting `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` scoped to that bucket only.
4. Create an IAM user (or, preferably, an IAM role attached to the Lightsail/ECS task) with that policy attached; generate access keys only if a role isn't usable in your chosen compute path.

### Step 3 — Set up SES for email
1. SES → Verify your sending domain (add the provided DNS records).
2. Request production access (SES starts in sandbox mode — only verified recipient addresses work until this is approved).
3. Create SMTP credentials or use the SES API directly from the backend's mail adapter.

### Step 4 — Build and push container images
1. Build images locally or in CI:
   ```
   docker build -t spqr-backend ./backend
   docker build -t spqr-frontend ./frontend
   ```
2. Push to Amazon ECR (or push directly to Lightsail's container registry via `aws lightsail push-container-image`).

### Step 5 — Create the Lightsail Container Service
1. Lightsail → Containers → Create container service. Choose the smallest power/scale tier to start (1 node, "micro" or "small").
2. Deploy: point the service at your pushed `spqr-backend` and `spqr-frontend` images.
3. Set environment variables on the backend container: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AWS_REGION`, `S3_BUCKET`, `SES_*`, `NODE_ENV=production`.
4. Configure the public endpoint to route to the backend on its API path and the frontend on `/`.
5. Attach your custom domain and request/attach a TLS certificate through the Lightsail console (or via ACM + CloudFront if you prefer that fronting layer later).

### Step 6 — Lock down networking
1. Restrict the Lightsail database's allowed connections to only the container service.
2. Ensure the backend is the only component with the database credentials (frontend never talks to the DB directly).

### Step 7 — Backups (FR-31/WF27)
1. Enable automated daily snapshots on the Lightsail/RDS database (built-in feature — set retention, e.g., 7–14 days).
2. Add a scheduled job (the backend's in-process cron, see 02-Architecture.md) that additionally exports a logical backup (`pg_dump`) nightly to the S3 bucket for an independent, cross-service copy, satisfying "encrypted, cloud storage, retention, verification" — enable S3 default encryption (SSE-S3) on the bucket and a lifecycle rule for retention.
3. Periodically test a restore (WF28) into a scratch database to verify backups are usable, not just present.

### Step 8 — Monitoring & Alerts
1. CloudWatch → set a basic alarm on container CPU/memory and on database storage/connections.
2. SNS topic → email to the ops contact for alarm notifications.

### Step 9 — CI/CD (optional but recommended)
1. GitHub Actions (or your CI of choice): on merge to `main`, build images, push to registry, and call `aws lightsail create-container-service-deployment` (or the ECS equivalent) to roll out.
2. Run `prisma migrate deploy` as a pre-deploy step against the production database.

## 4. Scaling Up Later (if/when needed)
If a tenant's load outgrows Lightsail's container service limits: migrate the same Docker images to **ECS Fargate behind an Application Load Balancer**, and the database to **RDS PostgreSQL Multi-AZ**. Because the app was built cloud-agnostic (Section 2/3 of 02-Architecture.md), this is an infrastructure migration, not a code rewrite.

## 5. Teardown / Cost Control
- Lightsail resources bill by the hour while running; delete unused staging environments when not in active use.
- Set a AWS Budget alert (e.g., Billing → Budgets) at a low threshold so unexpected cost growth is caught early.

---
*Companion document: 07-Deployment-Azure.md (equivalent steps for Azure).*
