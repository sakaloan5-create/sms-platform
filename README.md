# SMS Platform - 全球 SMS/RCS 双后台系统

## 项目概述

完整的全球 SMS/RCS 消息服务平台，包含管理后台和商户后台。

## 功能特性

### 1. 双后台架构
- **管理后台**（中文）：商户管理、通道配置、财务报表、审计日志
- **商户后台**（多语言）：消息发送、余额管理、API 集成、报表统计

### 2. 多语言支持
- 商户后台：中文、英语、西班牙语、葡萄牙语
- IP 自动识别 + 手动切换

### 3. 计费系统
- 按条计费（精确到分片）
- 余额充值/扣款/退款
- 商户独立价格体系
- 字符长度检测（GSM-7/UCS-2）

### 4. 通道管理
- 多服务商接入（Twilio、Vonage、Zenvia 等）
- 自动故障切换
- 通道性能监控
- 商户-通道分配

### 5. 安全与权限
- RBAC 权限控制
- JWT 认证
- 审计日志
- API 密钥管理

## 技术栈

### 后端
- Node.js + Express
- PostgreSQL + Sequelize
- Redis（缓存/队列）
- JWT 认证
- i18n 国际化

### 前端
- HTML5 + CSS3 + JavaScript
- 响应式设计
- 多语言切换

## 项目结构

```
sms-platform/
├── backend/               # 后端 API
│   ├── src/
│   │   ├── app.js        # 主入口
│   │   ├── models/       # 数据库模型
│   │   ├── services/     # 业务逻辑
│   │   ├── routes/       # API 路由
│   │   ├── middleware/   # 中间件
│   │   └── utils/        # 工具函数
│   └── package.json
├── admin-dashboard/       # 管理后台（静态页面）
├── merchant-dashboard/    # 商户后台（静态页面）
└── docs/                  # 文档
```

## 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/sakaloan5-create/sms-platform.git
cd sms-platform
```

### 2. 安装依赖
```bash
cd backend
npm install
```

### 3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库等信息
```

### 4. 启动数据库
```bash
# 使用 Docker
docker run -d --name postgres \
  -e POSTGRES_DB=sms_platform \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 postgres:15
```

### 5. 启动服务
```bash
npm start
```

## API 文档

### 认证
- `POST /api/auth/register` - 注册商户
- `POST /api/auth/login` - 登录
- `POST /api/auth/admin/login` - 管理员登录

### 商户
- `GET /api/merchant/profile` - 获取资料
- `GET /api/merchant/balance` - 查询余额
- `GET /api/merchant/transactions` - 交易记录

### 消息
- `POST /api/messages/send` - 发送单条消息
- `POST /api/messages/bulk` - 批量发送
- `GET /api/messages` - 消息历史

### 管理
- `GET /api/admin/merchants` - 商户列表
- `POST /api/admin/merchants/:id/recharge` - 充值
- `GET /api/admin/channels` - 通道列表

## 在线预览

- **管理后台**: https://sakaloan5-create.github.io/sms-platform/admin-dashboard/
- **商户后台**: https://sakaloan5-create.github.io/sms-platform/merchant-dashboard/

## 开发团队

开发: 老K (Lao K)  
日期: 2026-02-04

## 许可证

MIT
