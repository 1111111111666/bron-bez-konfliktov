import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, adminRequired } from '../auth.js';

export const adminRouter = Router();

// Все маршруты ниже — только admin
adminRouter.use(authRequired, adminRequired);

// POST /api/admin/resources
adminRouter.post('/resources', async (req, res) => {
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