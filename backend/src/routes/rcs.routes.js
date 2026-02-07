/**
 * RCS Routes
 * RCS 富媒体消息路由
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const rcsService = require('../services/rcs.service');
const rcsTemplateService = require('../services/rcs-template.service');

// ==================== RCS 发送 ====================

// 发送单条 RCS
router.post('/send', authenticate, async (req, res) => {
  try {
    const { to, message, fallbackSMS = true } = req.body;
    const merchantId = req.user.id;

    if (!to || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await rcsService.sendRCS(merchantId, {
      to,
      message,
      fallbackSMS
    });

    res.json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批量发送 RCS
router.post('/bulk', authenticate, async (req, res) => {
  try {
    const { messages } = req.body;
    const merchantId = req.user.id;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    if (messages.length > 1000) {
      return res.status(400).json({ error: 'Max 1000 messages per batch' });
    }

    const results = await rcsService.sendBulkRCS(merchantId, messages);

    res.json({
      total: messages.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RCS 模板 ====================

// 创建模板
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { name, type, content, category } = req.body;
    const merchantId = req.user.id;

    const template = await rcsTemplateService.createTemplate(merchantId, {
      name,
      type,
      content,
      category
    });

    res.status(201).json(template);

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 获取模板列表
router.get('/templates', authenticate, async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const merchantId = req.user.id;

    const templates = await rcsTemplateService.getTemplates(merchantId, {
      category,
      isActive: isActive !== undefined ? isActive === 'true' : undefined
    });

    res.json(templates);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 使用模板发送
router.post('/templates/:id/send', authenticate, async (req, res) => {
  try {
    const { to, variables = {} } = req.body;
    const { id } = req.params;
    const merchantId = req.user.id;

    const result = await rcsTemplateService.sendWithTemplate(
      merchantId,
      id,
      to,
      variables
    );

    res.json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 预览模板
router.get('/templates/:id/preview', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.query;

    const parsedVariables = variables ? JSON.parse(variables) : {};
    const preview = await rcsTemplateService.previewTemplate(id, parsedVariables);

    res.json(preview);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 初始化预定义模板
router.post('/templates/init', authenticate, async (req, res) => {
  try {
    const merchantId = req.user.id;
    const created = await rcsTemplateService.initPredefinedTemplates(merchantId);

    res.json({
      message: `${created.length} templates created`,
      templates: created
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RCS 能力查询 ====================

// 检查号码是否支持 RCS
router.get('/capability/:phoneNumber', authenticate, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const provider = rcsService.findRCSChannel();

    if (!provider) {
      return res.json({ compatible: false, reason: 'No RCS provider available' });
    }

    const rcsProvider = require('../providers/provider.factory').get(provider.provider);
    const isCompatible = await rcsProvider.isRCSCompatible(phoneNumber);

    res.json({
      phoneNumber,
      compatible: isCompatible
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取号码详细能力
router.get('/capabilities/:phoneNumber', authenticate, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const provider = rcsService.findRCSChannel();

    if (!provider) {
      return res.json({ compatible: false });
    }

    const rcsProvider = require('../providers/provider.factory').get(provider.provider);
    const capabilities = await rcsProvider.getCapabilities(phoneNumber);

    res.json(capabilities);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RCS 统计 ====================

// 获取 RCS 统计
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const merchantId = req.user.id;

    const stats = await rcsService.getRCSStats(
      merchantId,
      new Date(startDate || Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date(endDate || Date.now())
    );

    res.json(stats);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
