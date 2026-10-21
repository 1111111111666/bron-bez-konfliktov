import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authRequired, adminRequired } from '../auth.js';

export const adminRouter = Router();

// Все маршруты ниже — только admin
adminRouter.use(authRequired, adminRequired);

// ============ РЕСУРСЫ ============

// GET /api/admin/resources — все, включая отключённые
adminRouter.get('/resources', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, description, location, is_active FROM resources ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/admin/resources
adminRouter.post('/resources', async (req, res, next) => {
  try {
    const { name, description, location } = req.body || {};

    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ code: 'VALIDATION', message: 'name обязателен, до 100 символов' });
    }
    if (!location || typeof location !== 'string' || location.length > 100) {
      return res.status(400).json({ code: 'VALIDATION', message: 'location обязателен, до 100 символов' });
    }
    if (description != null && (typeof description !== 'string' || description.length > 500)) {
      return res.status(400).json({ code: 'VALIDATION', message: 'description до 500 символов' });
    }

    const result = await query(
      `INSERT INTO resources (name, description, location, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, description, location, is_active`,
      [name, description ?? null, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/resources/:id
adminRouter.patch('/resources/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ code: 'VALIDATION', message: 'Некорректный id' });
    }

    const { name, description, location, is_active } = req.body || {};
    const sets = [];
    const params = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > 100 || !name) {
        return res.status(400).json({ code: 'VALIDATION', message: 'name до 100 символов' });
      }
      params.push(name); sets.push(`name = $${params.length}`);
    }
    if (description !== undefined) {
      if (description !== null && (typeof description !== 'string' || description.length > 500)) {
        return res.status(400).json({ code: 'VALIDATION', message: 'description до 500 символов' });
      }
      params.push(description); sets.push(`description = $${params.length}`);
    }
    if (location !== undefined) {
      if (typeof location !== 'string' || location.length > 100 || !location) {
        return res.status(400).json({ code: 'VALIDATION', message: 'location до 100 символов' });
      }
      params.push(location); sets.push(`location = $${params.length}`);
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ code: 'VALIDATION', message: 'is_active должен быть boolean' });
      }
      params.push(is_active); sets.push(`is_active = $${params.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ code: 'VALIDATION', message: 'Нет полей для изменения' });
    }

    const updated = await withTransaction(async (client) => {
      // Единый порядок блокировок: сначала FOR UPDATE по строке ресурса
      const lock = await client.query(
        'SELECT id FROM resources WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!lock.rows[0]) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Ресурс не найден' };
      }

      params.push(id);
      const r = await client.query(
        `UPDATE resources SET ${sets.join(', ')} WHERE id = $${params.length}
         RETURNING id, name, description, location, is_active`,
        params
      );
      return r.rows[0];
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ============ ВСЕ БРОНИ ============

// GET /api/admin/bookings?date=&resource_id=&status=
adminRouter.get('/bookings', async (req, res, next) => {
  try {
    const { date, resource_id, status } = req.query;

    const conditions = [];
    const params = [];

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ code: 'VALIDATION', message: 'date в формате YYYY-MM-DD' });
      }
      params.push(date);
      conditions.push(`b.start_time < ($${params.length}::date + interval '1 day') AT TIME ZONE 'Europe/Moscow'`);
      conditions.push(`b.end_time   >  $${params.length}::date AT TIME ZONE 'Europe/Moscow'`);
    }
    if (resource_id) {
      const rid = Number(resource_id);
      if (!Number.isInteger(rid)) {
        return res.status(400).json({ code: 'VALIDATION', message: 'resource_id должен быть числом' });
      }
      params.push(rid);
      conditions.push(`b.resource_id = $${params.length}`);
    }
    if (status) {
      if (!['Active', 'Cancelled'].includes(status)) {
        return res.status(400).json({ code: 'VALIDATION', message: 'status: Active или Cancelled' });
      }
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT b.id, b.resource_id, r.name AS resource_name,
              b.owner_id, u.login AS owner_login, u.name AS owner_name,
              b.start_time, b.end_time, b.purpose, b.status,
              b.created_at, b.cancelled_by, b.cancelled_at, b.cancel_reason
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       JOIN users u ON u.id = b.owner_id
       ${where}
       ORDER BY b.start_time DESC
       LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ============ АУДИТ ============

// GET /api/admin/audit?limit=
adminRouter.get('/audit', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const result = await query(
      `SELECT a.id, a.occurred_at, a.actor_id, u.login AS actor_login,
              a.action, a.object_type, a.object_id, a.result, a.trace_id
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});