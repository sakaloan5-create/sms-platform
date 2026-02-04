const express = require('express');
const { Template } = require('../models');
const router = express.Router();

// Get all templates
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, type } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { merchantId: req.user.id, isActive: true };
    if (category) where.category = category;
    if (type) where.type = type;

    const { count, rows } = await Template.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      templates: rows,
      pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    next(error);
  }
});

// Create template
router.post('/', async (req, res, next) => {
  try {
    const { name, content, type = 'sms', category, variables = [] } = req.body;
    
    // Extract variables from content if not provided
    const extractedVars = content.match(/\{\{(\w+)\}\}/g) || [];
    const parsedVars = extractedVars.map(v => v.replace(/[{}]/g, ''));
    const finalVars = variables.length > 0 ? variables : parsedVars;
    
    const template = await Template.create({
      merchantId: req.user.id,
      name,
      content,
      type,
      category,
      variables: finalVars
    });
    
    res.status(201).json({ message: 'Template created', template });
  } catch (error) {
    next(error);
  }
});

// Get template by ID
router.get('/:id', async (req, res, next) => {
  try {
    const template = await Template.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (error) {
    next(error);
  }
});

// Update template
router.put('/:id', async (req, res, next) => {
  try {
    const { name, content, category, variables, isActive } = req.body;
    const template = await Template.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    await template.update({ name, content, category, variables, isActive });
    res.json({ message: 'Template updated', template });
  } catch (error) {
    next(error);
  }
});

// Delete template (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const template = await Template.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    await template.update({ isActive: false });
    res.json({ message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
});

// Preview template with variables
router.post('/:id/preview', async (req, res, next) => {
  try {
    const template = await Template.findOne({
      where: { id: req.params.id, merchantId: req.user.id }
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    const { variables } = req.body;
    let content = template.content;
    
    if (variables) {
      Object.keys(variables).forEach(key => {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
      });
    }
    
    res.json({ content, original: template.content, variables: template.variables });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
