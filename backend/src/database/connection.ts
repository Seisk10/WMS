import Knex from 'knex';
import path from 'path';

const db = Knex({
  client: 'sqlite3',
  connection: {
    filename: path.resolve(__dirname, 'db.sqlite'),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    loadExtensions: ['.ts'],
  },
  pool: {
    // Se um processo externo (CLI, backup, segundo worker) bloquear o arquivo,
    // o driver aguarda até 5 s antes de lançar SQLITE_BUSY.
    // O padrão do node-sqlite3 é 0 ms (falha imediata).
    // conn.run executa um statement por vez — dois PRAGMAs encadeados.
    afterCreate: (conn: any, cb: (err: Error | null) => void) => {
      conn.run('PRAGMA busy_timeout = 5000;', (err: Error | null) => {
        if (err) return cb(err);
        conn.run('PRAGMA foreign_keys = ON;', cb);
      });
    },
  },
});

export async function runMigrations(): Promise<void> {
  await db.migrate.latest();
  console.log('[WMS] Migrations aplicadas com sucesso.');
}

export default db;
