import { withTransaction } from '../db.js';
import crypto from 'node:crypto';

// Границы окна бронирования по МСК
const WORK_START_HOUR = 8;   // 08:00 МСК
const WORK_END_HOUR = 22;    // 22:00 МСК
const STEP_MIN = 30;
const MIN_DURATION_MIN = 30;
const MAX_DURATION_MIN = 4 * 60;
const MAX_AHEAD_DAYS = 30;

/**
 * Валидация времени. Бросает { status: 400, code, message } при ошибке.
 * start/end — Date (уже в UTC, из ISO-строки со смещением).
 */
export function validateBookingTime(start, end, now = new Date()) {
  if (!(start instanceof Date) || isNaN(start)) {
    throw { status: 400, code: 'VALIDATION', message: 'Некорректное start' };
  }
  if (!(end instanceof Date) || isNaN(end)) {
    throw { status: 400, code: 'VALIDATION', message: 'Некорректное end' };
  }
  if (end <= start) {
    throw { status: 400, code: 'VALIDATION', message: 'Окончание должно быть позже начала' };
  }

  const durationMin = (end - start) / 60000;
  if (durationMin < MIN_DURATION_MIN || durationMin > MAX_DURATION_MIN) {
    throw { status: 400, code: 'VALIDATION', message: 'Длительность от 30 минут до 4 часов' };
  }
  if (durationMin % STEP_MIN !== 0) {
    throw { status: 400, code: 'VALIDATION', message: 'Шаг времени — 30 минут' };
  }

  // Начало не в прошлом
  if (start <= now) {
    throw { status: 400, code: 'VALIDATION', message: 'Начало не может быть в прошлом' };
  }
  // Не позднее чем через 30 суток
  const maxAhead = new Date(now.getTime() + MAX_AHEAD_DAYS * 24 * 3600 * 1000);
  if (start > maxAhead) {
    throw { status: 400, code: 'VALIDATION', message: 'Начало не позднее чем через 30 суток' };
  }

  // Окно 08:00–22:00 МСК. Переводим обе границы в МСК и проверяем.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const startMsk = fmt.format(start); // "HH:MM"
  const endMsk = fmt.format(end);

  // Бронь целиком в один рабочий день (по МСК)
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  if (dayFmt.format(start) !== dayFmt.format(end)) {
    throw { status: 400, code: 'VALIDATION', message: 'Бронь должна помещаться в один день' };
  }

  // Время начала/окончания в минутах от полуночи МСК
  const [sh, sm] = startMsk.split(':').map(Number);
  const [eh, em] = endMsk.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const workStart = WORK_START_HOUR * 60;
  const workEnd = WORK_END_HOUR * 60;
  if (startMin < workStart || endMin > workEnd) {
    throw { status: 400, code: 'VALIDATION', message: 'Бронирование доступно с 08:00 до 22:00 МСК' };
  }
}
/** Хеш нормализованных данных запроса — чтобы отличить «тот же запрос» от «другой с тем же ключом» */
function hashRequest({ resourceId, start, end, purpose }) {
  const norm = JSON.stringify({
    resourceId,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    purpose,
  });
  return crypto.createHash('sha256').update(norm).digest('hex');
}

