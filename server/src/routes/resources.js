import { Router } from 'express';
import { query } from '../db.js';

export const resourcesRouter = Router();

// GET /api/resources?search=&location=
resourcesRouter.get('/', async (req, res) => {
  const { search, location } = req.query;

  const conditions = ['is_active = true'];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (location) {
    params.push(location);
    conditions.push(`location = $${params.length}`);
  }

  const sql = `
    SELECT id, name, description, location, is_active
    FROM resources
    WHERE ${conditions.join(' AND ')}
    ORDER BY name
  `;
  const result = await query(sql, params);
  res.json(result.rows);
});

// GET /api/resources/:id
resourcesRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ code: 'VALIDATION', message: 'Некорректный id' });
  }

  const result = await query(
    'SELECT id, name, description, location, is_active FROM resources WHERE id = $1',
    [id]
  );
  const resource = result.rows[0];
  if (!resource) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Ресурс не найден' });
  }
  res.json(resource);
});

// GET /api/resources/:id/availability?date=YYYY-MM-DD
resourcesRouter.get('/:id/availability', async (req, res) => {
  const id = Number(req.params.id);
  const date = req.query.date;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ code: 'VALIDATION', message: 'Некорректный id' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ code: 'VALIDATION', message: 'date в формате YYYY-MM-DD' });
  }

  // Проверим, что ресурс существует
  const resource = await query('SELECT id FROM resources WHERE id = $1', [id]);
  if (!resource.rows[0]) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Ресурс не найден' });
  }

  // Границы дня в МСК: [date 00:00, date+1 00:00)
  const result = await query(
    `SELECT start_time, end_time
     FROM bookings
     WHERE resource_id = $1
       AND status = 'Active'
       AND start_time < ($2::date + interval '1 day') AT TIME ZONE 'Europe/Moscow'
       AND end_time   >  $2::date AT TIME ZONE 'Europe/Moscow'
     ORDER BY start_time`,
    [id, date]
  );

  // Отдаём ТОЛЬКО интервалы, без owner_id и purpose
  res.json(result.rows);
});