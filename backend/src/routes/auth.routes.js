const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Merchant } = require('../models');
const { authenticate } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();

// Register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    
    const existingMerchant = await Merchant.findOne({ where: { email } });
    if (existingMerchant) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const merchant = await Merchant.create({
      name,
      email,
      password: hashedPassword,
      phone,
      status: 'pending'
    });

    logger.info(`New merchant registered: ${email}`);
    res.status(201).json({
      message: 'Registration successful. Pending approval.',
      merchantId: merchant.id
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const merchant = await Merchant.findOne({ where: { email } });
    if (!merchant) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, merchant.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (merchant.status === 'pending') {
      return res.status(403).json({ error: 'Account pending approval' });
    }

    if (merchant.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    await merchant.update({ lastLoginAt: new Date() });

    const token = jwt.sign(
      { id: merchant.id, email: merchant.email, role: merchant.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        role: merchant.role,
        status: merchant.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Admin Login
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const admin = await Merchant.findOne({ 
      where: { email, role: 'admin' } 
    });
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: 'admin'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    status: req.user.status,
    balance: req.user.balance,
    defaultLanguage: req.user.defaultLanguage
  });
});

module.exports = router;
