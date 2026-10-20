import { requireAuth, getUser, clearAuth } from '../auth.js';
import { api, newIdempotencyKey } from '../api.js';

requireAuth();

// --- шапка ---
const user = getUser();
if (user) {
  document.getElementById('who').textContent = `${user.name} (${user.role})`;
  if (user.role === 'admin') document.getElementById('admin-link').hidden = false;
}
document.getElementById('logout').addEventListener('click', (e) => {
  e.preventDefault();
  clearAuth();
  location.href = '/login.html';
});

// --- id из URL ---
const params = new URLSearchParams(location.search);
const resourceId = Number(params.get('id'));
if (!Number.isInteger(resourceId)) {
  document.getElementById('state').textContent = 'Некорректный id ресурса';
  throw new Error('bad id');
}

// --- элементы ---
const stateEl = document.getElementById('state');
const contentEl = document.getElementById('content');
const nameEl = document.getElementById('res-name');
const locEl = document.getElementById('res-location');
const descEl = document.getElementById('res-description');
const dateEl = document.getElementById('date');
const busyEl = document.getElementById('busy');
const form = document.getElementById('book-form');
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');
const purposeEl = document.getElementById('purpose');
const submitBtn = document.getElementById('submit');
const formErrorEl = document.getElementById('form-error');
const successEl = document.getElementById('success');
const successBodyEl = document.getElementById('success-body');

// --- утилиты ---
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// дата по умолчанию — сегодня (в МСК)
function todayMsk() {
  const now = new Date();
  const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const y = msk.getFullYear();
  const m = String(msk.getMonth() + 1).padStart(2, '0');
  const d = String(msk.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
 
function toMskTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// --- загрузка карточки ---
async function loadResource() {
  const res = await api(`/resources/${resourceId}`);
  if (!res.ok) {
    stateEl.className = 'state error';
    stateEl.textContent = res.status === 0
      ? 'Нет связи с сервером'
      : (res.data?.message || 'Не удалось загрузить ресурс');
    return false;
  }
  const r = res.data;
  nameEl.textContent = r.name;
  locEl.textContent = r.location;
  descEl.textContent = r.description || '';
  stateEl.hidden = true;
  contentEl.hidden = false;
  return true;
}

// --- занятые интервалы ---
async function loadAvailability() {
  const date = dateEl.value;
  if (!date) return;
  busyEl.innerHTML = '<div class="hint">Загрузка…</div>';

  const res = await api(`/resources/${resourceId}/availability?date=${date}`);
  if (!res.ok) {
    busyEl.innerHTML = `<div class="error">${escapeHtml(res.data?.message || 'Не удалось загрузить интервалы')}</div>`;
    return;
  }
  if (res.data.length === 0) {
    busyEl.innerHTML = '<div class="hint">Свободно весь день.</div>';
    return;
  }
  busyEl.innerHTML = '';
  for (const b of res.data) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<div class="meta">${toMskTime(b.start_time)} — ${toMskTime(b.end_time)} (МСК)</div>`;
    busyEl.appendChild(div);
  }
}

// --- валидация на клиенте (для удобства; сервер всё равно проверит) ---
function parseTimeToDate(dateStr, timeStr) {
  // Собираем ISO с МСК: "2026-10-21T10:00:00+03:00"
  return new Date(`${dateStr}T${timeStr}:00+03:00`);
}

function validateForm() {
  for (const el of document.querySelectorAll('.error[data-for]')) el.textContent = '';
  formErrorEl.textContent = '';

  const date = dateEl.value;
  if (!date) {
    formErrorEl.textContent = 'Выберите дату';
    return null;
  }
  if (!startEl.value || !endEl.value) {
    formErrorEl.textContent = 'Укажите начало и окончание';
    return null;
  }
  const start = parseTimeToDate(date, startEl.value);
  const end = parseTimeToDate(date, endEl.value);

  if (end <= start) {
    document.querySelector('.error[data-for="end"]').textContent = 'Окончание позже начала';
    return null;
  }
  const durationMin = (end - start) / 60000;
  if (durationMin < 30 || durationMin > 240) {
    formErrorEl.textContent = 'Длительность от 30 минут до 4 часов';
    return null;
  }
  if (durationMin % 30 !== 0) {
    formErrorEl.textContent = 'Шаг времени — 30 минут';
    return null;
  }
  if (start <= new Date()) {
    formErrorEl.textContent = 'Начало не может быть в прошлом';
    return null;
  }
  const purpose = purposeEl.value.trim();
  if (purpose.length < 5 || purpose.length > 300) {
    document.querySelector('.error[data-for="purpose"]').textContent = 'Цель от 5 до 300 символов';
    return null;
  }

  return { start, end, purpose };
}

// --- ключ идемпотентности ---
// Генерируем ОДИН раз на попытку. При смене данных — новый ключ.
let idempotencyKey = newIdempotencyKey();
let lastPayloadHash = null;

function payloadHash(p) {
  return JSON.stringify({
    resource_id: resourceId,
    start: p.start.toISOString(),
    end: p.end.toISOString(),
    purpose: p.purpose,
  });
}

// --- отправка ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = validateForm();
  if (!payload) return;

  // Если данные изменились — это новая операция, новый ключ
  const hash = payloadHash(payload);
  if (hash !== lastPayloadHash) {
    idempotencyKey = newIdempotencyKey();
    lastPayloadHash = hash;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Отправка…';
  formErrorEl.textContent = '';

  const res = await api('/bookings', {
    method: 'POST',
    body: {
      resource_id: resourceId,
      start: payload.start.toISOString(),  // ISO с Z (UTC) — сервер поймёт
      end: payload.end.toISOString(),
      purpose: payload.purpose,
    },
    idempotencyKey,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Забронировать';

  if (res.ok) {
    showSuccess(res.data, payload);
    return;
  }

  // Сетевой сбой — форма сохранена, ключ тот же, можно повторить
  if (res.status === 0) {
    formErrorEl.textContent = 'Нет связи. Проверьте интернет и нажмите «Забронировать» снова — данные сохранены.';
    return;
  }

  // Конфликт времени — обновим интервалы
  if (res.status === 409 && res.data?.code === 'TIME_CONFLICT') {
    formErrorEl.textContent = 'Ресурс уже занят в выбранное время. Выберите другое.';
    loadAvailability();
    return;
  }

  if (res.status === 409 && res.data?.code === 'RESOURCE_DISABLED') {
    formErrorEl.textContent = 'Ресурс отключён для новых бронирований.';
    return;
  }

  formErrorEl.textContent = res.data?.message || 'Не удалось создать бронь';
});

function showSuccess(booking, payload) {
  form.hidden = true;
  successEl.hidden = false;

  const date = dateEl.value;
  const startStr = toMskTime(booking.start_time);
  const endStr = toMskTime(booking.end_time);

  successBodyEl.innerHTML = `
    <p><strong>Ресурс:</strong> ${escapeHtml(nameEl.textContent)}</p>
    <p><strong>Дата:</strong> ${escapeHtml(date)}</p>
    <p><strong>Время (МСК):</strong> ${startStr} — ${endStr}</p>
    <p><strong>Номер записи:</strong> ${booking.id}</p>
  `;
}

// --- события ---
dateEl.addEventListener('change', loadAvailability);

// --- старт ---
(async () => {
  dateEl.value = todayMsk();
  const ok = await loadResource();
  if (ok) await loadAvailability();
})();