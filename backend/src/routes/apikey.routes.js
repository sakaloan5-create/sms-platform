const express = require('express');
const crypto = require('crypto');
const { ApiKey } = require('../models');
const router = express.Router();

// Generate random API key
function generateApiKey() {
  return 'sk_' + crypto.randomBytes(32).toString('hex');
}

// Get all API keys
router.get('/', async (req, res, next) => {
  try {
    const keys = await ApiKey.findAll({
      where: { merchantId: req.user.id, isActive: true },
      attributes: ['id', 'name', 'permissions', 'lastUsedAt', 'expiresAt', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json({ apiKeys: keys });
  } catch (error) {
    next(error);
  }
});

// Create new API key
router.post('/', async (req, res, next) => {
  try {
    const { name, permissions = ['send', 'read'], expiresDays } = req.body;
    
    const key = generateApiKey();
    const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000) : null;
    
    const apiKey = await ApiKey.create({
      merchantId: req.user.id,
      name,
      key,
      permissions,
      expiresAt
    });
    
    // Only return the full key once
    res.status(201).json({
      message: 'API key created',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,  // Only shown once
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update API key
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, permissions, isActive } = req.body;
    const apiKey = await ApiKey.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!apiKey) return res.status(404).json({ error: 'API key not found' });
    
    await apiKey.update({ name, permissions, isActive });
    res.json({ message: 'API key updated', apiKey });
  } catch (error) {
    next(error);
  }
});

// Revoke API key
router.delete('/:id', async (req, res, next) => {
  try {
    const apiKey = await ApiKey.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!apiKey) return res.status(404).json({ error: 'API key not found' });
    
    await apiKey.update({ isActive: false });
    res.json({ message: 'API key revoked' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
