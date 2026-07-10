# Deployment Guide: Azure (Low-Cost Path)
## SPQR Inventory Management

**Version:** 1.0 | **Date:** 2026-07-09

## 1. Recommended Service Choices & Why

| Need | Service | Why this over the "obvious enterprise" choice |
|---|---|---|
| Run backend + frontend | **Azure App Service (Linux, B1 Basic tier to start)**, one app for backend (container or Node runtime), one static-hosted build for frontend (App Service or Azure Static Web Apps) | App Service is a fully managed PaaS — no cluster, no load balancer to configure separately. Azure Kubernetes Service (AKS) is the "textbook enterprise" answer but adds real fixed cost and operational overhead not justified at pilot scale. |
| Database | **Azure Database for PostgreSQL – Flexible Server, Burstable B1ms tier** | Cheapest managed Postgres tier Azure offers; supports automated backups out of the box; can scale up later without a migration. |
| File storage | **Azure Blob Storage (Cool or Hot tier, LRS redundancy)** | Pay-per-GB, same role as S3 in the AWS guide — the app's storage adapter (02-Architecture.md) targets this via the same interface. |
| Email | **Azure Communication Services (Email)** or **SendGrid via Azure Marketplace** | Pay-per-email, no mail server to run. |
| DNS + TLS | **Azure DNS + App Service Managed Certificates (free)** | Free TLS certificates for custom domains on App Service. |
| Backups | **Automated Flexible Server backups** + nightly logical export to Blob Storage | Matches FR-31/WF27. |
| Monitoring | **Azure Monitor + Application Insights (free tier sufficient at this scale)** | Basic metrics/alerts at no material extra cost. |

**Estimated starting monthly cost:** roughly $30–$70/month total (B1 App Service plan + Burstable Postgres + Blob/email usage). Validate against current Azure pricing before go-live since prices change.

## 2. Prerequisites
- Azure subscription with billing enabled.
- Azure CLI installed and logged in (`az login`).
- Docker installed locally (if deploying backend as a container) or Node 20 runtime target if deploying as a native App Service Node app.
- A domain name you control.

## 3. Step-by-Step Setup

### Step 1 — Create a resource group
```
az group create --name spqr-inventory-prod --location eastus
```

### Step 2 — Create the database
```
az postgres flexible-server create \
  --resource-group spqr-inventory-prod \
  --name spqr-inventory-db \
  --location eastus \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 \
  --admin-user spqradmin --admin-password <strong-password> \
  --version 15
```
1. In the Azure portal, restrict the server's firewall/networking to only the App Service's outbound IPs (tighten after Step 4).
2. Run Prisma migrations against it:
   ```
   DATABASE_URL="postgresql://spqradmin:<password>@spqr-inventory-db.postgres.database.azure.com:5432/spqr?sslmode=require" npx prisma migrate deploy
   ```

### Step 3 — Create Blob Storage for attachments
```
az storage account create --name spqrinvattachments --resource-group spqr-inventory-prod --sku Standard_LRS --kind StorageV2
az storage container create --account-name spqrinvattachments --name attachments --public-access off
```
Generate a SAS token or use a Managed Identity from the App Service (preferred — avoids storing storage keys as secrets) with `Storage Blob Data Contributor` role scoped to this account only.

### Step 4 — Set up email (Azure Communication Services)
1. Create an Azure Communication Services resource and an Email Communication Service resource; verify your sending domain (add the provided DNS records).
2. Note the connection string for the backend's mail adapter.

### Step 5 — Create the App Service plan and app
```
az appservice plan create --name spqr-plan --resource-group spqr-inventory-prod --sku B1 --is-linux
az webapp create --resource-group spqr-inventory-prod --plan spqr-plan --name spqr-backend --runtime "NODE:20-lts"
```
(If deploying via container instead: `az webapp create ... --deployment-container-image-name <registry>/spqr-backend:latest`, backed by **Azure Container Registry**.)

1. Set application settings (environment variables):
   ```
   az webapp config appsettings set --resource-group spqr-inventory-prod --name spqr-backend --settings \
     DATABASE_URL="<connection string>" JWT_SECRET="<secret>" JWT_REFRESH_SECRET="<secret>" \
     AZURE_STORAGE_ACCOUNT="spqrinvattachments" ACS_CONNECTION_STRING="<value>" NODE_ENV=production
   ```
2. Deploy the frontend as a static build either to a second, smaller App Service or to **Azure Static Web Apps** (often the cheaper option for a pure static React build, with free TLS and a global CDN included).

### Step 6 — Custom domain & TLS
1. App Service → Custom domains → add your domain (with the CNAME/TXT records Azure provides).
2. App Service → TLS/SSL → Create App Service Managed Certificate (free) → bind to the domain.

### Step 7 — Lock down networking
1. Use App Service's outbound IP addresses (or a VNet integration + private endpoint for the database, for a stricter setup) to restrict the Postgres Flexible Server firewall to just this app.
2. Only the backend app holds the database connection string; the frontend never talks to the DB directly.

### Step 8 — Backups (FR-31/WF27)
1. Flexible Server automated backups are on by default — confirm retention (7–35 days configurable) meets policy.
2. Add a nightly job (backend in-process cron) that runs `pg_dump` and uploads to the Blob Storage container, with the storage account's encryption-at-rest (on by default) and a lifecycle management policy for retention/expiry.
3. Periodically test a restore (WF28) into a scratch server to confirm backups are actually restorable.

### Step 9 — Monitoring & Alerts
1. Enable Application Insights on the App Service (basic tier is effectively free at this scale).
2. Azure Monitor → set alert rules on CPU/memory/HTTP 5xx rate and database storage/connections, with an action group emailing the ops contact.

### Step 10 — CI/CD (optional but recommended)
1. GitHub Actions using the `azure/webapps-deploy` action (or Azure DevOps Pipelines) to build and deploy on merge to `main`.
2. Run `prisma migrate deploy` as a pre-deploy step against the production database.

## 4. Scaling Up Later (if/when needed)
If load outgrows a single B1 App Service instance: scale the App Service Plan up (vertical) or out (horizontal, multiple instances — the app is stateless given JWT auth, so this works with no code change) before considering AKS. Scale the database tier up (Burstable → General Purpose) before considering read replicas or sharding.

## 5. Teardown / Cost Control
```
az group delete --name spqr-inventory-prod --yes
```
removes every resource in one command for a staging environment that's no longer needed. Set an Azure Cost Management budget alert at a low threshold to catch unexpected growth early.

---
*Companion document: 06-Deployment-AWS.md (equivalent steps for AWS).*
