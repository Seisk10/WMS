import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username').notNullable().unique();
    table.string('password_hash').notNullable();
    table.enu('role', ['ADMIN', 'SUPERVISOR', 'OPERADOR']).notNullable().defaultTo('OPERADOR');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('products', (table) => {
    table.increments('id').primary();
    table.string('item_code').notNullable().unique();
    table.string('name').notNullable();
    table.string('category').notNullable();
    table.string('brand').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('product_barcodes', (table) => {
    table.increments('id').primary();
    table
      .integer('product_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('products')
      .onDelete('CASCADE');
    table.string('barcode').notNullable().unique();
  });

  await knex.schema.createTable('locations', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.enu('type', ['gondola', 'deposit']).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('inventory_balances', (table) => {
    table
      .integer('product_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('products')
      .onDelete('CASCADE');
    table
      .integer('location_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('locations')
      .onDelete('CASCADE');
    table.integer('quantity').notNullable().defaultTo(0);
    table.primary(['product_id', 'location_id']);
  });

  await knex.schema.createTable('stock_movements', (table) => {
    table.increments('id').primary();
    table
      .integer('product_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('products');
    table
      .integer('origin_location_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('locations');
    table
      .integer('destination_location_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('locations');
    table.integer('quantity').notNullable();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users');
    table.timestamp('moved_at').defaultTo(knex.fn.now());
  });

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
    table.integer('expected_quantity').notNullable().defaultTo(0);
    table.integer('counted_quantity').notNullable();
    table.integer('divergence').notNullable().defaultTo(0);
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users');
    table.timestamp('counted_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_counts');
  await knex.schema.dropTableIfExists('inventory_sessions');
  await knex.schema.dropTableIfExists('stock_movements');
  await knex.schema.dropTableIfExists('inventory_balances');
  await knex.schema.dropTableIfExists('locations');
  await knex.schema.dropTableIfExists('product_barcodes');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('users');
}
