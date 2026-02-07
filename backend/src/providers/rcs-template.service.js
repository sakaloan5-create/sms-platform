/**
 * RCS Template Service
 * RCS 模板管理服务
 */
const { Template } = require('../models');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class RCSTemplateService {
  constructor() {
    this.templateValidators = {
      text: this.validateTextTemplate.bind(this),
      richCard: this.validateRichCardTemplate.bind(this),
      carousel: this.validateCarouselTemplate.bind(this),
      suggestion: this.validateSuggestionTemplate.bind(this)
    };
  }

  /**
   * 创建 RCS 模板
   */
  async createTemplate(merchantId, templateData) {
    const { name, type, content, category = 'general' } = templateData;

    // 验证模板
    const validator = this.templateValidators[type];
    if (!validator) {
      throw new Error(`Unsupported RCS template type: ${type}`);
    }

    const validation = validator(content);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.error}`);
    }

    const template = await Template.create({
      id: uuidv4(),
      merchantId,
      name,
      type: 'rcs',
      content: JSON.stringify(content),
      variables: this.extractVariables(content),
      category,
      isActive: true
    });

    logger.info(`RCS template created: ${name} (${template.id})`);

    return template;
  }

  /**
   * 验证文本模板
   */
  validateTextTemplate(content) {
    if (!content.text || typeof content.text !== 'string') {
      return { valid: false, error: 'Text content is required' };
    }
    if (content.text.length > 4096) {
      return { valid: false, error: 'Text exceeds 4096 characters' };
    }
    return { valid: true };
  }

  /**
   * 验证富卡片模板
   */
  validateRichCardTemplate(content) {
    const errors = [];

    if (!content.title || content.title.length > 200) {
      errors.push('Title is required and must be ≤ 200 chars');
    }

    if (content.description && content.description.length > 2000) {
      errors.push('Description must be ≤ 2000 chars');
    }

    if (content.imageUrl) {
      const validImageTypes = ['.jpg', '.jpeg', '.png', '.gif'];
      const hasValidExt = validImageTypes.some(ext => 
        content.imageUrl.toLowerCase().endsWith(ext)
      );
      if (!hasValidExt) {
        errors.push('Image must be JPG, PNG or GIF');
      }
    }

    if (content.suggestions) {
      if (content.suggestions.length > 4) {
        errors.push('Maximum 4 suggestions allowed');
      }
      for (const sug of content.suggestions) {
        if (!sug.text || sug.text.length > 25) {
          errors.push('Suggestion text must be ≤ 25 chars');
        }
      }
    }

    return errors.length === 0 
      ? { valid: true } 
      : { valid: false, error: errors.join(', ') };
  }

  /**
   * 验证轮播模板
   */
  validateCarouselTemplate(content) {
    if (!content.cards || !Array.isArray(content.cards)) {
      return { valid: false, error: 'Cards array is required' };
    }

    if (content.cards.length < 2 || content.cards.length > 10) {
      return { valid: false, error: 'Carousel must have 2-10 cards' };
    }

    for (const card of content.cards) {
      const validation = this.validateRichCardTemplate(card);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  }

  /**
   * 验证建议按钮模板
   */
  validateSuggestionTemplate(content) {
    if (!content.suggestions || content.suggestions.length === 0) {
      return { valid: false, error: 'At least one suggestion is required' };
    }

    if (content.suggestions.length > 13) {
      return { valid: false, error: 'Maximum 13 suggestions allowed' };
    }

    return { valid: true };
  }

  /**
   * 提取模板变量
   */
  extractVariables(content) {
    const variables = [];
    const jsonStr = JSON.stringify(content);
    
    // 匹配 {{variableName}} 格式的变量
    const regex = /\{\{(\w+)\}\}/g;
    let match;
    
    while ((match = regex.exec(jsonStr)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * 使用模板发送 RCS
   */
  async sendWithTemplate(merchantId, templateId, to, variables = {}) {
    const template = await Template.findOne({
      where: { id: templateId, merchantId, type: 'rcs', isActive: true }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // 解析模板内容
    let content = JSON.parse(template.content);

    // 替换变量
    content = this.replaceVariables(content, variables);

    // 调用 RCS 服务发送
    const rcsService = require('./rcs.service');
    
    return rcsService.sendRCS(merchantId, {
      to,
      message: content,
      fallbackSMS: true
    });
  }

  /**
   * 替换模板变量
   */
  replaceVariables(content, variables) {
    let jsonStr = JSON.stringify(content);

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      jsonStr = jsonStr.replace(regex, String(value));
    }

    return JSON.parse(jsonStr);
  }

  /**
   * 获取模板列表
   */
  async getTemplates(merchantId, filters = {}) {
    const where = { merchantId, type: 'rcs' };
    
    if (filters.category) {
      where.category = filters.category;
    }
    
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return Template.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * 预览模板
   */
  async previewTemplate(templateId, variables = {}) {
    const template = await Template.findByPk(templateId);
    
    if (!template) {
      throw new Error('Template not found');
    }

    let content = JSON.parse(template.content);
    content = this.replaceVariables(content, variables);

    return {
      name: template.name,
      type: template.type,
      category: template.category,
      content,
      variables: template.variables
    };
  }

  /**
   * 预定义模板库
   */
  getPredefinedTemplates() {
    return [
      {
        name: 'Welcome Message',
        type: 'richCard',
        category: 'onboarding',
        content: {
          title: 'Welcome {{userName}}!',
          description: 'Thanks for joining us. Explore our services and get started today.',
          imageUrl: 'https://example.com/welcome.jpg',
          suggestions: [
            { type: 'reply', text: 'Get Started', postback: 'start' },
            { type: 'link', text: 'Learn More', url: 'https://example.com/guide' }
          ]
        }
      },
      {
        name: 'Order Confirmation',
        type: 'richCard',
        category: 'transaction',
        content: {
          title: 'Order #{{orderId}} Confirmed',
          description: 'Your order of {{items}} has been confirmed. Total: {{total}}',
          suggestions: [
            { type: 'reply', text: 'Track Order', postback: 'track_{{orderId}}' },
            { type: 'link', text: 'View Details', url: '{{orderUrl}}' }
          ]
        }
      },
      {
        name: 'Appointment Reminder',
        type: 'richCard',
        category: 'reminder',
        content: {
          title: 'Upcoming Appointment',
          description: 'You have an appointment with {{doctorName}} on {{date}} at {{time}}.',
          suggestions: [
            { type: 'reply', text: 'Confirm', postback: 'confirm' },
            { type: 'reply', text: 'Reschedule', postback: 'reschedule' },
            { type: 'dial', text: 'Call Us', phone: '{{clinicPhone}}' }
          ]
        }
      },
      {
        name: 'Product Showcase',
        type: 'carousel',
        category: 'marketing',
        content: {
          cards: [
            {
              title: '{{product1Name}}',
              description: '{{product1Desc}} - {{product1Price}}',
              imageUrl: '{{product1Image}}',
              suggestions: [
                { type: 'reply', text: 'Buy Now', postback: 'buy_{{product1Id}}' }
              ]
            },
            {
              title: '{{product2Name}}',
              description: '{{product2Desc}} - {{product2Price}}',
              imageUrl: '{{product2Image}}',
              suggestions: [
                { type: 'reply', text: 'Buy Now', postback: 'buy_{{product2Id}}' }
              ]
            }
          ]
        }
      }
    ];
  }

  /**
   * 初始化预定义模板
   */
  async initPredefinedTemplates(merchantId) {
    const templates = this.getPredefinedTemplates();
    const created = [];

    for (const tmpl of templates) {
      try {
        const exists = await Template.findOne({
          where: { merchantId, name: tmpl.name }
        });

        if (!exists) {
          const createdTemplate = await this.createTemplate(merchantId, tmpl);
          created.push(createdTemplate);
        }
      } catch (error) {
        logger.error(`Failed to create template ${tmpl.name}: ${error.message}`);
      }
    }

    return created;
  }
}

module.exports = new RCSTemplateService();
