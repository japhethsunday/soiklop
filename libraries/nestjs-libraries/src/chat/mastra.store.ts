import { PostgresStore } from '@mastra/pg';

/**
 * Mastra's own connection pool, kept deliberately small.
 *
 * This store shares a connection budget with Prisma and with every other
 * process pointed at the same database. Supabase's session-mode pooler caps
 * the project at 15 client connections, and `pg.Pool` defaults to a maximum
 * of 10 -- so a single backend instance could take two thirds of the budget
 * for chat storage alone, and a deploy, during which the old and new
 * instances overlap, exhausted it outright:
 *
 *   MastraError: (EMAXCONNSESSION) max clients reached in session mode
 *
 * The failure surfaces at startup, so the whole API crash-loops rather than
 * losing only the assistant.
 *
 * `idleTimeoutMillis` matters as much as `max`: without it the pool holds
 * connections open indefinitely, and the exhausted pool observed in
 * production was entirely idle connections that no longer had any work.
 * Returning them promptly is what keeps the budget shared rather than
 * claimed.
 */
const DEFAULT_POOL_MAX = 4;

export const pStore = new PostgresStore({
  id: 'postiz-store',
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.MASTRA_DB_POOL_MAX) || DEFAULT_POOL_MAX,
  idleTimeoutMillis: 10_000,
});
