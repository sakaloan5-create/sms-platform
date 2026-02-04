const express = require('express');
const { Message, Transaction, Merchant } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

const router = express.Router();

// Send single message
router.post('/send', async (req, res, next) => {
  try {
    const { to, content, type = 'SMS', callbackUrl } = req.body;
    
    // Calculate segments and cost
    const isUnicode = /[^\x00-\x7F]/.test(content);
    const maxLength = isUnicode ? 70 : 160;
    const segments = Math.ceil(content.length / maxLength);
    
    // Get price (simplified - should lookup from channel pricing)
    const pricePerSegment = 0.05; // $0.05 per segment
    const totalCost = segments * pricePerSegment;

    // Check balance
    const merchant = req.user;
    const available = parseFloat(merchant.balance) + parseFloat(merchant.creditLimit);
    if (available < totalCost) {
      return res.status(402).json({ error: 'Insufficient balance' });
    }

    // Create message record
    const message = await Message.create({
      merchantId: merchant.id,
      to,
      content,
      type,
      segments,
      cost: totalCost,
      status: 'pending',
      callbackUrl
    });

    // Deduct balance
    const newBalance = parseFloat(merchant.balance) - totalCost;
    await merchant.update({ balance: newBalance });

    // Create transaction
    await Transaction.create({
      merchantId: merchant.id,
      type: 'debit',
      amount: -totalCost,
      balance: newBalance,
      description: `SMS to ${to}`,
      referenceId: message.id,
      status: 'completed'
    });

    // TODO: Actually send via SMS provider
    // For now, simulate sending
    setTimeout(async () => {
      await message.update({ status: 'delivered', deliveredAt: new Date() });
    }, 1000);

    logger.info(`Message sent by ${merchant.id} to ${to}`);
    res.json({
      message: 'Message queued',
      messageId: message.id,
      segments,
      cost: totalCost
    });
  } catch (error) {
    next(error);
  }
});

// Send bulk messages
router.post('/bulk', async (req, res, next) => {
  try {
    const { recipients, content, type = 'SMS' } = req.body;
    
    // Calculate total cost
    const isUnicode = /[^\x00-\x7F]/.test(content);
    const maxLength = isUnicode ? 70 : 160;
    const segmentsPerMessage = Math.ceil(content.length / maxLength);
    const pricePerSegment = 0.05;
    const totalCost = recipients.length * segmentsPerMessage * pricePerSegment;

    // Check balance
    const merchant = req.user;
    const available = parseFloat(merchant.balance) + parseFloat(merchant.creditLimit);
    if (available < totalCost) {
      return res.status(402).json({ error: 'Insufficient balance' });
    }

    // Create messages
    const messages = await Promise.all(
      recipients.map(to =>
        Message.create({
          merchantId: merchant.id,
          to,
          content,
          type,
          segments: segmentsPerMessage,
          cost: segmentsPerMessage * pricePerSegment,
          status: 'pending'
        })
      )
    );

    // Deduct balance
    const newBalance = parseFloat(merchant.balance) - totalCost;
    await merchant.update({ balance: newBalance });

    // Create transaction
    await Transaction.create({
      merchantId: merchant.id,
      type: 'debit',
      amount: -totalCost,
      balance: newBalance,
      description: `Bulk SMS to ${recipients.length} recipients`,
      status: 'completed'
    });

    logger.info(`Bulk messages sent by ${merchant.id}, count: ${recipients.length}`);
    res.json({
      message: 'Bulk messages queued',
      count: recipients.length,
      totalCost,
      messageIds: messages.map(m => m.id)
    });
  } catch (error) {
    next(error);
  }
});

// Get message status
router.get('/:id/status', async (req, res, next) => {
  try {
    const message = await Message.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({
      id: message.id,
      status: message.status,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      failedAt: message.failedAt,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage
    });
  } catch (error) {
    next(error);
  }
});

// Get message history
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { merchantId: req.user.id };
    if (status) where.status = status;

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

module.exports = router;
