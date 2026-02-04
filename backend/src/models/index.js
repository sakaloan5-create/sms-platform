const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// 数据库路径优先级：DATABASE_URL > FLY_IO > 本地默认
let dbPath;
if (process.env.DATABASE_URL) {
  // 支持 sqlite:/data/database.sqlite 格式
  dbPath = process.env.DATABASE_URL.replace(/^sqlite:\//, '/');
} else if (process.env.FLY_IO) {
  dbPath = '/data/database.sqlite';
} else {
  dbPath = path.join(__dirname, '../data/database.sqlite');
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

// Merchant Model
const Merchant = sequelize.define('Merchant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  phone: { type: DataTypes.STRING(50) },
  status: { type: DataTypes.ENUM('active', 'suspended', 'pending', 'inactive'), defaultValue: 'pending' },
  balance: { type: DataTypes.DECIMAL(15, 4), defaultValue: 0.00 },
  creditLimit: { type: DataTypes.DECIMAL(15, 4), defaultValue: 0.00 },
  defaultLanguage: { type: DataTypes.STRING(10), defaultValue: 'en' },
  timezone: { type: DataTypes.STRING(50), defaultValue: 'UTC' },
  role: { type: DataTypes.ENUM('merchant', 'admin', 'subaccount'), defaultValue: 'merchant' },
  apiKey: { type: DataTypes.STRING(255), unique: true },
  lastLoginAt: { type: DataTypes.DATE }
});

// Channel Model
const Channel = sequelize.define('Channel', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  provider: { type: DataTypes.STRING(50), allowNull: false },
  type: { type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'), allowNull: false },
  config: { type: DataTypes.JSON, defaultValue: {} },
  status: { type: DataTypes.ENUM('active', 'inactive', 'maintenance'), defaultValue: 'active' },
  basePrice: { type: DataTypes.DECIMAL(10, 6), defaultValue: 0.05 }
});

// Message Model
const Message = sequelize.define('Message', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  channelId: { type: DataTypes.UUID },
  to: { type: DataTypes.STRING(50), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'), defaultValue: 'sms' },
  segments: { type: DataTypes.INTEGER, defaultValue: 1 },
  cost: { type: DataTypes.DECIMAL(10, 6) },
  currency: { type: DataTypes.STRING(3), defaultValue: 'USD' },
  status: { type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed'), defaultValue: 'pending' },
  sentAt: { type: DataTypes.DATE },
  deliveredAt: { type: DataTypes.DATE },
  externalId: { type: DataTypes.STRING(255) },
  errorCode: { type: DataTypes.STRING(50) },
  errorMessage: { type: DataTypes.TEXT },
  callbackUrl: { type: DataTypes.STRING(500) }
});

// Transaction Model
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.ENUM('recharge', 'debit', 'refund', 'credit'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 4), allowNull: false },
  balance: { type: DataTypes.DECIMAL(15, 4), allowNull: false },
  description: { type: DataTypes.TEXT },
  referenceId: { type: DataTypes.STRING(255) },
  status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), defaultValue: 'completed' }
});

// Template Model
const Template = sequelize.define('Template', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'), defaultValue: 'sms' },
  variables: { type: DataTypes.JSON, defaultValue: [] },
  category: { type: DataTypes.STRING(50) },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

// ApiKey Model
const ApiKey = sequelize.define('ApiKey', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  permissions: { type: DataTypes.JSON, defaultValue: ['send', 'read'] },
  lastUsedAt: { type: DataTypes.DATE },
  expiresAt: { type: DataTypes.DATE },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

// SubAccount Model
const SubAccount = sequelize.define('SubAccount', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  permissions: { type: DataTypes.JSON, defaultValue: [] },
  status: { type: DataTypes.ENUM('active', 'inactive', 'suspended'), defaultValue: 'active' },
  lastLoginAt: { type: DataTypes.DATE }
});

// ScheduledMessage Model
const ScheduledMessage = sequelize.define('ScheduledMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  recipients: { type: DataTypes.JSON, allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'), defaultValue: 'sms' },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  templateId: { type: DataTypes.UUID },
  status: { type: DataTypes.ENUM('pending', 'processing', 'completed', 'cancelled', 'failed'), defaultValue: 'pending' },
  processedAt: { type: DataTypes.DATE },
  result: { type: DataTypes.JSON }
});

// Blacklist Model
const Blacklist = sequelize.define('Blacklist', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID },
  type: { type: DataTypes.ENUM('global', 'merchant'), defaultValue: 'merchant' },
  phone: { type: DataTypes.STRING(50) },
  word: { type: DataTypes.STRING(255) },
  reason: { type: DataTypes.TEXT },
  blockedBy: { type: DataTypes.UUID, allowNull: false }
});

// DailyStats Model - 每日统计数据
const DailyStats = sequelize.define('DailyStats', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  totalSent: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalDelivered: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalFailed: { type: DataTypes.INTEGER, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(15, 4), defaultValue: 0 },
  byType: { type: DataTypes.JSON, defaultValue: {} },
  byChannel: { type: DataTypes.JSON, defaultValue: {} }
});

// Relations
Merchant.hasMany(Message, { foreignKey: 'merchantId' });
Message.belongsTo(Merchant, { foreignKey: 'merchantId' });
Merchant.hasMany(Transaction, { foreignKey: 'merchantId' });
Transaction.belongsTo(Merchant, { foreignKey: 'merchantId' });
Merchant.hasMany(Template, { foreignKey: 'merchantId' });
Template.belongsTo(Merchant, { foreignKey: 'merchantId' });
Merchant.hasMany(ApiKey, { foreignKey: 'merchantId' });
ApiKey.belongsTo(Merchant, { foreignKey: 'merchantId' });
Merchant.hasMany(SubAccount, { foreignKey: 'merchantId' });
SubAccount.belongsTo(Merchant, { foreignKey: 'merchantId' });
Merchant.hasMany(ScheduledMessage, { foreignKey: 'merchantId' });
ScheduledMessage.belongsTo(Merchant, { foreignKey: 'merchantId' });
Channel.hasMany(Message, { foreignKey: 'channelId' });
Message.belongsTo(Channel, { foreignKey: 'channelId' });

module.exports = { sequelize, Merchant, Channel, Message, Transaction, Template, ApiKey, SubAccount, ScheduledMessage, Blacklist, DailyStats };
