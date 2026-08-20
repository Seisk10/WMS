import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { login } from '../services/auth-service';

const loginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = loginSchema.parse(req.body);
  const result = await login(username, password);
  res.status(200).json({ success: true, data: result });
});
