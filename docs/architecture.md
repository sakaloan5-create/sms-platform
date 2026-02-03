# 全球 SMS/RCS 双后台系统架构设计

## 1. 系统概述

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        接入层                                │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│   │  REST API │  │ WebSocket│  │ Webhooks │                 │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
└────────┼─────────────┼─────────────┼───────────────────────┘
         │             │             │
         └─────────────┴─────────────┘
                       │
┌──────────────────────┼──────────────────────────────────────┐
│                  业务服务层                                  │
│  ┌───────────────────┴───────────────────────────────────┐  │
│  │                    API Gateway                        │  │
│  │         (认证/限流/路由/负载均衡)                       │  │
│  └───────────────────┬───────────────────────────────────┘  │
│                      │                                      │
│  ┌───────────────────┼───────────────────────────────────┐  │
│  │                   核心服务                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │  Auth服务   │  │ 计费服务    │  │ 消息服务    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │ 通道服务    │  │ 商户服务    │  │ 日志服务    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │                           │
         └───────────┬───────────────┘
                     │
┌────────────────────┼───────────────────────────────────────┐
│                 数据层                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PostgreSQL   │  │    Redis     │  │ ClickHouse   │      │
│  │ (主数据库)   │  │   (缓存)     │  │  (日志分析)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
         │
┌────────┴───────────────────────────────────────────────────┐
│                   外部通道层                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Twilio   │ │ Vonage   │ │ Zenvia   │ │ 其他     │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 双后台架构

```
┌─────────────────────────────────────────────────────────────┐
│                    管理后台 (Admin)                         │
│  - 默认语言: 中文                                            │
│  - 功能: 商户管理、通道配置、系统设置、财务报表、审计日志    │
│  - 角色: 超级管理员、运营人员、财务人员、技术支持           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 数据同步 (WebSocket + API)
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    商户后台 (Merchant)                      │
│  - 多语言: 中/英/西/葡 (IP自动识别 + 手动切换)              │
│  - 功能: 余额管理、发送消息、查看报表、API密钥、子账号      │
│  - 角色: 商户主账号、子账号(受限权限)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 数据库设计

### 2.1 核心表结构

```sql
-- 用户/商户表
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, pending
    balance DECIMAL(15, 4) DEFAULT 0.00,
    credit_limit DECIMAL(15, 4) DEFAULT 0.00,
    default_language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 子账号表
CREATE TABLE sub_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50), -- admin, operator, viewer
    permissions JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 价格体系表
CREATE TABLE pricing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    merchant_id UUID REFERENCES merchants(id), -- NULL表示默认价格
    country_code VARCHAR(10),
    channel_type VARCHAR(20), -- sms, rcs
    price_per_sms DECIMAL(10, 6) NOT NULL,
    price_per_rcs DECIMAL(10, 6),
    currency VARCHAR(3) DEFAULT 'USD',
    effective_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 通道配置表
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- twilio, vonage, zenvia, etc.
    type VARCHAR(20) NOT NULL, -- sms, rcs
    config JSONB NOT NULL, -- API密钥、回调URL等
    priority INTEGER DEFAULT 100,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, maintenance
    success_rate DECIMAL(5, 2) DEFAULT 99.00,
    avg_latency_ms INTEGER DEFAULT 500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 商户-通道分配表
CREATE TABLE merchant_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id),
    channel_id UUID REFERENCES channels(id),
    priority INTEGER DEFAULT 100,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 交易记录表
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id),
    type VARCHAR(50) NOT NULL, -- recharge, deduction, refund, adjustment
    amount DECIMAL(15, 4) NOT NULL,
    balance_after DECIMAL(15, 4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    reference_id VARCHAR(255), -- 关联消息ID或充值订单ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息发送记录表
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id),
    channel_id UUID REFERENCES channels(id),
    external_id VARCHAR(255), -- 通道返回的ID
    phone_number VARCHAR(50) NOT NULL,
    country_code VARCHAR(10),
    message_type VARCHAR(20) NOT NULL, -- sms, rcs
    content TEXT NOT NULL,
    content_length INTEGER,
    segments INTEGER DEFAULT 1, -- 短信分片数
    cost DECIMAL(10, 6),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, failed
    error_code VARCHAR(50),
    error_message TEXT,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 审计日志表
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_type VARCHAR(20), -- admin, merchant, sub_account
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50), -- merchant, channel, pricing, etc.
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 系统配置表
CREATE TABLE system_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID
);
```

### 2.2 索引设计

```sql
-- 常用查询索引
CREATE INDEX idx_merchants_email ON merchants(email);
CREATE INDEX idx_merchants_status ON merchants(status);
CREATE INDEX idx_messages_merchant_created ON messages(merchant_id, created_at);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_phone ON messages(phone_number);
CREATE INDEX idx_transactions_merchant ON transactions(merchant_id, created_at);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_pricing_merchant_country ON pricing_plans(merchant_id, country_code);
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

