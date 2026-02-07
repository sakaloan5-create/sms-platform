/**
 * SMS Platform - 更新版 app.js
 * 整合新服务: Providers, MessageService, Monitoring
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const i18next = require('i18next');
const i18nextHttpMiddleware = require('i18next-http-middleware');
const geoip = require('geoip-lite');
const path = require('path');

const { sequelize } = require('./models');
const logger = require('./utils/logger');
const { initAdmin } = require('./utils/init');

// 导入服务
const providerFactory = require('./providers/provider.factory');
const messageService = require('./services/message.service');
const monitoringService = require('./services/monitoring.service');

// 导入路由
const authRoutes = require('./routes/auth.routes');
const merchantRoutes = require('./routes/merchant.routes');
const adminRoutes = require('./routes/admin.routes');
const messageRoutes = require('./routes/message.routes');
const channelRoutes = require('./routes/channel.routes');
const templateRoutes = require('./routes/template.routes');
const apiKeyRoutes = require('./routes/apikey.routes');
const subaccountRoutes = require('./routes/subaccount.routes');
const reportRoutes = require('./routes/report.routes');
const scheduledRoutes = require('./routes/scheduled.routes');
const blacklistRoutes = require('./routes/blacklist.routes');
const webhookRoutes = require('./routes/webhook.routes');
const rcsRoutes = require('./routes/rcs.routes');

const { errorHandler } = require('./middleware/error.middleware');
const { authenticate } = require('./middleware/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 国际化配置
// ==========================================
i18next.use(i18nextHttpMiddleware.LanguageDetector).init({
  fallbackLng: 'en',
  resources: {
    en: { translation: require('./locales/en.json') },
    zh: { translation: require('./locales/zh.json') },
    es: { translation: require('./locales/es.json') },
    pt: { translation: require('./locales/pt.json') }
  },
  detection: {
    order: ['querystring', 'cookie', 'header', 'ip'],
    lookupQuerystring: 'lng',
    lookupCookie: 'i18next',
    lookupHeader: 'accept-language',
    caches: ['cookie']
  }
});

// ==========================================
// 安全中间件
// ==========================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

// CORS 配置
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 速率限制
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// 更严格的 API 限流
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60, // 60次/分钟
  message: { error: 'API rate limit exceeded.' }
});
app.use('/api/', apiLimiter);

// ==========================================
// 请求解析
// ==========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// i18n 中间件
app.use(i18nextHttpMiddleware.handle(i18next));

// ==========================================
// IP 语言检测 (商户路由)
// ==========================================
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

// ==========================================
// 路由注册
// ==========================================
// 公开路由
app.use('/api/auth', authRoutes);

// Webhook 路由 (需要验证签名但不需要 JWT)
app.use('/api/webhooks', webhookRoutes);

// 受保护路由
app.use('/api/merchant', authenticate, merchantRoutes);
app.use('/api/messages', authenticate, messageRoutes);
app.use('/api/channels', authenticate, channelRoutes);
app.use('/api/templates', authenticate, templateRoutes);
app.use('/api/apikeys', authenticate, apiKeyRoutes);
app.use('/api/subaccounts', authenticate, subaccountRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/scheduled', authenticate, scheduledRoutes);
app.use('/api/blacklist', authenticate, blacklistRoutes);
app.use('/api/rcs', authenticate, rcsRoutes);

// 管理员路由
app.use('/api/admin', authenticate, adminRoutes);

// ==========================================
// 静态文件 (开发环境)
// ==========================================
if (process.env.NODE_ENV === 'development') {
  app.use('/admin-dashboard', express.static(path.join(__dirname, '../../admin-dashboard')));
  app.use('/merchant-dashboard', express.static(path.join(__dirname, '../../merchant-dashboard')));
}

// ==========================================
// 健康检查
// ==========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// ==========================================
// 错误处理
// ==========================================
app.use(errorHandler);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ==========================================
// 启动服务器
// ==========================================
async function startServer() {
  try {
    // 数据库连接
    await sequelize.authenticate();
    logger.info('Database connected successfully.');

    // 同步模型 (开发环境)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized.');
    }

    // 初始化管理员账号
    await initAdmin();

    // 启动监控服务
    monitoringService.start();
    logger.info('Monitoring service started.');

    // 启动 HTTP 服务器
    app.listen(PORT, () => {
      logger.info(`SMS Platform API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  monitoringService.stop();
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  monitoringService.stop();
  await sequelize.close();
  process.exit(0);
});

// 启动
startServer();

module.exports = app;
