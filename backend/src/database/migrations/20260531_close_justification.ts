import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inventory_sessions', (table) => {
    table.text('close_justification').nullable();
    table.boolean('blind_count').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inventory_sessions', (table) => {
    table.dropColumn('blind_count');
    table.dropColumn('close_justification');
  });
}
