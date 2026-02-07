/**
 * Enhanced Admin Routes
 * 管理后台扩展路由
 */
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const monitoringService = require('../services/monitoring.service');
const { Merchant, Channel, Message, Transaction, sequelize } = require('../models');
const { Op } = require('sequelize');

// ==================== 商户管理 ====================

// 获取商户列表
router.get('/merchants', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Merchant.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password'] }
    });

    // 获取每个商户的发送统计
    const merchantsWithStats = await Promise.all(
      rows.map(async (m) => {
        const totalSent = await Message.count({ where: { merchantId: m.id } });
        return { ...m.toJSON(), totalSent };
      })
    );

    res.json({
      merchants: merchantsWithStats,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取商户详情
router.get('/merchants/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // 获取统计信息
    const [totalMessages, totalSpent, recentTransactions] = await Promise.all([
      Message.count({ where: { merchantId: merchant.id } }),
      Message.sum('cost', { where: { merchantId: merchant.id } }),
      Transaction.findAll({
        where: { merchantId: merchant.id },
        limit: 10,
        order: [['createdAt', 'DESC']]
      })
    ]);

    res.json({
      merchant: {
        ...merchant.toJSON(),
        totalMessages,
        totalSpent: totalSpent || 0
      },
      recentTransactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建商户
router.post('/merchants', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, initialBalance = 0 } = req.body;
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const merchant = await Merchant.create({
      id: require('uuid').v4(),
      name,
      email,
      password: hashedPassword,
      phone,
      balance: initialBalance,
      status: 'active',
      role: 'merchant'
    });

    // 如果有初始余额，创建充值记录
    if (initialBalance > 0) {
      await Transaction.create({
        id: require('uuid').v4(),
        merchantId: merchant.id,
        type: 'recharge',
        amount: initialBalance,
        balance: initialBalance,
        description: 'Initial balance',
        status: 'completed'
      });
    }

    res.status(201).json({
      message: 'Merchant created successfully',
      merchant: { ...merchant.toJSON(), password: undefined }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新商户
router.put('/merchants/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, phone, status, pricePerSegment, creditLimit } = req.body;
    
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    await merchant.update({
      name: name || merchant.name,
      phone: phone || merchant.phone,
      status: status || merchant.status,
      pricePerSegment: pricePerSegment || merchant.pricePerSegment,
      creditLimit: creditLimit || merchant.creditLimit
    });

    res.json({ message: 'Merchant updated successfully', merchant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 暂停商户
router.post('/merchants/:id/suspend', authenticate, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const merchant = await Merchant.findByPk(req.params.id);
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    await merchant.update({ 
      status: 'suspended',
      suspendReason: reason || 'Suspended by admin'
    });

    res.json({ message: 'Merchant suspended successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 激活商户
router.post('/merchants/:id/activate', authenticate, requireAdmin, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    await merchant.update({ 
      status: 'active',
      suspendReason: null
    });

    res.json({ message: 'Merchant activated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 充值管理 ====================

// 商户充值
router.post('/merchants/:id/recharge', authenticate, requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { amount, paymentMethod, reference, notes } = req.body;
    const merchantId = req.params.id;

    const merchant = await Merchant.findByPk(merchantId, { transaction });
    if (!merchant) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const newBalance = parseFloat(merchant.balance) + parseFloat(amount);
    await merchant.update({ balance: newBalance }, { transaction });

    const rechargeRecord = await Transaction.create({
      id: require('uuid').v4(),
      merchantId,
      type: 'recharge',
      amount: parseFloat(amount),
      balance: newBalance,
      description: `Recharge via ${paymentMethod}. ${notes || ''}`,
      referenceId: reference,
      status: 'completed'
    }, { transaction });

    await transaction.commit();

    res.json({
      message: 'Recharge successful',
      transaction: rechargeRecord,
      newBalance
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// 扣款
router.post('/merchants/:id/deduct', authenticate, requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { amount, reason } = req.body;
    const merchantId = req.params.id;

    const merchant = await Merchant.findByPk(merchantId, { transaction });
    if (!merchant) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const newBalance = parseFloat(merchant.balance) - parseFloat(amount);
    await merchant.update({ balance: newBalance }, { transaction });

    const deductRecord = await Transaction.create({
      id: require('uuid').v4(),
      merchantId,
      type: 'debit',
      amount: -parseFloat(amount),
      balance: newBalance,
      description: `Admin deduction: ${reason}`,
      status: 'completed'
    }, { transaction });

    await transaction.commit();

    res.json({
      message: 'Deduction successful',
      transaction: deductRecord,
      newBalance
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// 充值历史
router.get('/merchants/:id/recharges', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Transaction.findAndCountAll({
      where: { 
        merchantId: req.params.id,
        type: { [Op.in]: ['recharge', 'debit'] }
      },
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      transactions: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 通道管理 ====================

// 获取通道列表
router.get('/channels', authenticate, requireAdmin, async (req, res) => {
  try {
    const channels = await Channel.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建通道
router.post('/channels', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, provider, type, config, basePrice } = req.body;
    
    const channel = await Channel.create({
      id: require('uuid').v4(),
      name,
      provider,
      type,
      config: config || {},
      basePrice: basePrice || 0.05,
      status: 'active'
    });

    res.status(201).json({ message: 'Channel created', channel });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新通道
router.put('/channels/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, config, basePrice, status } = req.body;
    
    const channel = await Channel.findByPk(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    await channel.update({
      name: name || channel.name,
      config: config || channel.config,
      basePrice: basePrice || channel.basePrice,
      status: status || channel.status
    });

    res.json({ message: 'Channel updated', channel });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除通道
router.delete('/channels/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const channel = await Channel.findByPk(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    await channel.destroy();
    res.json({ message: 'Channel deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 测试通道
router.post('/channels/:id/test', authenticate, requireAdmin, async (req, res) => {
  try {
    const { testNumber } = req.body;
    const channel = await Channel.findByPk(req.params.id);
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // 这里调用 Provider 发送测试消息
    // ...

    res.json({ message: 'Test message sent', channel: channel.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 财务报表 ====================

// 财务总览
router.get('/reports/financial', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    
    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const [revenue, cost, transactions] = await Promise.all([
      Transaction.sum('amount', { where: { ...where, type: 'recharge' } }),
      Message.sum('cost', { where }),
      Transaction.findAll({
        where,
        limit: 100,
        order: [['createdAt', 'DESC']]
      })
    ]);

    res.json({
      revenue: revenue || 0,
      cost: cost || 0,
      profit: (revenue || 0) - (cost || 0),
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 收入统计
router.get('/reports/revenue', authenticate, requireAdmin, async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    // 实现按日/周/月的收入统计
    // ...
    res.json({ period, data: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 消息审计 ====================

// 消息列表
router.get('/messages', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, merchantId, status, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (merchantId) where.merchantId = merchantId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows } = await Message.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Merchant,
        attributes: ['name', 'email']
      }]
    });

    res.json({
      messages: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 系统监控 ====================

// 系统统计
router.get('/system/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await monitoringService.getSystemStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 实时统计
router.get('/system/realtime', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await monitoringService.getRealtimeStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 告警列表
router.get('/alerts', authenticate, requireAdmin, (req, res) => {
  const { status, severity } = req.query;
  const alerts = monitoringService.getAlerts({ status, severity });
  res.json(alerts);
});

// 解决告警
router.post('/alerts/:id/resolve', authenticate, requireAdmin, (req, res) => {
  const resolved = monitoringService.resolveAlert(req.params.id);
  if (resolved) {
    res.json({ message: 'Alert resolved' });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

module.exports = router;
