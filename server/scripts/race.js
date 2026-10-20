// Простой тест гонки: два одновременных POST /api/bookings
// Запуск: node scripts/race.js

const API = 'http://localhost:3000';

async function login(login, password) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`login ${login} failed: ${JSON.stringify(data)}`);
  return data.token;
}

async function tryBook(token, resourceId, start, end, purpose) {
  const r = await fetch(`${API}/api/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ resource_id: resourceId, start, end, purpose }),
  });
  let body;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}

async function main() {
  const tok1 = await login('user1', 'Passw0rd!');
  const tok2 = await login('user2', 'Passw0rd!');

  // Возьмём завтрашний день, 12:00–13:00 МСК. Поменяйте дату, если нужно.
  const resourceId = 4;
  const start = '2026-10-22T10:00:00+03:00';
  const end   = '2026-10-22T11:00:00+03:00';

  console.log('Запускаем два запроса одновременно...');
  const [a, b] = await Promise.all([
    tryBook(tok1, resourceId, start, end, 'Гонка A'),
    tryBook(tok2, resourceId, start, end, 'Гонка B'),
  ]);

  console.log('user1:', a.status, a.body?.code || a.body?.id);
  console.log('user2:', b.status, b.body?.code || b.body?.id);

  const statuses = [a.status, b.status].sort();
  if (statuses[0] === 201 && statuses[1] === 409) {
    console.log('OK: один успех, один конфликт');
  } else {
    console.log('ВНИМАНИЕ: неожиданный результат', statuses);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });