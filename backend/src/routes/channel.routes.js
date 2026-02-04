const express = require('express');
const { Channel } = require('../models');
const { requireAdmin } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();

// Get all channels (public for merchants to see available)
router.get('/', async (req, res, next) => {
  try {
    const channels = await Channel.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'provider', 'type', 'coverage', 'basePrice']
    });
    res.json(channels);
  } catch (error) {
    next(error);
  }
});

// Admin routes
router.use(requireAdmin);

// Get all channels (admin - includes private fields)
router.get('/admin', async (req, res, next) => {
  try {
    const channels = await Channel.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(channels);
  } catch (error) {
    next(error);
  }
});

// Create channel
router.post('/', async (req, res, next) => {
  try {
    const channel = await Channel.create(req.body);
    logger.info(`New channel created: ${channel.name}`);
    res.status(201).json(channel);
  } catch (error) {
    next(error);
  }
});

// Update channel
router.patch('/:id', async (req, res, next) => {
  try {
    const channel = await Channel.findByPk(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    await channel.update(req.body);
    logger.info(`Channel ${channel.id} updated`);
    res.json(channel);
  } catch (error) {
    next(error);
  }
});

// Delete channel
router.delete('/:id', async (req, res, next) => {
  try {
    const channel = await Channel.findByPk(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    await channel.update({ isActive: false });
    logger.info(`Channel ${channel.id} deactivated`);
    res.json({ message: 'Channel deactivated' });
  } catch (error) {
    next(error);
  }
});

// Get channel stats
router.get('/:id/stats', async (req, res, next) => {
  try {
    const channel = await Channel.findByPk(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json({
      id: channel.id,
      name: channel.name,
      stats: channel.stats || {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        successRate: 0,
        avgLatency: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
