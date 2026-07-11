import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";

app.listen(env.port, () => {
  logger.info(`SPQR Inventory Management backend listening on port ${env.port}`, { env: env.nodeEnv });
  startScheduler();
});
