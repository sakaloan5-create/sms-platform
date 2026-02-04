const express = require('express');
const { Blacklist } = require('../models');
const { requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();

// Check if phone/word is blacklisted (internal use)
router.post('/check', async (req, res, next) => {
  try {
    const { phone, content } = req.body;
    const merchantId = req.user.id;
    
    const checks = { phone: false, words: [] };
    
    // Check phone blacklist
    if (phone) {
      const phoneBlacklisted = await Blacklist.findOne({
        where: { type: 'global', phone }
      });
      if (phoneBlacklisted) {
        checks.phone = true;
      } else {
        const merchantBlacklist = await Blacklist.findOne({
          where: { type: 'merchant', merchantId, phone }
        });
        checks.phone = !!merchantBlacklist;
      }
    }
    
    // Check content for blacklisted words
    if (content) {
      const globalWords = await Blacklist.findAll({
        where: { type: 'global' },
        attributes: ['word']
      });
      const merchantWords = await Blacklist.findAll({
        where: { type: 'merchant', merchantId },
        attributes: ['word']
      });
      
      const allWords = [...globalWords, ...merchantWords].map(w => w.word?.toLowerCase()).filter(Boolean);
      
      allWords.forEach(word => {
        if (content.toLowerCase().includes(word)) {
          checks.words.push(word);
        }
      });
    }
    
    res.json({
      isBlocked: checks.phone || checks.words.length > 0,
      ...checks
    });
  } catch (error) {
    next(error);
  }
});

// Get merchant's blacklist
router.get('/', async (req, res, next) => {
  try {
    const blacklists = await Blacklist.findAll({
      where: { type: 'merchant', merchantId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json({ blacklist: blacklists });
  } catch (error) {
    next(error);
  }
});

// Add to blacklist
router.post('/', async (req, res, next) => {
  try {
    const { phone, word, reason } = req.body;
    
    if (!phone && !word) {
      return res.status(400).json({ error: 'Phone or word required' });
    }
    
    const entry = await Blacklist.create({
      type: 'merchant',
      merchantId: req.user.id,
      phone,
      word,
      reason,
      blockedBy: req.user.id
    });
    
    res.status(201).json({ message: 'Added to blacklist', entry });
  } catch (error) {
    next(error);
  }
});

// Remove from blacklist
router.delete('/:id', async (req, res, next) => {
  try {
    const entry = await Blacklist.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    
    await entry.destroy();
    res.json({ message: 'Removed from blacklist' });
  } catch (error) {
    next(error);
  }
});

// Admin: Get global blacklist
router.get('/global', requireAdmin, async (req, res, next) => {
  try {
    const blacklists = await Blacklist.findAll({
      where: { type: 'global' },
      order: [['createdAt', 'DESC']]
    });
    res.json({ blacklist: blacklists });
  } catch (error) {
    next(error);
  }
});

// Admin: Add to global blacklist
router.post('/global', requireAdmin, async (req, res, next) => {
  try {
    const { phone, word, reason } = req.body;
    
    const entry = await Blacklist.create({
      type: 'global',
      phone,
      word,
      reason,
      blockedBy: req.user.id
    });
    
    res.status(201).json({ message: 'Added to global blacklist', entry });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
