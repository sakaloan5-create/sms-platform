const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://localhost:5432/sms_platform',
  {
    logging: process.env.NODE_ENV === 'development' ? logger.debug : false,
    dialect: 'postgres',
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Merchant Model
const Merchant = sequelize.define('Merchant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(50)
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'pending', 'inactive'),
    defaultValue: 'pending'
  },
  balance: {
    type: DataTypes.DECIMAL(15, 4),
    defaultValue: 0.00
  },
  creditLimit: {
    type: DataTypes.DECIMAL(15, 4),
    defaultValue: 0.00,
    field: 'credit_limit'
  },
  defaultLanguage: {
    type: DataTypes.STRING(10),
    defaultValue: 'en',
    field: 'default_language'
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'UTC'
  },
  role: {
    type: DataTypes.ENUM('merchant', 'admin', 'subaccount'),
    defaultValue: 'merchant'
  },
  parentId: {
    type: DataTypes.UUID,
    field: 'parent_id',
    references: {
      model: 'merchants',
      key: 'id'
    }
  },
  apiKey: {
    type: DataTypes.STRING(255),
    field: 'api_key',
    unique: true
  },
  apiSecret: {
    type: DataTypes.STRING(255),
    field: 'api_secret'
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    field: 'last_login_at'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'merchants',
  timestamps: true,
  underscored: true
});

// Channel Model
const Channel = sequelize.define('Channel', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'),
    allowNull: false
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'degraded'),
    defaultValue: 'active'
  },
  successRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 99.00,
    field: 'success_rate'
  },
  avgLatencyMs: {
    type: DataTypes.INTEGER,
    defaultValue: 500,
    field: 'avg_latency_ms'
  },
  lastCheckAt: {
    type: DataTypes.DATE,
    field: 'last_check_at'
  },
  countries: {
    type: DataTypes.ARRAY(DataTypes.STRING(10)),
    defaultValue: []
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'channels',
  timestamps: true,
  underscored: true
});

// Pricing Plan Model
const PricingPlan = sequelize.define('PricingPlan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100)
  },
  merchantId: {
    type: DataTypes.UUID,
    field: 'merchant_id',
    references: {
      model: 'merchants',
      key: 'id'
    }
  },
  countryCode: {
    type: DataTypes.STRING(10),
    field: 'country_code'
  },
  channelType: {
    type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'),
    field: 'channel_type'
  },
  pricePerSms: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    field: 'price_per_sms'
  },
  pricePerRcs: {
    type: DataTypes.DECIMAL(10, 6),
    field: 'price_per_rcs'
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD'
  },
  effectiveDate: {
    type: DataTypes.DATE,
    field: 'effective_date'
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'pricing_plans',
  timestamps: true,
  underscored: true
});

// Merchant Channel Assignment Model
const MerchantChannel = sequelize.define('MerchantChannel', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  merchantId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'merchant_id',
    references: {
      model: 'merchants',
      key: 'id'
    }
  },
  channelId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'channel_id',
    references: {
      model: 'channels',
      key: 'id'
    }
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'merchant_channels',
  timestamps: true,
  underscored: true
});

// Message Model
const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  merchantId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'merchant_id',
    references: {
      model: 'merchants',
      key: 'id'
    }
  },
  channelId: {
    type: DataTypes.UUID,
    field: 'channel_id',
    references: {
      model: 'channels',
      key: 'id'
    }
  },
  externalId: {
    type: DataTypes.STRING(255),
    field: 'external_id'
  },
  phoneNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'phone_number'
  },
  countryCode: {
    type: DataTypes.STRING(10),
    field: 'country_code'
  },
  messageType: {
    type: DataTypes.ENUM('sms', 'rcs', 'whatsapp'),
    allowNull: false,
    field: 'message_type'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  contentLength: {
    type: DataTypes.INTEGER,
    field: 'content_length'
  },
  segments: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  encoding: {
    type: DataTypes.ENUM('GSM-7', 'UCS-2')
  },
  cost: {
    type: DataTypes.DECIMAL(10, 6)
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD'
  },
  status: {
    type: DataTypes.ENUM('pending', 'queued', 'sent', 'delivered', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  errorCode: {
    type: DataTypes.STRING(50),
    field: 'error_code'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    field: 'error_message'
  },
  sentAt: {
    type: DataTypes.DATE,
    field: 'sent_at'
  },
  deliveredAt: {
    type: DataTypes.DATE,
    field: 'delivered_at'
  },
  callbackUrl: {
    type: DataTypes.STRING(500),
    field: 'callback_url'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'messages',
  timestamps: true,
  underscored: true
});

// Transaction Model
const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  merchantId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'merchant_id',
    references: {
      model: 'merchants',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('recharge', 'deduction', 'refund', 'adjustment', 'bonus'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: false
  },
  balanceAfter: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: false,
    field: 'balance_after'
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD'
  },
  description: {
    type: DataTypes.TEXT
  },
  referenceId: {
    type: DataTypes.STRING(255),
    field: 'reference_id'
  },
  referenceType: {
    type: DataTypes.STRING(50),
    field: 'reference_type'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    field: 'created_by'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'transactions',
  timestamps: true,
  underscored: true
});

// Audit Log Model
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    field: 'user_id'
  },
  userType: {
    type: DataTypes.ENUM('admin', 'merchant', 'subaccount'),
    field: 'user_type'
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  resourceType: {
    type: DataTypes.STRING(50),
    field: 'resource_type'
  },
  resourceId: {
    type: DataTypes.UUID,
    field: 'resource_id'
  },
  oldValue: {
    type: DataTypes.JSONB,
    field: 'old_value'
  },
  newValue: {
    type: DataTypes.JSONB,
    field: 'new_value'
  },
  ipAddress: {
    type: DataTypes.INET,
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.TEXT,
    field: 'user_agent'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  underscored: true
});

// Associations
Merchant.hasMany(Merchant, { as: 'SubAccounts', foreignKey: 'parentId' });
Merchant.belongsTo(Merchant, { as: 'Parent', foreignKey: 'parentId' });

Merchant.hasMany(Message, { foreignKey: 'merchantId' });
Message.belongsTo(Merchant, { foreignKey: 'merchantId' });

Merchant.hasMany(Transaction, { foreignKey: 'merchantId' });
Transaction.belongsTo(Merchant, { foreignKey: 'merchantId' });

Merchant.belongsToMany(Channel, { through: MerchantChannel, foreignKey: 'merchantId' });
Channel.belongsToMany(Merchant, { through: MerchantChannel, foreignKey: 'channelId' });

Message.belongsTo(Channel, { foreignKey: 'channelId' });
Channel.hasMany(Message, { foreignKey: 'channelId' });

module.exports = {
  sequelize,
  Merchant,
  Channel,
  PricingPlan,
  MerchantChannel,
  Message,
  Transaction,
  AuditLog
};
