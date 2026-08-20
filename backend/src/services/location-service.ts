import db from '../database/connection';
import { AppError } from '../utils/app-error';

export type LocationType = 'gondola' | 'deposito';

export interface Location {
  id: number;
  name: string;
  type: LocationType;
  created_at: string;
}

export async function createLocation(
  name: string,
  type: LocationType
): Promise<{ id: number }> {
  const existing = await db('locations')
    .where({ name })
    .select<{ id: number }[]>('id')
    .first();

  if (existing) {
    throw new AppError(
      `Já existe uma localização com o nome "${name}".`,
      409,
      'LOCATION_ALREADY_EXISTS'
    );
  }

  const [id] = await db('locations').insert({ name, type });

  return { id: id as number };
}

export async function listLocations(): Promise<Location[]> {
  return db('locations').select<Location[]>('id', 'name', 'type', 'created_at').orderBy('name');
}
