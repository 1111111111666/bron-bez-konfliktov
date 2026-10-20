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
const searchEl = document.getElementById('search');
const locationEl = document.getElementById('location');

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
  stateEl.textContent = 'Ничего не найдено. Измените поиск или фильтр.';
}
function showError(msg) {
  listEl.hidden = true;
  stateEl.hidden = false;
  stateEl.className = 'state error';
  stateEl.textContent = msg;
}
function showList(items) {
  stateEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';
  for (const r of items) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <h3><a href="/resource.html?id=${r.id}">${escapeHtml(r.name)}</a></h3>
      <div class="meta">${escapeHtml(r.location)}</div>
      ${r.description ? `<div class="meta">${escapeHtml(r.description)}</div>` : ''}
    `;
    listEl.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// --- загрузка ---
async function loadLocations() {
  // Собираем уникальные локации из всех активных ресурсов один раз
  const res = await api('/resources');
  if (!res.ok) return;
  const locations = [...new Set(res.data.map(r => r.location))].sort();
  for (const loc of locations) {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    locationEl.appendChild(opt);
  }
}

let currentController = null;

async function load() {
  showLoading();

  // Отменяем предыдущий запрос, если пользователь быстро меняет фильтр
  if (currentController) currentController.abort();
  currentController = new AbortController();

  const params = new URLSearchParams();
  const search = searchEl.value.trim();
  const location = locationEl.value;
  if (search) params.set('search', search);
  if (location) params.set('location', location);

  const res = await api(`/resources?${params.toString()}`, {
    signal: currentController.signal,
  });

  // Если запрос отменён — не трогаем DOM
  if (res.data?.code === 'NETWORK' && res.status === 0) {
    // проверяем, не abort ли это
    // (fetch при abort тоже кидает, но api.js превращает в status 0)
  }

  if (!res.ok) {
    if (res.status === 0) showError('Нет связи с сервером. Проверьте интернет и повторите.');
    else showError(res.data?.message || 'Не удалось загрузить каталог');
    return;
  }

  if (res.data.length === 0) showEmpty();
  else showList(res.data);
}

// --- debounce для поиска ---
let searchTimer = null;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
});
locationEl.addEventListener('change', load);

// --- старт ---
loadLocations();
load();