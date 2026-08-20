import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { importEstoque } from '../services/import-service';
import { AppError } from '../utils/app-error';

export const importEstoqueController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new AppError('Nenhum arquivo enviado. Use o campo "file" no form-data.', 400, 'FILE_REQUIRED');
    }

    const result = await importEstoque(req.file.buffer);

    res.status(200).json({
      success: true,
      data: {
        imported: result.imported,
        message: `${result.imported} produto(s) importado(s) com sucesso.`,
      },
    });
  }
);
