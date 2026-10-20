import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // В разработке — человекочитаемо; в проде — JSON (по умолчанию)
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  redact: {
    // Никогда не логируем эти поля
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
    ],
    censor: '[REDACTED]',
  },
});