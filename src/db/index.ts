import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracked_projects (
      id              SERIAL PRIMARY KEY,
      guild_id        TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      channel_id      TEXT NOT NULL,
      ping_role_id    TEXT,
      track_stable    BOOLEAN NOT NULL DEFAULT TRUE,
      track_beta      BOOLEAN NOT NULL DEFAULT FALSE,
      track_alpha     BOOLEAN NOT NULL DEFAULT FALSE,
      last_version_id TEXT,
      added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id, project_id)
    );
  `);
  console.log('[DB] Schema ready.');
}
