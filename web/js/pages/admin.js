import { requireAuth, getUser, clearAuth } from '../auth.js';
import { api } from '../api.js';

requireAuth();

// --- шапка: сначала навешиваем «Выйти», потом проверяем роль ---
document.getElementById('logout').addEventListener('click', (e) => {
  e.preventDefault();
  clearAuth();
  location.href = '/login.html';
});

const user = getUser();
if (user) {
  document.getElementById('who').textContent = `${user.name} (${user.role})`;
}

// Если не админ — на каталог (сервер всё равно 403, но не показываем пустую админку)
if (user?.role !== 'admin') {
  location.href = '/index.html';
  throw new Error('not admin');
}

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
function fmtMskShort(iso) {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function fmtMskDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function setState(el, text, isError = false) {
  el.hidden = false;
  el.className = isError ? 'state error' : 'state';
  el.textContent = text;
}
function hideState(el) { el.hidden = true; }

// ==================== РЕСУРСЫ ====================

const resState = document.getElementById('resources-state');
const resList = document.getElementById('resources-list');
const resForm = document.getElementById('create-resource');
const resError = document.getElementById('r-error');
const resCreateBtn = document.getElementById('r-create-btn');

async function loadResources() {
  setState(resState, 'Загрузка…');
  resList.hidden = true;
  const res = await api('/admin/resources');
  if (!res.ok) {
    if (res.status === 0) setState(resState, 'Нет связи с сервером', true);
    else setState(resState, res.data?.message || 'Ошибка', true);
    return;
  }
  if (res.data.length === 0) {
    setState(resState, 'Ресурсов пока нет.');
    return;
  }
  hideState(resState);
  resList.hidden = false;
  resList.innerHTML = '';
  for (const r of res.data) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <h3>${escapeHtml(r.name)} ${r.is_active ? '' : '<span class="hint">(отключён)</span>'}</h3>
      <div class="meta">${escapeHtml(r.location)}</div>
      ${r.description ? `<div class="meta">${escapeHtml(r.description)}</div>` : ''}
      <div style="margin-top:8px;">
        <button class="${r.is_active ? 'danger' : 'secondary'}" data-toggle="${r.id}" data-active="${r.is_active}">
          ${r.is_active ? 'Отключить' : 'Включить'}
        </button>
      </div>
    `;
    resList.appendChild(div);
  }
  for (const btn of resList.querySelectorAll('button[data-toggle]')) {
    btn.addEventListener('click', onToggleResource);
  }
}

async function onToggleResource(e) {
  const btn = e.currentTarget;
  const id = Number(btn.dataset.toggle);
  const isActive = btn.dataset.active === 'true';
  const next = !isActive;

  if (!confirm(next ? 'Включить ресурс?' : 'Отключить ресурс? Новые брони создавать будет нельзя, существующие сохранятся.')) return;

  btn.disabled = true;
  const res = await api(`/admin/resources/${id}`, {
    method: 'PATCH',
    body: { is_active: next },
  });
  btn.disabled = false;

  if (!res.ok) {
    alert(res.data?.message || 'Не удалось изменить ресурс');
    return;
  }
  await loadResources();
  await loadResourceFilter();
}

resForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resError.textContent = '';

  const name = document.getElementById('r-name').value.trim();
  const location = document.getElementById('r-location').value.trim();
  const description = document.getElementById('r-description').value.trim();

  if (!name || !location) {
    resError.textContent = 'Название и локация обязательны';
    return;
  }

  resCreateBtn.disabled = true;
  resCreateBtn.textContent = 'Создание…';

  const res = await api('/admin/resources', {
    method: 'POST',
    body: { name, location, description: description || null },
  });

  resCreateBtn.disabled = false;
  resCreateBtn.textContent = 'Создать';

  if (!res.ok) {
    resError.textContent = res.data?.message || 'Не удалось создать ресурс';
    return;
  }

  resForm.reset();
  await loadResources();
  await loadResourceFilter();
});

// ==================== ВСЕ БРОНИ ====================

const bookState = document.getElementById('bookings-state');
const bookList = document.getElementById('bookings-list');
const fDate = document.getElementById('f-date');
const fResource = document.getElementById('f-resource');
const fStatus = document.getElementById('f-status');
const fApply = document.getElementById('f-apply');

async function loadResourceFilter() {
  const res = await api('/admin/resources');
  if (!res.ok) return;
  fResource.innerHTML = '<option value="">Все</option>';
  for (const r of res.data) {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    fResource.appendChild(opt);
  }
}

async function loadBookings() {
  setState(bookState, 'Загрузка…');
  bookList.hidden = true;

  const params = new URLSearchParams();
  if (fDate.value) params.set('date', fDate.value);
  if (fResource.value) params.set('resource_id', fResource.value);
  if (fStatus.value) params.set('status', fStatus.value);

  const res = await api(`/admin/bookings?${params.toString()}`);
  if (!res.ok) {
    if (res.status === 0) setState(bookState, 'Нет связи с сервером', true);
    else setState(bookState, res.data?.message || 'Ошибка', true);
    return;
  }
  if (res.data.length === 0) {
    setState(bookState, 'Ничего не найдено.');
    return;
  }
  hideState(bookState);
  bookList.hidden = false;
  bookList.innerHTML = '';
  for (const b of res.data) {
    const now = new Date();
    const started = new Date(b.start_time) <= now;
    const canCancel = b.status === 'Active' && !started;
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <h3>${escapeHtml(b.resource_name)}</h3>
      <div class="meta">${fmtMskDate(b.start_time)} ${fmtMskShort(b.start_time)} — ${fmtMskShort(b.end_time)} (МСК)</div>
      <div class="meta">Владелец: ${escapeHtml(b.owner_name)} (${escapeHtml(b.owner_login)})</div>
      <div class="meta">Цель: ${escapeHtml(b.purpose)}</div>
      <div class="meta">Статус: <strong>${b.status === 'Active' ? 'Активна' : 'Отменена'}</strong>${started && b.status === 'Active' ? ' (началась/завершена)' : ''}</div>
      ${b.cancel_reason ? `<div class="meta">Причина: ${escapeHtml(b.cancel_reason)}</div>` : ''}
      ${canCancel ? `<div style="margin-top:8px;"><button class="danger" data-cancel="${b.id}">Отменить с причиной</button></div>` : ''}
    `;
    bookList.appendChild(div);
  }
  for (const btn of bookList.querySelectorAll('button[data-cancel]')) {
    btn.addEventListener('click', onAdminCancel);
  }
}

