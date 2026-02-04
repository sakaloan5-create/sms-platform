const express = require('express');
const { ScheduledMessage } = require('../models');
const router = express.Router();

// Get scheduled messages
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { merchantId: req.user.id };
    if (status) where.status = status;

    const { count, rows } = await ScheduledMessage.findAndCountAll({
      where,
      order: [['scheduledAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      scheduledMessages: rows,
      pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    next(error);
  }
});

// Schedule a new message
router.post('/', async (req, res, next) => {
  try {
    const { recipients, content, type = 'sms', scheduledAt, templateId } = req.body;
    
    if (new Date(scheduledAt) <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    
    const scheduled = await ScheduledMessage.create({
      merchantId: req.user.id,
      recipients: Array.isArray(recipients) ? recipients : [recipients],
      content,
      type,
      scheduledAt: new Date(scheduledAt),
      templateId
    });
    
    res.status(201).json({ message: 'Message scheduled', scheduledMessage: scheduled });
  } catch (error) {
    next(error);
  }
});

// Cancel scheduled message
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const scheduled = await ScheduledMessage.findOne({
      where: { id: req.params.id, merchantId: req.user.id, status: 'pending' }
    });
    if (!scheduled) return res.status(404).json({ error: 'Scheduled message not found or already processed' });
    
    await scheduled.update({ status: 'cancelled' });
    res.json({ message: 'Scheduled message cancelled' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
