import { getToken, clearAuth } from './auth.js';

/**
 * Универсальный запрос к API.
 * - добавляет Authorization, если есть токен
 * - добавляет Idempotency-Key, если передан
 * - при 401 — чистит токен и уводит на login
 * - возвращает { ok, status, data } — без throw, чтобы вызывающий решал
 */
export async function api(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkErr) {
    // Сеть недоступна — отдельный тип ошибки
    return { ok: false, status: 0, data: { code: 'NETWORK', message: 'Нет связи с сервером' } };
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }

if (response.status === 401) {
  // На странице логина 401 = неверный пароль, не редиректим
  if (!location.pathname.endsWith('/login.html') && !location.pathname.endsWith('/login')) {
    clearAuth();
    const back = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?back=${back}`;
  }
  return { ok: false, status: 401, data };
}
  return { ok: response.ok, status: response.status, data };
}

/** Генерация ключа идемпотентности (UUID v4) */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}