import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/error-handler';
import routes from './routes';
import { runMigrations } from './database/connection';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1', routes);
app.use(errorHandler);

async function bootstrap(): Promise<void> {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`[WMS] Backend rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('[WMS] Falha ao iniciar o servidor:', err);
  process.exit(1);
});
