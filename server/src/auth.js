import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET не задан в .env');

/** Выдать токен на 1 час. sub = id пользователя, role = 'user' | 'admin' */
export function signToken({ id, role }) {
  return jwt.sign({ sub: id, role }, SECRET, { expiresIn: '1h' });
}

/** Достать токен из Authorization: Bearer <token> */
function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/** Требует валидный JWT. Кладёт req.user = { sub, role } */
export function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ code: 'NO_TOKEN', message: 'Требуется вход' });
  }
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { sub: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ code: 'BAD_TOKEN', message: 'Токен недействителен или истёк' });
  }
}

/** Требует роль admin. Ставить после authRequired */
export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Доступ только для администратора' });
  }
  next();
}