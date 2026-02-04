const express = require('express');
const bcrypt = require('bcryptjs');
const { SubAccount } = require('../models');
const router = express.Router();

// Get all subaccounts
router.get('/', async (req, res, next) => {
  try {
    const subaccounts = await SubAccount.findAll({
      where: { merchantId: req.user.id },
      attributes: ['id', 'name', 'email', 'permissions', 'status', 'lastLoginAt', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json({ subaccounts });
  } catch (error) {
    next(error);
  }
});

// Create subaccount
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, permissions = [] } = req.body;
    
    const existing = await SubAccount.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const subaccount = await SubAccount.create({
      merchantId: req.user.id,
      name,
      email,
      password: hashedPassword,
      permissions
    });
    
    res.status(201).json({
      message: 'Subaccount created',
      subaccount: {
        id: subaccount.id,
        name: subaccount.name,
        email: subaccount.email,
        permissions: subaccount.permissions,
        status: subaccount.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update subaccount
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, permissions, status } = req.body;
    const subaccount = await SubAccount.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!subaccount) return res.status(404).json({ error: 'Subaccount not found' });
    
    await subaccount.update({ name, permissions, status });
    res.json({ message: 'Subaccount updated', subaccount });
  } catch (error) {
    next(error);
  }
});

// Reset subaccount password
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    const subaccount = await SubAccount.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!subaccount) return res.status(404).json({ error: 'Subaccount not found' });
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await subaccount.update({ password: hashedPassword });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete subaccount
router.delete('/:id', async (req, res, next) => {
  try {
    const subaccount = await SubAccount.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!subaccount) return res.status(404).json({ error: 'Subaccount not found' });
    
    await subaccount.destroy();
    res.json({ message: 'Subaccount deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
