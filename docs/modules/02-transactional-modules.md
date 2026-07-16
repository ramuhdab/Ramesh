# Module Build Log: 02 — Employee, Vendor, Inventory, Recovery, Procurement

**Status:** Shipped (v0.2) | **Date:** 2026-07-09

## Workflows covered
WF3–WF6 (Employee Creation/Transfer/Exit/Rehire), WF7 (Purchase - approval-chain portion), WF8 (Goods Receipt), WF9 (Issue), WF10 (Return), WF11 (Replacement), WF12 (Lost Item), WF13 (Damaged Item), WF14 (Adjustment), WF15–WF16 (Vendor Approval/Performance), WF17 (Indent), WF18–WF19 (Low/Critical Stock alerts), WF20 (Procurement Cancellation), WF21 (Approval Escalation), WF26 (Recovery Calculation).

## What was built
- **Employee Lifecycle** (`modules/employees`): create/transfer/rehire, and a two-phase exit (`initiate` then `complete`) that hard-blocks completion until every item issuance is either returned or Finance-verified via Recovery.
- **Vendor Management** (`modules/vendors`): create → Finance-verify → management-approve state machine, plus a rolling 0–100 performance score from delivery/quality/price ratings.
- **Inventory Core** (`modules/inventory`): item catalog, goods receipt (accept/reject), issue (annual-allocation-checked), return (good→restock, damaged→scrap + auto-opens a recovery-eligible report), replace, physical-count adjustment, and low/critical stock alert computation.
- **Loss/Damage & Recovery** (`modules/recovery`): incident reporting + manager verification, and the shared recovery-calculation engine (straight-line depreciation off `ItemPolicy.recoverableValue`/`usefulLifeMonths`), plus Finance sign-off.
- **Procurement & Approvals** (`modules/procurement`): a generic, configurable approval-chain engine (`approval.service.ts`) driving both procurement requests and indents, automatic purchase-order generation on final approval, cancellation, and SLA-based escalation.
- **Scheduler** (`lib/scheduler.ts`, node-cron, every 15 min): auto-raises procurement requests for items under threshold (WF18/19), and escalates any approval past its SLA (WF21).
- Prisma schema extended with 7 new models (PurchaseOrder, VendorRating, ApprovalAction, ItemIssuance, ItemReturn, LostDamagedReport, RecoveryCalculation) plus ~24 new permission constants.

## Independent verification pass (LLM-as-judge)
A second, fresh-context agent reviewed this entire batch as a skeptical reviewer (schema consistency, multi-tenancy, the approval engine's concurrency safety, inventory business-rule arithmetic, exit-gating logic, recovery math). It found 2 blocking bugs and 5 moderate issues; **all have been fixed**:

1. **Annual-allocation check was scoped to a single item code instead of the item's whole category** (`ItemPolicy.annualAllocation` is a category-level cap) — an employee could exhaust the category limit by requesting different item codes in the same category. Fixed: the usage aggregate now filters by `inventoryItem.inventoryCategoryId` instead of a single `inventoryItemId`.
2. **Several client-supplied master-data foreign keys weren't checked against the caller's organization** (department/employee-category on employee create/update, building/department on transfer, building/position on rehire, inventory category on item create) — a cross-tenant ID could get silently linked and leaked back through `include`d relations. Fixed: added an `assertBelongsToOrg` helper (employees module) and an inline check (inventory item creation); all four flagged spots now validate tenant ownership before writing.
3. **Approval-chain race condition**: `decide()` and `checkEscalations()` both read-then-wrote an `ApprovalAction` row without re-checking its state at write time, so two concurrent decisions (or a decision racing an escalation tick) could create duplicate pending rows at the same level, and downstream trigger a duplicate purchase order. Fixed: both now use an atomic `updateMany({ where: { id, decision: "pending" }, ... })` claim — if the row already moved, the update matches zero rows and the caller gets a clean 409 instead of a silent double-write.
4. **Scheduler's stock-alert job wasn't per-organization isolated** — one organization's failure aborted the whole 15-minute tick for every other organization. Fixed: each org now has its own try/catch inside the loop.
5. **Recovery calculation used the employee's leaving date for loss/damage incidents too**, and never required manager verification before calculating — correct for an exit, wrong for a loss/damage on someone who's merely in their notice period (used a future date instead of the actual incident date). Fixed: loss/damage now requires a `lostDamagedReportId`, pulls the incident date from that report's `reportedAt`, and 409s if the report isn't yet manager-verified.
6. **Vendor rating accepted a client-supplied `purchaseOrderId` with no ownership check.** Fixed: now validated against the vendor and organization before being recorded.

Not fixed (flagged as acceptable v1 simplifications, not bugs): `checkEscalations()` scans all organizations in one unbounded query (fine at pilot scale); annual allocation resets on the calendar year rather than join-anniversary; `replaceItem()` re-runs the full stock/allocation check via the normal issue path rather than a dedicated "replacement bypasses allocation" rule.

## Deviations from the original spec (flagged, not silently assumed)
1. **No generic `inventory_transactions` ledger table.** The data-model sketch proposed one; it wasn't added. The specific tables (ItemIssuance, ItemReturn, RecoveryCalculation) plus the AuditLog (fed by every mutation via the event bus) together serve as the transaction history. Revisit only if reporting genuinely needs a single unified feed.
2. **No manual `POST /procurement/:id/purchase-order` endpoint.** A PO is generated automatically the instant a request clears final approval, picking the first `approved` vendor on file. Vendor *selection* (bidding, per-category preferred vendor) is a placeholder, not a real selection process - flagged for a future pass if multiple vendors per category need to be compared.
3. **WF21's "24h reminder, then 48h escalation" is folded into a single escalation step** once an approval's configured SLA passes, rather than two distinct timers. Add a `remindedAt` column and split into two passes if a true two-stage reminder/escalation is required.
4. **Employee exit is two endpoints** (`/exit/initiate`, `/exit/complete`) instead of one, so HR can mark someone as leaving before all the settlement conditions are met, and Finance/store-keeper actions can happen in between.

## Known limitation: still could not run the code
Same sandbox constraint as batch 1 - no npm registry/CDN access here. Please run `npm install && npm test` (and exercise the two end-to-end flows the reviewer checked: employee→vendor→inventory→lost→recovery→exit, and low-stock→procurement→multi-level-approval→PO) and report back anything that doesn't come up clean.

## Next up
Reporting & Dashboard (WF24/WF25), Data Import/Export (WF34), Attachments (WF30), and Platform Ops / backup automation (WF27/WF28) remain unbuilt.
