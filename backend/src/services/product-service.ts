import db from '../database/connection';
import { AppError } from '../utils/app-error';

interface ProductRow {
  id: number;
  item_code: string;
  name: string;
  category: string;
  brand: string | null;
}

interface BalanceRow {
  location_id: number;
  location_name: string | null;
  location_type: string | null;
  quantity: number;
}

export interface ProductDetail extends ProductRow {
  barcodes: string[];
  balances: BalanceRow[];
}

async function resolveProduct(identifier: string): Promise<ProductRow> {
  const byCode = await db('products')
    .where({ item_code: identifier })
    .select<ProductRow[]>('id', 'item_code', 'name', 'category', 'brand')
    .first();

  if (byCode) return byCode;

  const barcodeRow = await db('product_barcodes')
    .where({ barcode: identifier })
    .select<{ product_id: number }[]>('product_id')
    .first();

  if (!barcodeRow) {
    throw new AppError(
      `Produto não encontrado para o identificador: ${identifier}`,
      404,
      'PRODUCT_NOT_FOUND'
    );
  }

  const byBarcode = await db('products')
    .where({ id: barcodeRow.product_id })
    .select<ProductRow[]>('id', 'item_code', 'name', 'category', 'brand')
    .first();

  if (!byBarcode) {
    throw new AppError(
      `Produto não encontrado para o identificador: ${identifier}`,
      404,
      'PRODUCT_NOT_FOUND'
    );
  }

  return byBarcode;
}

export async function findProduct(identifier: string): Promise<ProductDetail> {
  const product = await resolveProduct(identifier.trim());

  const [barcodeRows, balances] = await Promise.all([
    db('product_barcodes')
      .where({ product_id: product.id })
      .select<{ barcode: string }[]>('barcode'),

    db('inventory_balances as ib')
      .leftJoin('locations as l', 'l.id', 'ib.location_id')
      .where('ib.product_id', product.id)
      .select<BalanceRow[]>(
        'ib.location_id',
        'l.name as location_name',
        'l.type as location_type',
        'ib.quantity'
      ),
  ]);

  return {
    ...product,
    barcodes: barcodeRows.map((r) => r.barcode),
    balances,
  };
}
