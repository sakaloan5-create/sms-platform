require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const i18next = require('i18next');
const i18nextHttpMiddleware = require('i18next-http-middleware');
const geoip = require('geoip-lite');

const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');
const authRoutes = require('./src/routes/auth.routes');
const merchantRoutes = require('./src/routes/merchant.routes');
const adminRoutes = require('./src/routes/admin.routes');
const messageRoutes = require('./src/routes/message.routes');
const channelRoutes = require('./src/routes/channel.routes');
const { errorHandler } = require('./src/middleware/error.middleware');
const { authenticate } = require('./src/middleware/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// i18n configuration
i18next.use(i18nextHttpMiddleware.LanguageDetector).init({
  fallbackLng: 'en',
  resources: {
    en: { translation: require('./src/locales/en.json') },
    zh: { translation: require('./src/locales/zh.json') },
    es: { translation: require('./src/locales/es.json') },
    pt: { translation: require('./src/locales/pt.json') }
  },
  detection: {
    order: ['querystring', 'cookie', 'header', 'ip'],
    lookupQuerystring: 'lng',
    lookupCookie: 'i18next',
    lookupHeader: 'accept-language',
    caches: ['cookie']
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// i18n middleware
app.use(i18nextHttpMiddleware.handle(i18next));

// IP-based language detection for merchant routes
app.use('/api/merchant', (req, res, next) => {
  if (!req.query.lng && !req.cookies.i18next) {
    const geo = geoip.lookup(req.ip);
    const countryLangMap = {
      'CN': 'zh', 'TW': 'zh', 'HK': 'zh',
      'US': 'en', 'GB': 'en', 'AU': 'en', 'CA': 'en',
      'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'CL': 'es', 'PE': 'es',
      'BR': 'pt', 'PT': 'pt', 'AO': 'pt', 'MZ': 'pt'
    };
    if (geo && countryLangMap[geo.country]) {
      req.language = countryLangMap[geo.country];
    }
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', authenticate, merchantRoutes);
app.use('/api/admin', authenticate, adminRoutes);
app.use('/api/messages', authenticate, messageRoutes);
app.use('/api/channels', authenticate, channelRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Database connection and server start
async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected successfully.');
    
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database models synchronized.');
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
