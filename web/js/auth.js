const TOKEN_KEY = 'bron_token';
const USER_KEY = 'bron_user';

export function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Если не залогинен — редирект на login.html с возвратом обратно */
export function requireAuth() {
  if (!getToken()) {
    const back = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?back=${back}`;
    return false;
  }
  return true;
}

/** Если залогинен — уводим с login.html на каталог */
export function redirectIfLoggedIn() {
  if (getToken()) {
    location.href = '/index.html';
  }
}