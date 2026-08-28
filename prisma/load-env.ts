import { config } from "dotenv";

/**
 * Side-effect module: loads .env before anything else evaluates.
 *
 * Importing `dotenv` and calling `config()` inline at the top of a script does
 * not work — imports are hoisted, so every other module body (including the
 * Prisma client, which reads DATABASE_URL at load time) runs first. Importing
 * this module ahead of the others is the only ordering the language guarantees.
 */
config({ path: ".env", quiet: true });
