const express = require('express');
const bcrypt = require('bcryptjs');
const { Merchant, Transaction, Message, Channel } = require('../models');
const { requireAdmin } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();

// Apply admin check to all routes
router.use(requireAdmin);

// Get all merchants
router.get('/merchants', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (status) where.status = status;

    const { count, rows } = await Merchant.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      merchants: rows,
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

// Get merchant details
router.get('/merchants/:id', async (req, res, next) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    res.json(merchant);
  } catch (error) {
    next(error);
  }
});

// Update merchant status
router.patch('/merchants/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    
    await merchant.update({ status });
    logger.info(`Merchant ${merchant.id} status changed to ${status}`);
    res.json({ message: 'Status updated', merchant });
  } catch (error) {
    next(error);
  }
});

// Recharge merchant balance
router.post('/merchants/:id/recharge', async (req, res, next) => {
  try {
    const { amount, description } = req.body;
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const newBalance = parseFloat(merchant.balance) + parseFloat(amount);
    await merchant.update({ balance: newBalance });

    // Create transaction record
    await Transaction.create({
      merchantId: merchant.id,
      type: 'recharge',
      amount: parseFloat(amount),
      balance: newBalance,
      description: description || 'Admin recharge',
      status: 'completed'
    });

    logger.info(`Merchant ${merchant.id} recharged $${amount}`);
    res.json({ 
      message: 'Recharge successful', 
      balance: newBalance 
    });
  } catch (error) {
    next(error);
  }
});

// Get all transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      include: [{ model: Merchant, attributes: ['name', 'email'] }],
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

// Create admin user
router.post('/create-admin', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    
    const existing = await Merchant.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await Merchant.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      status: 'active'
    });

    logger.info(`New admin created: ${email}`);
    res.status(201).json({ 
      message: 'Admin created', 
      admin: { id: admin.id, name, email } 
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
