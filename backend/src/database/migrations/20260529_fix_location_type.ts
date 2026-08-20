import type { Knex } from 'knex';

// SQLite não suporta ALTER TABLE para modificar CHECK constraints.
// Estratégia: criar tabela nova → copiar dados (convertendo 'deposit' → 'deposito') → dropar antiga → renomear.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('locations_new', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.enu('type', ['gondola', 'deposito']).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    INSERT INTO locations_new (id, name, type, created_at)
    SELECT id, name, CASE WHEN type = 'deposit' THEN 'deposito' ELSE type END, created_at
    FROM locations
  `);

  await knex.schema.dropTable('locations');
  await knex.schema.renameTable('locations_new', 'locations');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable('locations_old', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.enu('type', ['gondola', 'deposit']).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    INSERT INTO locations_old (id, name, type, created_at)
    SELECT id, name, CASE WHEN type = 'deposito' THEN 'deposit' ELSE type END, created_at
    FROM locations
  `);

  await knex.schema.dropTable('locations');
  await knex.schema.renameTable('locations_old', 'locations');
}