---

## 3. API 设计

### 3.1 核心 API 列表

#### 认证相关
```
POST /api/v1/auth/login          # 登录
POST /api/v1/auth/logout         # 登出
POST /api/v1/auth/refresh        # 刷新Token
GET  /api/v1/auth/me             # 获取当前用户信息
```

#### 商户管理 (Admin)
```
GET    /api/v1/admin/merchants              # 商户列表
POST   /api/v1/admin/merchants              # 创建商户
GET    /api/v1/admin/merchants/:id          # 商户详情
PUT    /api/v1/admin/merchants/:id          # 更新商户
DELETE /api/v1/admin/merchants/:id          # 删除商户
POST   /api/v1/admin/merchants/:id/recharge # 余额充值
PUT    /api/v1/admin/merchants/:id/pricing  # 设置独立价格
```

#### 通道管理 (Admin)
```
GET    /api/v1/admin/channels              # 通道列表
POST   /api/v1/admin/channels              # 创建通道
PUT    /api/v1/admin/channels/:id          # 更新通道
DELETE /api/v1/admin/channels/:id          # 删除通道
POST   /api/v1/admin/channels/:id/assign   # 分配给商户
GET    /api/v1/admin/channels/:id/stats    # 通道统计
```

#### 商户后台 (Merchant)
```
GET    /api/v1/merchant/profile            # 商户资料
PUT    /api/v1/merchant/profile            # 更新资料
GET    /api/v1/merchant/balance            # 余额查询
GET    /api/v1/merchant/transactions       # 交易记录
GET    /api/v1/merchant/messages           # 发送记录
POST   /api/v1/merchant/messages/send      # 发送消息
POST   /api/v1/merchant/messages/batch     # 批量发送
GET    /api/v1/merchant/stats              # 统计报表
```

#### 子账号管理 (Merchant)
```
GET    /api/v1/merchant/sub-accounts       # 子账号列表
POST   /api/v1/merchant/sub-accounts       # 创建子账号
PUT    /api/v1/merchant/sub-accounts/:id   # 更新子账号
DELETE /api/v1/merchant/sub-accounts/:id   # 删除子账号
```

---

## 4. 核心功能实现

### 4.1 多语言切换逻辑

```javascript
// 商户后台语言检测
function detectLanguage(req) {
    // 1. 检查用户手动设置
    const userLang = req.cookies.preferred_language;
    if (userLang && ['zh', 'en', 'es', 'pt'].includes(userLang)) {
        return userLang;
    }
    
    // 2. IP 地理位置检测
    const ip = req.ip;
    const geo = geoip.lookup(ip);
    const countryLangMap = {
        'CN': 'zh', 'TW': 'zh', 'HK': 'zh',
        'US': 'en', 'GB': 'en', 'AU': 'en',
        'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es',
        'BR': 'pt', 'PT': 'pt'
    };
    
    if (geo && countryLangMap[geo.country]) {
        return countryLangMap[geo.country];
    }
    
    // 3. 浏览器语言
    const acceptLang = req.headers['accept-language'];
    if (acceptLang) {
        if (acceptLang.includes('zh')) return 'zh';
        if (acceptLang.includes('pt')) return 'pt';
        if (acceptLang.includes('es')) return 'es';
    }
    
    // 4. 默认英语
    return 'en';
}
```

### 4.2 计费逻辑

