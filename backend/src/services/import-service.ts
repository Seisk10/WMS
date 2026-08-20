import * as XLSX from 'xlsx';
import db from '../database/connection';
import { AppError } from '../utils/app-error';

interface EstoqueRow {
  item_code: string;
  name: string;
  quantity: number;
  category: string;
}

interface ValidationError {
  row: number;
  message: string;
}

export interface ImportEstoqueResult {
  imported: number;
  errors: ValidationError[];
}

const DEFAULT_LOCATION_NAME = 'Gôndola Padrão';
const EXPECTED_HEADERS = ['ITEM', 'DESCRICAO', 'ESTOQUE', 'SETOR'] as const;

/**
 * Varre as primeiras linhas da planilha para encontrar a linha que contém
 * os cabeçalhos reais. Necessário porque o ERP exporta metadados na Linha 1.
 */
function findHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;

    const cells = new Set(row.map((c) => String(c ?? '').trim().toUpperCase()));
    const matched = EXPECTED_HEADERS.filter((h) => cells.has(h)).length;

    if (matched >= 3) return i;
  }

  throw new AppError(
    `Cabeçalhos não encontrados nas primeiras 10 linhas. Esperados: ${EXPECTED_HEADERS.join(', ')}.`,
    422,
    'INVALID_FORMAT'
  );
}

function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [
      k.trim(),
      typeof v === 'string' ? v.trim() : v,
    ])
  );
}

function parseRows(buffer: Buffer): { rows: EstoqueRow[]; errors: ValidationError[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new AppError('O arquivo Excel está vazio ou sem planilhas.', 400, 'EMPTY_FILE');
  }

  const sheet = workbook.Sheets[sheetName];
  const headerRowIndex = findHeaderRowIndex(sheet);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: headerRowIndex,
  });

  const rows: EstoqueRow[] = [];
  const errors: ValidationError[] = [];

  rawRows.forEach((rawRow, index) => {
    // +2: +1 para a linha de header, +1 para indexação 1-based na planilha física
    const rowNum = headerRowIndex + index + 2;
    const row = normalizeRow(rawRow);

    const item_code = String(row['ITEM'] ?? '').trim();
    const name = String(row['DESCRICAO'] ?? '').trim();
    const rawQuantity = row['ESTOQUE'];
    const quantity = Number(rawQuantity);
    const category = String(row['SETOR'] ?? '').trim();

    const rowErrors: string[] = [];
    if (!item_code) rowErrors.push('ITEM é obrigatório');
    if (!name) rowErrors.push('DESCRICAO é obrigatória');
    if (rawQuantity === undefined || rawQuantity === null || rawQuantity === '') {
      rowErrors.push('ESTOQUE é obrigatório');
    } else if (isNaN(quantity)) {
      rowErrors.push('ESTOQUE deve ser um número');
    }
    if (!category) rowErrors.push('SETOR é obrigatório');

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join(', ') });
      return;
    }

    rows.push({ item_code, name, quantity, category });
  });

  return { rows, errors };
}

async function getOrCreateDefaultLocation(
  trx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<number> {
  const existing = await trx('locations')
    .where({ name: DEFAULT_LOCATION_NAME })
    .select<{ id: number }[]>('id')
    .first();

  if (existing) return existing.id;

  await trx('locations').insert({ name: DEFAULT_LOCATION_NAME, type: 'gondola' });

  const created = await trx('locations')
    .where({ name: DEFAULT_LOCATION_NAME })
    .select<{ id: number }[]>('id')
    .first();

  if (!created) throw new AppError('Falha ao criar localização padrão.', 500, 'DB_ERROR');

  return created.id;
}

export async function importEstoque(buffer: Buffer): Promise<ImportEstoqueResult> {
  const { rows, errors } = parseRows(buffer);

  if (errors.length > 0) {
    throw new AppError(
      `Erros de validação encontrados em ${errors.length} linha(s). Corrija antes de reimportar.`,
      422,
      'VALIDATION_ERROR',
      errors
    );
  }

  if (rows.length === 0) {
    throw new AppError('Nenhuma linha válida encontrada no arquivo.', 400, 'EMPTY_ROWS');
  }

  await db.transaction(async (trx) => {
    const locationId = await getOrCreateDefaultLocation(trx);

    for (const row of rows) {
      await trx('products')
        .insert({ item_code: row.item_code, name: row.name, category: row.category })
        .onConflict('item_code')
        .merge(['name', 'category']);

      const product = await trx('products')
        .where({ item_code: row.item_code })
        .select<{ id: number }[]>('id')
        .first();

      if (!product) throw new AppError(`Produto ${row.item_code} não encontrado após upsert.`, 500, 'DB_ERROR');

      await trx('inventory_balances')
        .insert({ product_id: product.id, location_id: locationId, quantity: row.quantity })
        .onConflict(['product_id', 'location_id'])
        .merge(['quantity']);
    }
  });

  return { imported: rows.length, errors: [] };
}
