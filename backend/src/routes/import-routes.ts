import { Router } from 'express';
import multer from 'multer';
import { importEstoqueController } from '../controllers/import-controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .xlsx são aceitos.'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.post('/estoque', upload.single('file'), importEstoqueController);

export default router;
