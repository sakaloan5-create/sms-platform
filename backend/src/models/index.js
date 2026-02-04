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
  to: { type: DataTypes.STRING(50), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'), defaultValue: 'sms' },
  segments: { type: DataTypes.INTEGER, defaultValue: 1 },
  cost: { type: DataTypes.DECIMAL(10, 6) },
  status: { type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed'), defaultValue: 'pending' },
  sentAt: { type: DataTypes.DATE },
  deliveredAt: { type: DataTypes.DATE }
});

// Transaction Model
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  merchantId: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.ENUM('recharge', 'debit', 'refund'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 4), allowNull: false },
  balance: { type: DataTypes.DECIMAL(15, 4), allowNull: false },
  description: { type: DataTypes.TEXT },
  referenceId: { type: DataTypes.STRING(255) }
});

// Relations
Merchant.hasMany(Message, { foreignKey: 'merchantId' });
Message.belongsTo(Merchant, { foreignKey: 'merchantId' });
Merchant.hasMany(Transaction, { foreignKey: 'merchantId' });
Transaction.belongsTo(Merchant, { foreignKey: 'merchantId' });

module.exports = { sequelize, Merchant, Channel, Message, Transaction };
