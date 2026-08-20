import { Router } from 'express';
import authRoutes from './auth-routes';
import importRoutes from './import-routes';
import productRoutes from './product-routes';
import movementRoutes from './movement-routes';
import locationRoutes from './location-routes';
import inventoryRoutes from './inventory-routes';
import reportRoutes from './report-routes';
import dashboardRoutes from './dashboard-routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/import', importRoutes);
router.use('/products', productRoutes);
router.use('/movements', movementRoutes);
router.use('/locations', locationRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
