import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { findProduct } from '../services/product-service';

export const getProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { identifier } = req.params;
  const product = await findProduct(identifier);

  res.status(200).json({ success: true, data: product });
});
