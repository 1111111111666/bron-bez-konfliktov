import { logger } from './logger.js';

/** Ожидаемая ошибка приложения — статус, код, сообщение */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Middleware: traceId на каждый запрос */
export function traceIdMiddleware(req, res, next) {
  req.traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
}

/** Финальный error-handler. Ставится ПОСЛЕДНИМ через app.use */
export function errorHandler(err, req, res, next) {
  // Приводим к единому виду
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  const traceId = req.traceId;

  // Логируем: 5xx — как error, 4xx — как warn (это не сбой сервера)
  const logData = {
    traceId,
    method: req.method,
    url: req.originalUrl,
    status,
    code,
    message: err.message,
    // стек только для 5xx, и только в dev
    stack: status >= 500 && process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  };
  if (status >= 500) logger.error(logData);
  else logger.warn(logData);

  // Клиенту не раскрываем детали 500
  const clientMessage = status >= 500
    ? 'Внутренняя ошибка сервера'
    : (err.message || 'Ошибка');

  res.status(status).json({ code, message: clientMessage, traceId });
}