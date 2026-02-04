const express = require('express');
const { Merchant, Transaction, Message } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

const router = express.Router();

// Get profile
router.get('/profile', async (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    phone: req.user.phone,
    status: req.user.status,
    balance: req.user.balance,
    creditLimit: req.user.creditLimit,
    defaultLanguage: req.user.defaultLanguage,
    timezone: req.user.timezone,
    createdAt: req.user.createdAt
  });
});

// Get balance
router.get('/balance', async (req, res) => {
  res.json({
    balance: req.user.balance,
    creditLimit: req.user.creditLimit,
    available: parseFloat(req.user.balance) + parseFloat(req.user.creditLimit)
  });
});

// Get transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { merchantId: req.user.id };
    if (type) where.type = type;

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      transactions: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get message history
router.get('/messages', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { merchantId: req.user.id };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await Message.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      messages: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update profile
router.patch('/profile', async (req, res, next) => {
  try {
    const { name, phone, defaultLanguage, timezone } = req.body;
    await req.user.update({ name, phone, defaultLanguage, timezone });
    res.json({ message: 'Profile updated', merchant: req.user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
