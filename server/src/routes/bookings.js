import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../auth.js';
import { validateBookingTime, createBooking } from '../services/booking.js';
import { cancelBooking } from '../services/booking.js';

export const bookingsRouter = Router();
bookingsRouter.use(authRequired);

// POST /api/bookings
bookingsRouter.post('/', async (req, res, next) => {
  try {
    const { resource_id, start, end, purpose } = req.body || {};

    if (!Number.isInteger(resource_id)) {
      return res.status(400).json({ code: 'VALIDATION', message: 'resource_id обязателен' });
    }
    if (!purpose || typeof purpose !== 'string' || purpose.length < 5 || purpose.length > 300) {
      return res.status(400).json({ code: 'VALIDATION', message: 'purpose от 5 до 300 символов' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    validateBookingTime(startDate, endDate);

    const booking = await createBooking({
      ownerId: req.user.sub,          // владелец — из JWT, не из тела!
      resourceId: resource_id,
      start: startDate,
      end: endDate,
      purpose,
      traceId: req.traceId,
    });

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/my
bookingsRouter.get('/my', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.id, b.resource_id, r.name AS resource_name,
              b.start_time, b.end_time, b.purpose, b.status,
              b.created_at, b.cancelled_at, b.cancel_reason
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       WHERE b.owner_id = $1
       ORDER BY b.start_time DESC`,
      [req.user.sub]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/bookings/:id — owner или admin, иначе 404
bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ code: 'VALIDATION', message: 'Некорректный id' });
    }

    const result = await query(
      `SELECT b.id, b.resource_id, r.name AS resource_name,
              b.owner_id, b.start_time, b.end_time, b.purpose, b.status,
              b.created_at, b.cancelled_at, b.cancel_reason
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       WHERE b.id = $1`,
      [id]
    );
    const booking = result.rows[0];
    if (!booking) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Запись не найдена' });
    }

    // Чужая запись для обычного пользователя — 404, а не 403 (требование методички)
    const isOwner = booking.owner_id === req.user.sub;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Запись не найдена' });
    }

    // Обычному пользователю не показываем owner_id (это его запись, но лишнее)
    if (!isAdmin) delete booking.owner_id;
    res.json(booking);
  } catch (err) { next(err); }
});

// POST /api/bookings/:id/cancel
bookingsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ code: 'VALIDATION', message: 'Некорректный id' });
    }
    const { reason } = req.body || {};

    const { booking, alreadyCancelled } = await cancelBooking({
      bookingId: id,
      actorId: req.user.sub,
      actorRole: req.user.role,
      reason,
      traceId: req.traceId,
    });

    // Повторная отмена — 200, но без нового события
    res.json({ ...booking, already_cancelled: alreadyCancelled });
  } catch (err) { next(err); }
});