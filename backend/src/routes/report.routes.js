const express = require('express');
const { Op } = require('sequelize');
const { Message, Transaction, DailyStats, Channel } = require('../models');
const router = express.Router();

// Get dashboard summary
router.get('/dashboard', async (req, res, next) => {
  try {
    const merchantId = req.user.id;
    const { startDate, endDate } = req.query;
    
    const where = { merchantId };
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }
    
    // Message stats
    const messageStats = await Message.findAll({
      where,
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', '*'), 'count'],
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'totalCost']
      ],
      group: ['status'],
      raw: true
    });
    
    // Total spending
    const totalSpent = await Transaction.sum('amount', {
      where: { merchantId, type: 'debit' }
    }) || 0;
    
    // Recent messages
    const recentMessages = await Message.findAll({
      where: { merchantId },
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [{ model: Channel, attributes: ['name', 'provider'] }]
    });
    
    res.json({
      messageStats: messageStats.reduce((acc, s) => ({ ...acc, [s.status]: parseInt(s.count) }), {}),
      totalSpent: Math.abs(totalSpent),
      recentMessages
    });
  } catch (error) {
    next(error);
  }
});

// Get daily stats (for charts)
router.get('/daily', async (req, res, next) => {
  try {
    const merchantId = req.user.id;
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await DailyStats.findAll({
      where: {
        merchantId,
        date: { [Op.gte]: startDate.toISOString().split('T')[0] }
      },
      order: [['date', 'ASC']]
    });
    
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

// Get message statistics by type/channel
router.get('/breakdown', async (req, res, next) => {
  try {
    const merchantId = req.user.id;
    const { startDate, endDate } = req.query;
    
    const dateWhere = {};
    if (startDate && endDate) {
      dateWhere.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }
    
    // By type
    const byType = await Message.findAll({
      where: { merchantId, ...dateWhere },
      attributes: ['type', [require('sequelize').fn('COUNT', '*'), 'count']],
      group: ['type'],
      raw: true
    });
    
    // By channel
    const byChannel = await Message.findAll({
      where: { merchantId, ...dateWhere },
      attributes: ['channelId', [require('sequelize').fn('COUNT', '*'), 'count']],
      group: ['channelId'],
      include: [{ model: Channel, attributes: ['name'] }],
      raw: true
    });
    
    // Delivery rate by day
    const deliveryStats = await Message.findAll({
      where: { merchantId, ...dateWhere },
      attributes: [
        [require('sequelize').fn('DATE', require('sequelize').col('createdAt')), 'date'],
        'status',
        [require('sequelize').fn('COUNT', '*'), 'count']
      ],
      group: [require('sequelize').fn('DATE', require('sequelize').col('createdAt')), 'status'],
      order: [[require('sequelize').fn('DATE', require('sequelize').col('createdAt')), 'ASC']],
      raw: true
    });
    
    res.json({ byType, byChannel, deliveryStats });
  } catch (error) {
    next(error);
  }
});

// Admin: Get system-wide stats
router.get('/system', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { startDate, endDate } = req.query;
    const dateWhere = {};
    if (startDate && endDate) {
      dateWhere.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }
    
    const totalMessages = await Message.count({ where: dateWhere });
    const totalRevenue = await Transaction.sum('amount', {
      where: { type: 'recharge', ...dateWhere }
    }) || 0;
    const activeMerchants = await require('../models').Merchant.count({
      where: { status: 'active' }
    });
    
    res.json({ totalMessages, totalRevenue, activeMerchants });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
