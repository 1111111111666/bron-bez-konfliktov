import { requireAuth, getUser, clearAuth } from '../auth.js';
import { api } from '../api.js';

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

// --- элементы ---
const stateEl = document.getElementById('state');
const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh');

// --- утилиты ---
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function fmtMsk(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Вычисляем «эффективный» статус:
// - Cancelled → «Отменена»
// - Active + end_time <= now → «Завершена»
// - Active + start_time <= now < end_time → «Идёт»
// - Active + start_time > now → «Активна»
function effectiveStatus(b) {
  if (b.status === 'Cancelled') return 'cancelled';
  const now = new Date();
  const start = new Date(b.start_time);
  const end = new Date(b.end_time);
  if (end <= now) return 'finished';
  if (start <= now) return 'ongoing';
  return 'active';
}

function statusLabel(s) {
  switch (s) {
    case 'active': return 'Активна';
    case 'ongoing': return 'Идёт';
    case 'finished': return 'Завершена';
    case 'cancelled': return 'Отменена';
    default: return s;
  }
}

// --- состояния ---
function showLoading() {
  listEl.hidden = true;
  stateEl.hidden = false;
  stateEl.className = 'state';
  stateEl.textContent = 'Загрузка…';
}
function showEmpty() {
  listEl.hidden = true;
  stateEl.hidden = false;
  stateEl.className = 'state';
  stateEl.textContent = 'У вас пока нет бронирований.';
}
function showError(msg) {
  listEl.hidden = true;
  stateEl.hidden = false;
  stateEl.className = 'state error';
  stateEl.textContent = msg;
}

// --- рендер ---
function render(items) {
  if (items.length === 0) { showEmpty(); return; }
  stateEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';

  for (const b of items) {
    const st = effectiveStatus(b);
    const canCancel = st === 'active';           // отменить можно только будущую активную
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <h3>${escapeHtml(b.resource_name)}</h3>
      <div class="meta">${fmtMsk(b.start_time)} — ${fmtMsk(b.end_time)} (МСК)</div>
      <div class="meta">Цель: ${escapeHtml(b.purpose)}</div>
      <div class="meta">Статус: <strong>${statusLabel(st)}</strong></div>
      ${b.cancel_reason ? `<div class="meta">Причина отмены: ${escapeHtml(b.cancel_reason)}</div>` : ''}
      <div style="margin-top:8px;">
        ${canCancel
          ? `<button class="danger" data-cancel="${b.id}">Отменить</button>`
          : ''}
      </div>
    `;
    listEl.appendChild(div);
  }

  // обработчики отмены
  for (const btn of listEl.querySelectorAll('button[data-cancel]')) {
    btn.addEventListener('click', onCancelClick);
  }
}

// --- отмена ---
async function onCancelClick(e) {
  const btn = e.currentTarget;
  const id = Number(btn.dataset.cancel);
  if (!id) return;

  if (!confirm('Отменить эту бронь? Действие нельзя отменить.')) return;

  btn.disabled = true;
  btn.textContent = 'Отмена…';

  const res = await api(`/bookings/${id}/cancel`, { method: 'POST', body: {} });

  if (!res.ok) {
    if (res.status === 0) {
      alert('Нет связи с сервером. Повторите позже.');
    } else if (res.status === 409 && res.data?.code === 'ALREADY_STARTED') {
      alert('Нельзя отменить начавшуюся или завершённую запись.');
    } else {
      alert(res.data?.message || 'Не удалось отменить бронь');
    }
    btn.disabled = false;
    btn.textContent = 'Отменить';
    return;
  }

  // успешно — перезагружаем список
  await load();
}

// --- фильтр ---
function matchesFilter(b, filter) {
  if (!filter) return true;
  const st = effectiveStatus(b);
  if (filter === 'active') return st === 'active' || st === 'ongoing';
  if (filter === 'cancelled') return st === 'cancelled';
  if (filter === 'finished') return st === 'finished';
  return true;
}

// --- загрузка ---
let allItems = [];

async function load() {
  showLoading();
  const res = await api('/bookings/my');
  if (!res.ok) {
    if (res.status === 0) showError('Нет связи с сервером. Проверьте интернет и повторите.');
    else showError(res.data?.message || 'Не удалось загрузить бронирования');
    return;
  }
  allItems = res.data;
  const filtered = allItems.filter(b => matchesFilter(b, statusEl.value));
  render(filtered);
}

statusEl.addEventListener('change', () => {
  const filtered = allItems.filter(b => matchesFilter(b, statusEl.value));
  render(filtered);
});
refreshBtn.addEventListener('click', load);

// --- старт ---
load();