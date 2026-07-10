import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),

  databaseUrl: required("DATABASE_URL"),

  jwtSecret: required("JWT_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",

  sessionTimeoutMinutes: Number(process.env.SESSION_TIMEOUT_MINUTES ?? 30),
  sessionWarningMinutes: Number(process.env.SESSION_WARNING_MINUTES ?? 5),
  maxFailedLoginAttempts: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5),
  passwordResetTokenTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30),
  tempPasswordTtlHours: Number(process.env.TEMP_PASSWORD_TTL_HOURS ?? 24),

  mailProvider: process.env.MAIL_PROVIDER ?? "console",
  mailFrom: process.env.MAIL_FROM ?? "no-reply@spqr-inventory.example",

  storageProvider: process.env.STORAGE_PROVIDER ?? "local",
  storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? "./uploads",

  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
