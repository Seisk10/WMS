import type { Knex } from 'knex';
import path from 'path';

const config: Knex.Config = {
  client: 'sqlite3',
  connection: {
    filename: path.resolve(__dirname, 'src/database/db.sqlite'),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.resolve(__dirname, 'src/database/migrations'),
    loadExtensions: ['.ts'],
  },
};

export default config;
