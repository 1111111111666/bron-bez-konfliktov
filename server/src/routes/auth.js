import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, authRequired } from '../auth.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ code: 'VALIDATION', message: 'Укажите login и password' });
  }

  const result = await query(
    'SELECT id, name, login, password_hash, role FROM users WHERE login = $1',
    [login]
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ code: 'BAD_CREDENTIALS', message: 'Неверный логин или пароль' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ code: 'BAD_CREDENTIALS', message: 'Неверный логин или пароль' });
  }

  const token = signToken({ id: user.id, role: user.role });
  res.json({
    token,
    user: { id: user.id, name: user.name, login: user.login, role: user.role },
  });
});

// GET /api/auth/me — проверка, что токен валиден
authRouter.get('/me', authRequired, async (req, res) => {
  const result = await query('SELECT id, name, login, role FROM users WHERE id = $1', [req.user.sub]);
  if (!result.rows[0]) {
    return res.status(401).json({ code: 'USER_GONE', message: 'Пользователь не найден' });
  }
  res.json(result.rows[0]);
});