async function onAdminCancel(e) {
  const btn = e.currentTarget;
  const id = Number(btn.dataset.cancel);
  const reason = prompt('Причина отмены (обязательно, до 300 символов):');
  if (reason === null) return;
  const trimmed = reason.trim();
  if (!trimmed) {
    alert('Причина обязательна');
    return;
  }
  if (trimmed.length > 300) {
    alert('Причина до 300 символов');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Отмена…';

  const res = await api(`/bookings/${id}/cancel`, {
    method: 'POST',
    body: { reason: trimmed },
  });

  if (!res.ok) {
    btn.disabled = false;
    btn.textContent = 'Отменить с причиной';
    if (res.status === 0) alert('Нет связи');
    else if (res.status === 409 && res.data?.code === 'ALREADY_STARTED') alert('Запись уже началась');
    else alert(res.data?.message || 'Не удалось отменить');
    return;
  }

  await loadBookings();
  await loadAudit();
}

fApply.addEventListener('click', loadBookings);

// ==================== АУДИТ ====================

const auditState = document.getElementById('audit-state');
const auditList = document.getElementById('audit-list');
const auditRefresh = document.getElementById('audit-refresh');

async function loadAudit() {
  setState(auditState, 'Загрузка…');
  auditList.hidden = true;
  const res = await api('/admin/audit?limit=100');
  if (!res.ok) {
    if (res.status === 0) setState(auditState, 'Нет связи с сервером', true);
    else setState(auditState, res.data?.message || 'Ошибка', true);
    return;
  }
  if (res.data.length === 0) {
    setState(auditState, 'Событий пока нет.');
    return;
  }
  hideState(auditState);
  auditList.hidden = false;
  auditList.innerHTML = '';
  for (const a of res.data) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="meta">${fmtMsk(a.occurred_at)} (МСК)</div>
      <div><strong>${escapeHtml(a.action)}</strong> · ${escapeHtml(a.object_type)}#${a.object_id ?? '—'} · ${escapeHtml(a.result)}</div>
      <div class="meta">Кто: ${a.actor_login ? escapeHtml(a.actor_login) : '—'} · traceId: ${escapeHtml(a.trace_id || '—')}</div>
    `;
    auditList.appendChild(div);
  }
}

auditRefresh.addEventListener('click', loadAudit);

// --- старт: параллельно, каждый блок сам отвечает за свои ошибки ---
loadResources();
loadResourceFilter();
loadBookings();
loadAudit();