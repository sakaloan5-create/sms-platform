# RCS (Rich Communication Services) 功能文档

## 概述

RCS (富媒体消息服务) 是 SMS 的下一代标准，支持富媒体内容、交互式按钮、已读回执等功能。

## ✅ 已完成功能

### RCS Providers

| Provider | 描述 | 适用地区 |
|----------|------|----------|
| **Google RCS** | Google Business Messages | 美国、加拿大、欧洲 |
| **Samsung RCS** | Samsung RCS Cloud | 韩国、亚洲 |

### 支持的消息类型

```javascript
// 1. 纯文本消息
{
  type: 'text',
  text: 'Hello, this is a rich message!'
}

// 2. 富卡片 (Rich Card)
{
  type: 'richCard',
  title: 'Welcome Offer',
  description: 'Get 20% off your first order!',
  imageUrl: 'https://example.com/promo.jpg',
  suggestions: [
    { type: 'reply', text: 'Claim Now', postback: 'claim' },
    { type: 'link', text: 'Learn More', url: 'https://example.com' }
  ]
}

// 3. 轮播卡片 (Carousel)
{
  type: 'carousel',
  cards: [
    {
      title: 'Product 1',
      description: 'Description here',
      imageUrl: 'https://example.com/1.jpg',
      suggestions: [{ type: 'reply', text: 'Buy' }]
    },
    {
      title: 'Product 2',
      description: 'Description here', 
      imageUrl: 'https://example.com/2.jpg',
      suggestions: [{ type: 'reply', text: 'Buy' }]
    }
  ]
}

// 4. 建议按钮 (Suggestion Chips)
{
  type: 'suggestion',
  suggestions: [
    { type: 'reply', text: 'Yes', postback: 'yes' },
    { type: 'reply', text: 'No', postback: 'no' },
    { type: 'dial', text: 'Call Us', phone: '+1234567890' },
    { type: 'link', text: 'Visit Website', url: 'https://example.com' }
  ]
}
```

## API 端点

### 发送 RCS 消息

```bash
POST /api/rcs/send
Authorization: Bearer YOUR_TOKEN

{
  "to": "+1234567890",
  "message": {
    "type": "richCard",
    "title": "Welcome!",
    "description": "Thanks for joining us",
    "suggestions": [
      { "type": "reply", "text": "Get Started" }
    ]
  },
  "fallbackSMS": true  // RCS 失败时自动回落到 SMS
}
```

### 批量发送

```bash
POST /api/rcs/bulk
Authorization: Bearer YOUR_TOKEN

{
  "messages": [
    { "to": "+1234567890", "message": { ... } },
    { "to": "+1234567891", "message": { ... } }
  ]
}
```

### 检查 RCS 兼容性

```bash
GET /api/rcs/capability/+1234567890
Authorization: Bearer YOUR_TOKEN

Response:
{
  "phoneNumber": "+1234567890",
  "compatible": true
}
```

### 获取号码能力

```bash
GET /api/rcs/capabilities/+1234567890
Authorization: Bearer YOUR_TOKEN

Response:
{
  "compatible": true,
  "features": ["RICH_MESSAGING", "READ_RECEIPTS"],
  "maxFileSize": 10485760,
  "supportedTypes": ["text", "image", "rich_card"]
}
```

## RCS 模板

### 创建模板

```bash
POST /api/rcs/templates
Authorization: Bearer YOUR_TOKEN

{
  "name": "Order Confirmation",
  "type": "richCard",
  "category": "transaction",
  "content": {
    "title": "Order #{{orderId}} Confirmed",
    "description": "Your order of {{items}} has been confirmed",
    "suggestions": [
      { "type": "reply", "text": "Track Order", "postback": "track_{{orderId}}" }
    ]
  }
}
```

### 使用模板发送

```bash
POST /api/rcs/templates/{templateId}/send
Authorization: Bearer YOUR_TOKEN

{
  "to": "+1234567890",
  "variables": {
    "orderId": "12345",
    "items": "3 items",
    "total": "$99.99"
  }
}
```

### 初始化预定义模板

```bash
POST /api/rcs/templates/init
Authorization: Bearer YOUR_TOKEN
```

预定义模板包括：
- Welcome Message (欢迎消息)
- Order Confirmation (订单确认)
- Appointment Reminder (预约提醒)
- Product Showcase (产品展示)

## 特性

### 1. 自动回落 (Fallback)

当接收方不支持 RCS 时，自动转换为 SMS 发送：

```javascript
{
  "to": "+1234567890",
  "message": { /* RCS content */ },
  "fallbackSMS": true  // 启用自动回落
}
```

### 2. 智能 Provider 选择

根据目标号码自动选择最优 RCS Provider：
- 美国/加拿大 → Google RCS
- 韩国/亚洲 → Samsung RCS

### 3. 交互式按钮

支持多种按钮类型：
- **Reply** - 快速回复
- **Action** - 执行操作
- **Link** - 打开链接
- **Dial** - 拨打电话
- **Location** - 分享位置

### 4. 已读回执

RCS 支持消息状态追踪：
- `sent` - 已发送
- `delivered` - 已送达
- `read` - 已读

## 计费

RCS 消息按条计费，通常比 SMS 贵：
- 单价: $0.10/条 (可配置)
- 不分片 (RCS 无字数限制)
- 失败不收费

## 配置

在 `.env` 中添加 RCS 配置：

```env
# Google RCS
GOOGLE_RCS_BRAND_ID=your_brand_id
GOOGLE_RCS_AGENT_ID=your_agent_id
GOOGLE_RCS_SERVICE_ACCOUNT={"client_email":"...","private_key":"..."}

# Samsung RCS
SAMSUNG_RCS_API_KEY=your_api_key
SAMSUNG_RCS_API_SECRET=your_api_secret
SAMSUNG_RCS_BOT_ID=your_bot_id

# 计费设置
RCS_DEFAULT_PRICE=0.10
```

## 前端集成

商户后台 JavaScript SDK 已集成 RCS 发送功能：

```javascript
// 发送 RCS
await smsAPI.sendRCS({
  to: '+1234567890',
  message: {
    type: 'richCard',
    title: 'Special Offer',
    description: '20% off!',
    suggestions: [
      { type: 'reply', text: 'Claim Now' }
    ]
  }
});

// 使用模板
await smsAPI.sendRCSWithTemplate({
  templateId: 'template-uuid',
  to: '+1234567890',
  variables: { orderId: '12345' }
});
```

## 注意事项

1. **覆盖率** - 并非所有手机都支持 RCS，建议启用 fallbackSMS
2. **审核** - 某些 Provider 需要审核品牌才能发送 RCS
3. **文件大小** - 图片/文件通常限制 10MB
4. **合规** - 遵守当地电信法规，需用户同意接收营销消息

---
*RCS 功能开发完成 - 2026-02-07*