```javascript
// 短信计费
async function calculateMessageCost(merchantId, phoneNumber, message, type = 'sms') {
    // 1. 解析国家代码
    const countryCode = parsePhoneNumber(phoneNumber).country;
    
    // 2. 检测字符长度和分片
    const { segments, encoding } = detectMessageEncoding(message);
    
    // 3. 查找商户专属价格
    let pricing = await PricingPlan.findOne({
        merchant_id: merchantId,
        country_code: countryCode,
        channel_type: type
    });
    
    // 4. 没有专属价格，使用默认价格
    if (!pricing) {
        pricing = await PricingPlan.findOne({
            merchant_id: null,
            country_code: countryCode,
            channel_type: type
        });
    }
    
    // 5. 计算总价
    const unitPrice = type === 'rcs' ? pricing.price_per_rcs : pricing.price_per_sms;
    const totalCost = unitPrice * segments;
    
    return {
        country_code: countryCode,
        segments: segments,
        encoding: encoding, // 'GSM-7' or 'UCS-2'
        unit_price: unitPrice,
        total_cost: totalCost,
        currency: pricing.currency
    };
}

// 短信分片检测
function detectMessageEncoding(message) {
    // GSM-7 字符集
    const gsm7Chars = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%\u0026\'()*+,-./0123456789:;\u003c=\u003e?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
    
    let isGsm7 = true;
    for (let char of message) {
        if (!gsm7Chars.includes(char)) {
            isGsm7 = false;
            break;
        }
    }
    
    // GSM-7: 160 chars per segment, concatenated: 153
    // UCS-2: 70 chars per segment, concatenated: 67
    const maxChars = isGsm7 ? 160 : 70;
    const maxConcatChars = isGsm7 ? 153 : 67;
    
    if (message.length <= maxChars) {
        return { segments: 1, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' };
    } else {
        const segments = Math.ceil(message.length / maxConcatChars);
        return { segments, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' };
    }
}
```

### 4.3 通道故障自动切换

```javascript
// 通道健康检查
async function checkChannelHealth(channelId) {
    const channel = await Channel.findById(channelId);
    
    // 获取最近10分钟的数据
    const stats = await Message.aggregate([
        {
            $match: {
                channel_id: channelId,
                created_at: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const success = stats.find(s => s._id === 'delivered')?.count || 0;
    const failed = stats.find(s => s._id === 'failed')?.count || 0;
    
    const successRate = total > 0 ? (success / total) * 100 : 100;
    
    // 更新通道状态
    await Channel.updateOne(
        { _id: channelId },
        {
            success_rate: successRate,
            last_check: new Date()
        }
    );
    
    // 如果成功率低于阈值，标记为故障
    if (successRate < 80) {
        await Channel.updateOne(
            { _id: channelId },
            { status: 'degraded' }
        );
        // 触发告警通知管理员
        await sendAlert(`通道 ${channel.name} 成功率降至 ${successRate.toFixed(2)}%`);
    }
    
    return { successRate, total, success, failed };
}

// 自动选择最优通道
async function selectBestChannel(merchantId, countryCode, type = 'sms') {
    // 获取商户分配的通道
    const merchantChannels = await MerchantChannel.find({
        merchant_id: merchantId
    }).populate('channel_id');
    
    // 过滤可用通道
    const availableChannels = merchantChannels.filter(mc => {
        return mc.channel_id.status === 'active' &&
               mc.channel_id.type === type &&
               mc.channel_id.success_rate >= 90;
    });
    
    // 按优先级和成功率排序
    availableChannels.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return b.channel_id.success_rate - a.channel_id.success_rate;
    });
    
    return availableChannels[0]?.channel_id || null;
}
```

### 4.4 审计日志

```javascript
// 审计日志中间件
async function auditLog(req, res, next) {
    const originalSend = res.send;
    
    res.send = function(data) {
        // 只记录敏感操作
        const sensitiveActions = ['create', 'update', 'delete', 'recharge', 'pricing'];
        const action = req.route?.path?.split('/').pop();
        
        if (sensitiveActions.includes(action)) {
            AuditLog.create({
                user_id: req.user.id,
                user_type: req.user.type, // admin, merchant, sub_account
                action: `${req.method}_${action}`,
                resource_type: req.baseUrl.split('/').pop(),
                resource_id: req.params.id,
                old_value: req.oldData || null,
                new_value: req.body,
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
                created_at: new Date()
            });
        }
        
        originalSend.call(this, data);
    };
    
    next();
}
```

---

## 5. 技术栈推荐

### 后端
- **Node.js + Express/Fastify** - API 服务
- **PostgreSQL** - 主数据库
- **Redis** - 缓存、会话、队列
- **ClickHouse** - 日志分析
- **Bull Queue** - 消息队列

### 前端
- **React/Vue3 + TypeScript** - 管理后台
- **Vuetify/Ant Design** - UI 组件库
- **i18next/vue-i18n** - 国际化
- **Axios** - HTTP 客户端

### 基础设施
- **Docker + Kubernetes** - 容器编排
- **Nginx** - 反向代理
- **Prometheus + Grafana** - 监控告警
- **ELK Stack** - 日志分析

---

## 6. 部署架构

```
生产环境
├── API 服务 (3 replicas)
├── 管理后台 (2 replicas)
├── 商户后台 (2 replicas)
├── 定时任务服务 (1 replica)
├── PostgreSQL (主从)
├── Redis Cluster
└── ClickHouse
```

---

*文档版本: 1.0*
*创建时间: 2026-02-03*
