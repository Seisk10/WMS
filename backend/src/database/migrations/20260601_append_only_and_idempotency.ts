import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── 1. Remove colunas mutáveis de inventory_adjustments ─────────────────────
  // expected_quantity e divergence eram preenchidos por closeSession via UPDATE,
  // violando o modelo append-only. Os dados de reconciliação vão para a nova
  // tabela inventory_session_results (ver abaixo).
  await knex.schema.alterTable('inventory_adjustments', (table) => {
    table.dropColumn('expected_quantity');
    table.dropColumn('divergence');
  });

  // ── 2. Tabela append-only para resultados de reconciliação ───────────────────
  // closeSession INSERT aqui em vez de UPDATE em inventory_adjustments.
  // Registra o snapshot (expected_quantity, divergence) no momento do fechamento;
  // inventory_balances pode mudar depois via movimentações, então esse snapshot
  // é a única fonte confiável de divergência histórica por sessão.
  await knex.schema.createTable('inventory_session_results', (table) => {
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
    table.integer('expected_quantity').notNullable();
    table.integer('divergence').notNullable();
    table.timestamp('reconciled_at').defaultTo(knex.fn.now());

    // Uma entrada por produto+local por sessão (closeSession roda exatamente uma vez)
    table.unique(['session_id', 'product_id', 'location_id']);
  });

  // ── 3. Idempotência em stock_movements ───────────────────────────────────────
  await knex.schema.alterTable('stock_movements', (table) => {
    table.text('idempotency_key').nullable();
  });

  // Índice UNIQUE parcial: apenas valores não-null participam da constraint.
  // Clientes sem idempotency_key (NULL) podem coexistir sem conflito.
  // SQLite suporta partial index nativo via WHERE clause.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_stock_movements_idempotency_key
    ON stock_movements (idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_stock_movements_idempotency_key');

  await knex.schema.alterTable('stock_movements', (table) => {
    table.dropColumn('idempotency_key');
  });

  await knex.schema.dropTableIfExists('inventory_session_results');

  await knex.schema.alterTable('inventory_adjustments', (table) => {
    table.integer('expected_quantity').nullable();
    table.integer('divergence').nullable();
  });
}
