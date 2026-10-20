import { api } from '../api.js';
import { saveAuth, redirectIfLoggedIn } from '../auth.js';

// Если уже вошли — на каталог
redirectIfLoggedIn();

const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');
const submitBtn = document.getElementById('submit');

function showError(msg) {
  errorEl.textContent = msg || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');

  const login = form.login.value.trim();
  const password = form.password.value;

  if (!login || !password) {
    showError('Введите логин и пароль');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Вход…';

  const res = await api('/auth/login', {
    method: 'POST',
    body: { login, password },
  });

  if (!res.ok) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Войти';
    // 401 здесь не обрабатывается api.js (он только для защищённых маршрутов),
    // поэтому покажем понятное сообщение
    if (res.status === 401) showError('Неверный логин или пароль');
    else if (res.status === 0) showError('Нет связи с сервером. Попробуйте ещё раз.');
    else showError(res.data?.message || 'Не удалось войти');
    return;
  }

  saveAuth(res.data.token, res.data.user);

  // Куда вернуться после входа
  const params = new URLSearchParams(location.search);
  const back = params.get('back') || '/index.html';
  location.href = back;
});