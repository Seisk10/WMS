import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { createLocation, listLocations } from '../services/location-service';

const createLocationSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  type: z.enum(['gondola', 'deposito'], {
    errorMap: () => ({ message: "Tipo deve ser 'gondola' ou 'deposito'." }),
  }),
});

export const createLocationHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, type } = createLocationSchema.parse(req.body);
    const result = await createLocation(name, type);
    res.status(201).json({ success: true, data: result });
  }
);

export const listLocationsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const locations = await listLocations();
    res.status(200).json({ success: true, data: locations });
  }
);
