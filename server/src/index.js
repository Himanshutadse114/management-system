require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDatabase } = require('./config/database');

const app = express();
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const configuredOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (isProduction) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error('Production requires GOOGLE_CLIENT_ID.');
  if (!process.env.SUPER_ADMIN_EMAIL) throw new Error('Production requires SUPER_ADMIN_EMAIL.');
  if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).length < 32) {
    throw new Error('Production requires a strong JWT_SECRET (32+ characters).');
  }
  if (!configuredOrigins.length || configuredOrigins.includes('*')) {
    throw new Error('Production requires an explicit CORS_ORIGIN allowlist.');
  }
}

let ownOrigin = null;
try {
  if (process.env.RENDER_EXTERNAL_URL) ownOrigin = new URL(process.env.RENDER_EXTERNAL_URL).origin;
} catch (_) {}

const allowedOrigins = new Set(configuredOrigins);
if (ownOrigin) allowedOrigins.add(ownOrigin);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || (!isProduction && configuredOrigins.length === 0) || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS.'));
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.get(['/health', '/api', '/api/'], (_req, res) => {
  res.json({
    service: 'management-system-backend',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/platform', require('./routes/platform'));
app.use('/api/tenants', require('./routes/tenants'));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.', code: 'NOT_FOUND' });
});

app.use((error, _req, res, _next) => {
  console.error('[api]', error);
  const status = Number(error.status || 500);
  res.status(status).json({
    message: status >= 500 ? 'Unexpected server error.' : error.message,
    code: error.code || 'SERVER_ERROR'
  });
});

const port = Number(process.env.PORT || 5001);

connectDatabase()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`[server] listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error('[server] startup failed:', error);
    process.exit(1);
  });

module.exports = app;