export async function createBooking({
  ownerId, resourceId, start, end, purpose, idempotencyKey, traceId,
}) {
  const requestHash = idempotencyKey ? hashRequest({ resourceId, start, end, purpose }) : null;

  // Быстрая проверка: ключ уже использован?
  // (не заменяет защиту внутри транзакции, но экономит работу в частом случае)
  if (idempotencyKey) {
    const existing = await query(
      'SELECT booking_id, request_hash FROM idempotency_keys WHERE user_id = $1 AND key = $2',
      [ownerId, idempotencyKey]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash) {
        throw { status: 409, code: 'IDEMPOTENCY_MISMATCH', message: 'Ключ повторного запроса использован с другими данными' };
      }
      const b = await query('SELECT * FROM bookings WHERE id = $1', [existing.rows[0].booking_id]);
      return { booking: b.rows[0], replayed: true };
    }
  }

  try {
    const booking = await withTransaction(async (client) => {
      // 1) Блокировка ресурса — единый порядок с PATCH и отменой
      const r = await client.query(
        'SELECT id, is_active FROM resources WHERE id = $1 FOR UPDATE',
        [resourceId]
      );
      if (!r.rows[0]) throw { status: 404, code: 'NOT_FOUND', message: 'Ресурс не найден' };
      if (!r.rows[0].is_active) throw { status: 409, code: 'RESOURCE_DISABLED', message: 'Ресурс отключён для новых бронирований' };

      // 2) Пересечение
      const conflict = await client.query(
        `SELECT 1 FROM bookings
         WHERE resource_id = $1 AND status = 'Active'
           AND start_time < $3 AND end_time > $2
         LIMIT 1`,
        [resourceId, start, end]
      );
      if (conflict.rowCount > 0) {
        throw { status: 409, code: 'TIME_CONFLICT', message: 'Ресурс уже занят в выбранное время' };
      }

      // 3) INSERT брони
      const ins = await client.query(
        `INSERT INTO bookings (resource_id, owner_id, start_time, end_time, purpose, status)
         VALUES ($1, $2, $3, $4, $5, 'Active')
         RETURNING id, resource_id, owner_id, start_time, end_time, purpose, status, created_at`,
        [resourceId, ownerId, start, end, purpose]
      );
      const created = ins.rows[0];

      // 4) Сохраняем ключ в ТОЙ ЖЕ транзакции
      if (idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_keys (user_id, key, request_hash, booking_id)
           VALUES ($1, $2, $3, $4)`,
          [ownerId, idempotencyKey, requestHash, created.id]
        );
      }

      // 5) Аудит
      await client.query(
        `INSERT INTO audit_events (actor_id, action, object_type, object_id, result, trace_id)
         VALUES ($1, 'booking.create', 'Booking', $2, 'success', $3)`,
        [ownerId, created.id, traceId ?? null]
      );

      return created;
    });

    return { booking, replayed: false };
  } catch (err) {
    // Гонка по ключу: два одновременных запроса с одним ключом.
    // Второй ловит unique violation (23505) — возвращаем результат первого.
    if (err.code === '23505' && idempotencyKey) {
      const existing = await query(
        'SELECT booking_id, request_hash FROM idempotency_keys WHERE user_id = $1 AND key = $2',
        [ownerId, idempotencyKey]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) {
          throw { status: 409, code: 'IDEMPOTENCY_MISMATCH', message: 'Ключ повторного запроса использован с другими данными' };
        }
        const b = await query('SELECT * FROM bookings WHERE id = $1', [existing.rows[0].booking_id]);
        return { booking: b.rows[0], replayed: true };
      }
    }
    throw err;
  }
}

export async function cancelBooking({ bookingId, actorId, actorRole, reason, traceId }) {
  return withTransaction(async (client) => {
    // Блокируем строку брони, чтобы две одновременные отмены не сделали двойную работу
    const r = await client.query(
      'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );
    const booking = r.rows[0];
    if (!booking) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Запись не найдена' };
    }

    const isOwner = booking.owner_id === actorId;
    const isAdmin = actorRole === 'admin';
    // Чужая запись для обычного пользователя — 404 (не раскрываем существование)
    if (!isOwner && !isAdmin) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Запись не найдена' };
    }

    // Уже отменена — возвращаем как есть, без нового события
    if (booking.status === 'Cancelled') {
      return { booking, alreadyCancelled: true };
    }

    // Начавшуюся/завершённую отменять нельзя
    const now = new Date();
    if (new Date(booking.start_time) <= now) {
      throw { status: 409, code: 'ALREADY_STARTED', message: 'Нельзя отменить начавшуюся или завершённую запись' };
    }

    // Админ обязан указать причину
    if (isAdmin && !isOwner && !reason) {
      throw { status: 400, code: 'VALIDATION', message: 'Администратор должен указать причину отмены' };
    }
    if (reason != null && (typeof reason !== 'string' || reason.length > 300)) {
      throw { status: 400, code: 'VALIDATION', message: 'Причина до 300 символов' };
    }

    const upd = await client.query(
      `UPDATE bookings
       SET status = 'Cancelled',
           cancelled_by = $2,
           cancelled_at = now(),
           cancel_reason = $3
       WHERE id = $1
       RETURNING id, resource_id, owner_id, start_time, end_time, purpose, status,
                 created_at, cancelled_by, cancelled_at, cancel_reason`,
      [bookingId, actorId, reason ?? null]
    );

    // Аудит в той же транзакции
    await client.query(
      `INSERT INTO audit_events (actor_id, action, object_type, object_id, result, trace_id)
       VALUES ($1, 'booking.cancel', 'Booking', $2, 'success', $3)`,
      [actorId, bookingId, traceId ?? null]
    );

    return { booking: upd.rows[0], alreadyCancelled: false };
  });
}