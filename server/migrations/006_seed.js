import bcrypt from 'bcryptjs';

export const shorthands = undefined;

export async function up(pgm) {
  // пользователи
  const hash = await bcrypt.hash('Passw0rd!', 10);

  pgm.sql(`
    INSERT INTO users (name, login, password_hash, role) VALUES
      ('Пользователь 1', 'user1', '${hash}', 'user'),
      ('Пользователь 2', 'user2', '${hash}', 'user'),
      ('Администратор',  'admin', '${hash}', 'admin')
    ON CONFLICT (login) DO NOTHING;
  `);

  // переговорные
  pgm.sql(`
    INSERT INTO resources (name, description, location) VALUES
      ('Переговорная 1', 'Комната на 6 человек, проектор', 'Корпус А, 2 этаж'),
      ('Переговорная 2', 'Комната на 10 человек, ВКС',  'Корпус А, 3 этаж'),
      ('Переговорная 3', 'Комната на 4 человека',      'Корпус Б, 1 этаж'),
      ('Переговорная 4', 'Комната на 8 человек',        'Корпус Б, 2 этаж'),
      ('Переговорная 5', 'Комната на 12 человек',       'Корпус В, 1 этаж');
  `);

  // демо-брони: завтра 10:00–11:00 МСК (Active) и послезавтра (Cancelled)
  pgm.sql(`
    INSERT INTO bookings (resource_id, owner_id, start_time, end_time, purpose, status)
    SELECT
      (SELECT id FROM resources WHERE name = 'Переговорная 1'),
      (SELECT id FROM users     WHERE login = 'user1'),
      (current_date + interval '1 day' + interval '10 hours') AT TIME ZONE 'Europe/Moscow',
      (current_date + interval '1 day' + interval '11 hours') AT TIME ZONE 'Europe/Moscow',
      'Планёрка команды',
      'Active';

    INSERT INTO bookings (resource_id, owner_id, start_time, end_time, purpose, status, cancelled_at, cancel_reason)
    SELECT
      (SELECT id FROM resources WHERE name = 'Переговорная 2'),
      (SELECT id FROM users     WHERE login = 'user2'),
      (current_date + interval '2 day' + interval '14 hours') AT TIME ZONE 'Europe/Moscow',
      (current_date + interval '2 day' + interval '15 hours') AT TIME ZONE 'Europe/Moscow',
      'Встреча с заказчиком',
      'Cancelled',
      now(),
      'Отменено вручную';
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DELETE FROM bookings
    WHERE owner_id IN (SELECT id FROM users WHERE login IN ('user1','user2'));
    DELETE FROM users WHERE login IN ('user1','user2','admin');
  `);
}