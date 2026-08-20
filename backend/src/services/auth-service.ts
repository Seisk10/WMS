import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/connection';
import { AppError } from '../utils/app-error';
import type { AuthPayload, UserRole } from '../types';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
}

export interface LoginResult {
  token: string;
  user: { id: number; name: string; role: UserRole };
}

async function seedAdminIfEmpty(): Promise<void> {
  const row = await db('users')
    .count<{ count: string | number }>({ count: 'id' })
    .first();

  if (Number(row?.count ?? 0) === 0) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db('users').insert({
      username: 'admin',
      password_hash: passwordHash,
      role: 'ADMIN',
    });
    console.log('[WMS] Tabela de usuários vazia — usuário admin criado automaticamente.');
  }
}

export async function login(username: string, password: string): Promise<LoginResult> {
  await seedAdminIfEmpty();

  const user = await db<UserRow>('users')
    .where({ username })
    .select('id', 'username', 'password_hash', 'role')
    .first();

  const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordMatch) {
    throw new AppError('Usuário ou senha inválidos', 401, 'INVALID_CREDENTIALS');
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError('JWT_SECRET não configurado', 500, 'CONFIG_ERROR');
  }

  const payload: AuthPayload = { userId: user.id, role: user.role };
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '8h') as jwt.SignOptions['expiresIn'];
  const token = jwt.sign(payload, secret, { expiresIn });

  return {
    token,
    user: { id: user.id, name: user.username, role: user.role },
  };
}
