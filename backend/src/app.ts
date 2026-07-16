import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { organizationRouter } from "./modules/organizations/organization.routes";
import { userRouter } from "./modules/users/user.routes";
import { roleRouter } from "./modules/roles/role.routes";
import { configRouter } from "./modules/config/config.routes";
import { notificationRouter } from "./modules/notifications/notification.routes";
import { employeeRouter } from "./modules/employees/employee.routes";
import { vendorRouter } from "./modules/vendors/vendor.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { recoveryRouter, recoveryCalcRouter } from "./modules/recovery/recovery.routes";
import { procurementRouter, indentRouter } from "./modules/procurement/procurement.routes";
import { attachmentRouter } from "./modules/attachments/attachment.routes";
import { importRouter, exportRouter } from "./modules/dataio/dataio.routes";
import { dashboardRouter, reportRouter } from "./modules/reporting/reporting.routes";

// Cross-cutting subscribers (audit + notifications) attach their event-bus
// listeners as a side effect of being imported - see 02-Architecture.md, Section 5.
import "./modules/audit/audit.service";
import "./modules/notifications/notification.service";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "spqr-inventory-backend" }));

const v1 = express.Router();
v1.use("/auth", authRouter);
v1.use("/organizations", organizationRouter);
v1.use("/users", userRouter);
v1.use("/roles", roleRouter);
v1.use("/config", configRouter);
v1.use("/notifications", notificationRouter);
v1.use("/employees", employeeRouter);
v1.use("/vendors", vendorRouter);
v1.use("/inventory", inventoryRouter);
v1.use("/inventory", recoveryRouter); // /inventory/lost, /inventory/damaged, /inventory/incidents/:id/verify
v1.use("/recovery", recoveryCalcRouter);
v1.use("/procurement", procurementRouter);
v1.use("/indents", indentRouter);
v1.use("/attachments", attachmentRouter);
v1.use("/import", importRouter);
v1.use("/export", exportRouter);
v1.use("/dashboard", dashboardRouter);
v1.use("/reports", reportRouter);
app.use("/api/v1", v1);

app.use(notFoundHandler);
app.use(errorHandler);
