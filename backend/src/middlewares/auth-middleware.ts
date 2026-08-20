import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/app-error';
import type { AuthPayload, UserRole } from '../types';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError('Token de autenticação ausente.', 401, 'UNAUTHORIZED'));
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    next(new AppError('JWT_SECRET não configurado.', 500, 'CONFIG_ERROR'));
    return;
  }

  try {
    req.user = jwt.verify(token, secret) as AuthPayload;
    next();
  } catch {
    next(new AppError('Token inválido ou expirado.', 401, 'INVALID_TOKEN'));
  }
}

export function requireUser(req: Request): AuthPayload {
  if (!req.user) throw new AppError('Não autenticado.', 401, 'UNAUTHORIZED');
  return req.user;
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = requireUser(req);
      if (!roles.includes(user.role)) {
        throw new AppError(
          `Acesso negado. Requer perfil: ${roles.join(' ou ')}.`,
          403,
          'FORBIDDEN'
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
