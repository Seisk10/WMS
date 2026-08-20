/**
 * Seed de emergência: limpa as tabelas transacionais e reimporta o
 * estoque a partir do arquivo Excel em uploads/ESTOQUE F01.xlsx.
 *
 * Uso:
 *   npm run seed
 */
import path from 'path';
import fs from 'fs';
import db, { runMigrations } from './connection';
import { importEstoque } from '../services/import-service';

const XLSX_PATH = path.resolve(__dirname, '../../uploads/ESTOQUE F01.xlsx');

const TABLES_TO_CLEAR = [
  'inventory_adjustments',
  'inventory_sessions',
  'inventory_balances',
  'stock_movements',
  'products',
] as const;

async function clearTables(): Promise<void> {
  // Deleção em ordem para respeitar FKs (mesmo com PRAGMA foreign_keys = OFF,
  // manter a ordem evita surpresas se for ligado no futuro).
  for (const table of TABLES_TO_CLEAR) {
    const deleted = await db(table).delete();
    console.log(`  [clear] ${table}: ${deleted} linha(s) removida(s)`);
  }

  // Reseta os contadores de auto-increment para que novos IDs comecem em 1.
  const tableList = TABLES_TO_CLEAR.join("', '");
  await db.raw(`DELETE FROM sqlite_sequence WHERE name IN ('${tableList}')`);
  console.log('  [clear] sqlite_sequence resetado');
}

async function main(): Promise<void> {
  console.log('\n=== WMS Seed ===\n');

  console.log('[1/4] Aplicando migrations pendentes...');
  await runMigrations();

  console.log('\n[2/4] Limpando tabelas...');
  await clearTables();

  console.log('\n[3/4] Lendo arquivo Excel...');
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`Arquivo não encontrado: ${XLSX_PATH}`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(XLSX_PATH);
  console.log(`  Arquivo carregado (${(buffer.length / 1024).toFixed(1)} KB)`);

  console.log('\n[4/4] Importando produtos e saldos...');
  const result = await importEstoque(buffer);
  console.log(`  ${result.imported} produto(s) importado(s) com sucesso`);

  await db.destroy();
  console.log('\n=== Seed concluído ===\n');
}

main().catch((err) => {
  console.error('\n[ERRO]', err.message ?? err);
  process.exit(1);
});
