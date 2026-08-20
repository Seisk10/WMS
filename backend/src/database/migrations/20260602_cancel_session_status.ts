import type { Knex } from 'knex';

// SQLite doesn't support ALTER COLUMN — must rename, add new column with updated
// CHECK, migrate values, then drop the old column.
// sqlite3@5.x bundles SQLite 3.43+ which enforces CHECK constraints, so we
// cannot simply INSERT 'CANCELADA' without updating the constraint first.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE inventory_sessions RENAME COLUMN status TO status_legacy`);
  await knex.raw(`
    ALTER TABLE inventory_sessions
    ADD COLUMN status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO'
    CHECK(status IN ('EM_ANDAMENTO', 'FINALIZADO', 'CANCELADA'))
  `);
  await knex.raw(`UPDATE inventory_sessions SET status = status_legacy`);
  await knex.raw(`ALTER TABLE inventory_sessions DROP COLUMN status_legacy`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE inventory_sessions RENAME COLUMN status TO status_legacy`);
  await knex.raw(`
    ALTER TABLE inventory_sessions
    ADD COLUMN status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO'
    CHECK(status IN ('EM_ANDAMENTO', 'FINALIZADO'))
  `);
  // CANCELADA rows are rolled back to EM_ANDAMENTO on rollback
  await knex.raw(`
    UPDATE inventory_sessions
    SET status = CASE WHEN status_legacy = 'CANCELADA' THEN 'EM_ANDAMENTO' ELSE status_legacy END
  `);
  await knex.raw(`ALTER TABLE inventory_sessions DROP COLUMN status_legacy`);
}
