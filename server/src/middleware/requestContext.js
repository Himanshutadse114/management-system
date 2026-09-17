const crypto = require('crypto');

function safeRequestId(value) {
  const candidate = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,120}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function requestContext(req, res, next) {
  const requestId = safeRequestId(req.header('x-request-id'));
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'test') return;
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const event = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      status: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(1)),
      userId: req.userId || null,
      ip: req.ip || null,
      timestamp: new Date().toISOString()
    };
    console.log(JSON.stringify(event));
  });

  next();
}

module.exports = { requestContext, safeRequestId };
