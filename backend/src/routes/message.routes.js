const express = require('express');
const { Message, Template, Blacklist } = require('../models');
const { sendMessage, sendBulkMessages, getMessageHistory, getMessageStatus } = require('../services/message.service');
const logger = require('../utils/logger');

const router = express.Router();

// Check blacklist
async function checkBlacklist(merchantId, phone, content) {
  // Check phone
  const phoneBlacklisted = await Blacklist.findOne({
    where: [{ type: 'global', phone }, { type: 'merchant', merchantId, phone }]
  });
  if (phoneBlacklisted) return { blocked: true, reason: 'Phone blacklisted' };
  
  // Check words
  const blacklistedWords = await Blacklist.findAll({
    where: [{ type: 'global', word: { [require('sequelize').Op.ne]: null } }, 
            { type: 'merchant', merchantId, word: { [require('sequelize').Op.ne]: null } }],
    attributes: ['word']
  });
  
  for (const entry of blacklistedWords) {
    if (content.toLowerCase().includes(entry.word.toLowerCase())) {
      return { blocked: true, reason: `Contains blocked word: ${entry.word}` };
    }
  }
  
  return { blocked: false };
}

// Send single message
router.post('/send', async (req, res, next) => {
  try {
    const { to, content, type = 'sms', callbackUrl, templateId, variables } = req.body;
    
    let finalContent = content;
    
    // If using template
    if (templateId) {
      const template = await Template.findOne({
        where: { id: templateId, merchantId: req.user.id, isActive: true }
      });
      if (!template) return res.status(404).json({ error: 'Template not found' });
      
      finalContent = template.content;
      if (variables) {
        Object.keys(variables).forEach(key => {
          finalContent = finalContent.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
        });
      }
    }
    
    // Check blacklist
    const blacklistCheck = await checkBlacklist(req.user.id, to, finalContent);
    if (blacklistCheck.blocked) {
      return res.status(403).json({ error: blacklistCheck.reason });
    }
    
    const result = await sendMessage(req.user.id, {
      phoneNumber: to,
      content: finalContent,
      messageType: type.toLowerCase(),
      callbackUrl
    });
    
    logger.info(`Message sent by ${req.user.id} to ${to}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Send bulk messages
router.post('/bulk', async (req, res, next) => {
  try {
    const { recipients, content, type = 'sms', templateId, variables, callbackUrl } = req.body;
    
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients array required' });
    }
    
    if (recipients.length > 10000) {
      return res.status(400).json({ error: 'Maximum 10,000 recipients per batch' });
    }
    
    let finalContent = content;
    
    // If using template
    if (templateId) {
      const template = await Template.findOne({
        where: { id: templateId, merchantId: req.user.id, isActive: true }
      });
      if (!template) return res.status(404).json({ error: 'Template not found' });
      
      finalContent = template.content;
      if (variables) {
        Object.keys(variables).forEach(key => {
          finalContent = finalContent.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
        });
      }
    }
    
    // Check blacklist for all recipients
    const validRecipients = [];
    const blockedRecipients = [];
    
    for (const phone of recipients) {
      const check = await checkBlacklist(req.user.id, phone, finalContent);
      if (check.blocked) {
        blockedRecipients.push({ phone, reason: check.reason });
      } else {
        validRecipients.push(phone);
      }
    }
    
    const result = await sendBulkMessages(req.user.id, {
      recipients: validRecipients,
      content: finalContent,
      messageType: type.toLowerCase(),
      callbackUrl
    });
    
    result.blockedRecipients = blockedRecipients;
    
    logger.info(`Bulk messages sent by ${req.user.id}, count: ${validRecipients.length}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get message status
router.get('/:id/status', async (req, res, next) => {
  try {
    const status = await getMessageStatus(req.params.id, req.user.id);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Get message history
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate, phone } = req.query;
    const result = await getMessageHistory(req.user.id, {
      page, limit, status, startDate, endDate, phoneNumber: phone
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
