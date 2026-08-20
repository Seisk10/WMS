import db from '../database/connection';
import type { Knex } from 'knex';

/**
 * Subconjunto tipado do Knex usado dentro de transações IMMEDIATE.
 * Cada builder e raw retornados estão vinculados à conexão bruta da transação,
 * sem passar pelo pool. Suporta generics para preservar type-safety nas queries.
 */
export interface BoundKnex {
  <TRecord extends {} = any, TResult = TRecord[]>(
    tableName: string
  ): Knex.QueryBuilder<TRecord, TResult>;
  raw<TResult = any>(
    sql: string,
    bindings?: ReadonlyArray<Knex.RawBinding>
  ): Knex.Raw<TResult>;
}

/**
 * Executa `fn` dentro de um `BEGIN IMMEDIATE` no SQLite.
 *
 * Por que este helper existe
 * ──────────────────────────
 * O dialect SQLite3 do Knex 3.x ignora explicitamente o `isolationLevel`
 * (sqlite-transaction.js:152) e sempre emite `BEGIN;` (DEFERRED). Não há
 * nenhuma API pública do Knex que produza `BEGIN IMMEDIATE`.
 *
 * Com o pool padrão max=1, transações do mesmo processo já são serializadas
 * na fila do pool — Req B só inicia após Req A fazer COMMIT. Mesmo assim,
 * `BEGIN IMMEDIATE` é necessário para:
 *   • Queries avulsas fora de transação (como registerCount original):
 *     a conexão é liberada entre queries, permitindo interleave mesmo com max=1.
 *   • WAL mode: sem IMMEDIATE, uma tx DEFERRED pode encontrar
 *     SQLITE_BUSY_SNAPSHOT ao tentar commitar após um writer externo.
 *   • Backup/CLI/segundo worker: o lock de escrita é adquirido de imediato,
 *     impedindo leitores externos de interferir durante a transação crítica.
 *
 * Implementação
 * ─────────────
 * Adquire a conexão bruta do pool, emite BEGIN IMMEDIATE diretamente via
 * conn.run(), e expõe um `BoundKnex` que faz `.connection(conn)` em cada
 * query builder — garantindo que todas as queries participem do mesmo
 * BEGIN IMMEDIATE sem repassar pelo pool de conexões.
 */
export async function beginImmediateTransaction<T>(
  fn: (trx: BoundKnex) => Promise<T>
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn: any = await (db as any).client.acquireConnection();

  const run = (sql: string): Promise<void> =>
    new Promise((resolve, reject) =>
      conn.run(sql, (err: Error | null) => (err ? reject(err) : resolve()))
    );

  await run('BEGIN IMMEDIATE');

  try {
    // Proxy que encaminha chamadas para rawConn via .connection(conn),
    // garantindo participação na transação IMMEDIATE. Generics preservados
    // via asserção de tipo explícita no retorno de cada método.
    const bound = Object.assign(
      function boundTable<TRecord extends {} = any, TResult = TRecord[]>(
        tableName: string
      ): Knex.QueryBuilder<TRecord, TResult> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((db as any)(tableName) as any).connection(conn) as Knex.QueryBuilder<TRecord, TResult>;
      },
      {
        raw<TResult = any>(
          sql: string,
          bindings?: ReadonlyArray<Knex.RawBinding>
        ): Knex.Raw<TResult> {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (db.raw(sql, bindings as any) as any).connection(conn) as Knex.Raw<TResult>;
        },
      }
    ) as unknown as BoundKnex;

    const result = await fn(bound);
    await run('COMMIT');
    return result;
  } catch (err) {
    await run('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).client.releaseConnection(conn);
  }
}
