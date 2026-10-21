import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { authRouter } from './routes/auth.js';
import { resourcesRouter } from './routes/resources.js';
import { adminRouter } from './routes/admin.js';
import { bookingsRouter } from './routes/bookings.js';
import { traceIdMiddleware, errorHandler } from './errors.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// traceId — первым, до всех роутов
app.use(traceIdMiddleware);

// health (без логирования тела)
app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    logger.error({ traceId: req.traceId, err: err.message }, 'ready check failed');
    res.status(503).json({ status: 'not ready' });
  }
});

// API
app.use('/api/auth', authRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/admin', adminRouter);

// статика
app.use(express.static(path.join(__dirname, '..', '..', 'web')));

// 404 для неизвестных API-путей
app.use('/api', (req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Маршрут не найден', traceId: req.traceId });
});

// error-handler — ПОСЛЕДНИМ
app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => logger.info(`http://localhost:${port}`));