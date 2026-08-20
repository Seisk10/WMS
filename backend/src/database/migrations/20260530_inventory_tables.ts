import type { Knex } from 'knex';

// inventory_counts (initial schema) não tinha created_by, category nem status em PT.
// Esta migration descarta as duas tabelas de inventário e as recria com o esquema correto.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_counts');
  await knex.schema.dropTableIfExists('inventory_sessions');

  await knex.schema.createTable('inventory_sessions', (table) => {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.string('category').notNullable();
    table
      .enu('status', ['EM_ANDAMENTO', 'FINALIZADO'])
      .notNullable()
      .defaultTo('EM_ANDAMENTO');
    table
      .integer('created_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('finalized_at').nullable();
  });

  await knex.schema.createTable('inventory_adjustments', (table) => {
    table.increments('id').primary();
    table
      .integer('session_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('inventory_sessions')
      .onDelete('CASCADE');
    table
      .integer('product_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('products');
    table
      .integer('location_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('locations');
    table.integer('counted_quantity').notNullable();
    table.integer('expected_quantity').nullable();
    table.integer('divergence').nullable();
    table
      .integer('counted_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users');
    table.timestamp('counted_at').defaultTo(knex.fn.now());
    // Constraint para o upsert: mesma sessão + produto + local = recontagem
    table.unique(['session_id', 'product_id', 'location_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_adjustments');
  await knex.schema.dropTableIfExists('inventory_sessions');

  // Restaura o schema original da migration inicial
  await knex.schema.createTable('inventory_sessions', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.enu('status', ['open', 'paused', 'finalized']).notNullable().defaultTo('open');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('inventory_counts', (table) => {
    table.increments('id').primary();
    table
      .integer('session_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('inventory_sessions')
      .onDelete('CASCADE');
    table.integer('product_id').unsigned().notNullable().references('id').inTable('products');
    table.integer('location_id').unsigned().notNullable().references('id').inTable('locations');
    table.integer('expected_quantity').notNullable().defaultTo(0);
    table.integer('counted_quantity').notNullable();
    table.integer('divergence').notNullable().defaultTo(0);
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('counted_at').defaultTo(knex.fn.now());
  });
}
