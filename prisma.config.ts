import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * The connection URL lives here rather than in schema.prisma. DATABASE_URL is
 * only needed for `prisma migrate` / `prisma db` commands against a real
 * PostgreSQL server. Sentinel's default demo mode never connects to a database,
 * so `prisma generate` (which only needs the schema) works with it unset.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
