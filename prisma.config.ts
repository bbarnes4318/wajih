import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env — the CLI reads whatever is already on
// process.env, so load it here before `env()` resolves the datasource URL.
loadEnv({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Migrations must run over a direct connection. Neon's pooled endpoint
    // runs pgbouncer in transaction mode, which drops the session-level
    // advisory locks and DDL state the migration engine depends on. The
    // runtime client still uses the pooled URL.
    //
    // Resolved leniently rather than through `env()`, which throws at config
    // load: `prisma generate` runs in `postinstall` and must succeed on a
    // fresh clone that has no database yet. Migration commands surface a
    // connection error of their own if this is unset.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
