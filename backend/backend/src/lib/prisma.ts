import { PrismaClient } from "@prisma/client";

// Single Prisma client instance shared across all modules (per 02-Architecture.md:
// one relational database, no polyglot persistence).
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
