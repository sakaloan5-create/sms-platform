/**
 * RCS Message Service
 * RCS 富媒体消息专用服务
 */
const { Message, Merchant, Channel } = require('../models');
const providerFactory = require('../providers/provider.factory');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class RCSMessageService {
  constructor() {
    this.fallbackToSMS = true; // RCS 失败时自动回落到 SMS
  }

  /**
   * 发送 RCS 消息
   * @param {string} merchantId - 商户 ID
   * @param {object} rcsData - RCS 消息数据
   */
  async sendRCS(merchantId, rcsData) {
    const { to, message, fallbackSMS = true, options = {} } = rcsData;

    try {
      // 1. 检查商户
      const merchant = await Merchant.findByPk(merchantId);
      if (!merchant || merchant.status !== 'active') {
        throw new Error('Merchant not active');
      }

      // 2. 检查号码是否支持 RCS
      const rcsChannel = await this.findRCSChannel();
      if (!rcsChannel) {
        throw new Error('No RCS channel available');
      }

      const provider = providerFactory.get(rcsChannel.provider);
      if (!provider) {
        throw new Error('RCS provider not found');
      }

      // 3. 检查 RCS 兼容性
      const isCompatible = await provider.isRCSCompatible(to);
      
      if (!isCompatible && fallbackSMS) {
        logger.info(`RCS not supported for ${to}, falling back to SMS`);
        return this.fallbackToSMS(merchantId, rcsData);
      }

      if (!isCompatible) {
        throw new Error('Recipient does not support RCS and fallback is disabled');
      }

      // 4. 计算费用 (RCS 通常按条计费，不分片)
      const cost = merchant.pricePerRCS || 0.10;

      // 5. 检查余额
      if (parseFloat(merchant.balance) < cost) {
        throw new Error('Insufficient balance');
      }

      // 6. 创建消息记录
      const messageRecord = await Message.create({
        id: uuidv4(),
        merchantId,
        channelId: rcsChannel.id,
        to,
        content: this.serializeRCSContent(message),
        type: 'rcs',
        segments: 1,
        cost,
        currency: merchant.currency || 'USD',
        status: 'pending'
      });

      // 7. 发送
      const result = await provider.send(to, message, {
        messageId: messageRecord.id,
        callbackUrl: `${process.env.API_BASE_URL}/webhooks/${rcsChannel.provider}`
      });

      if (result.success) {
        messageRecord.externalId = result.messageId;
        messageRecord.status = 'sent';
        await messageRecord.save();

        // 扣费
        await this.deductBalance(merchant, cost);

        return {
          success: true,
          messageId: messageRecord.id,
          type: 'rcs',
          status: 'sent'
        };
      } else {
        messageRecord.status = 'failed';
        messageRecord.errorMessage = result.error;
        await messageRecord.save();

        if (fallbackSMS) {
          return this.fallbackToSMS(merchantId, rcsData);
        }

        throw new Error(`RCS failed: ${result.error}`);
      }

    } catch (error) {
      logger.error(`RCS send error: ${error.message}`);
      
      if (fallbackSMS) {
        return this.fallbackToSMS(merchantId, rcsData);
      }
      
      throw error;
    }
  }

  /**
   * 批量发送 RCS
   */
  async sendBulkRCS(merchantId, messages) {
    const results = [];
    
    for (const msg of messages) {
      try {
        const result = await this.sendRCS(merchantId, msg);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          to: msg.to
        });
      }
      
      // 控制速率
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * 回落到 SMS
   */
  async fallbackToSMS(merchantId, rcsData) {
    const { to, message } = rcsData;
    
    // 将 RCS 内容转换为纯文本
    const smsContent = this.convertToSMS(message);
    
    // 调用 SMS 服务
    const messageService = require('./message.service');
    
    return messageService.sendMessage(merchantId, {
      to,
      content: smsContent,
      type: 'sms'
    });
  }

  /**
   * 转换 RCS 为 SMS 文本
   */
  convertToSMS(rcsMessage) {
    switch (rcsMessage.type) {
      case 'text':
        return rcsMessage.text;

      case 'richCard':
        let text = rcsMessage.title || '';
        if (rcsMessage.description) {
          text += '\n' + rcsMessage.description;
        }
        if (rcsMessage.suggestions) {
          text += '\n' + rcsMessage.suggestions
            .filter(s => s.type === 'link' || s.type === 'action')
            .map(s => s.url || s.text)
            .join('\n');
        }
        return text;

      case 'carousel':
        return rcsMessage.cards
          ?.map(c => `${c.title}\n${c.description}`)
          .join('\n\n') || '';

      default:
        return rcsMessage.text || 'You have a new message';
    }
  }

  /**
   * 查找 RCS 通道
   */
  async findRCSChannel() {
    const channels = await Channel.findAll({
      where: {
        type: 'rcs',
        status: 'active'
      },
      order: [['priority', 'ASC']]
    });

    return channels[0] || null;
  }

  /**
   * 扣费
   */
  async deductBalance(merchant, amount) {
    merchant.balance = parseFloat(merchant.balance) - amount;
    await merchant.save();

    const { Transaction } = require('../models');
    await Transaction.create({
      id: uuidv4(),
      merchantId: merchant.id,
      type: 'debit',
      amount: -amount,
      balance: merchant.balance,
      description: 'RCS message',
      status: 'completed'
    });
  }

  /**
   * 序列化 RCS 内容
   */
  serializeRCSContent(message) {
    return JSON.stringify(message);
  }

  /**
   * 解析 RCS 内容
   */
  parseRCSContent(content) {
    try {
      return JSON.parse(content);
    } catch {
      return { type: 'text', text: content };
    }
  }

  /**
   * 处理 RCS 交互回调
   */
  async handleInteraction(webhookData) {
    const { messageId, action, postbackData, userId } = webhookData;

    logger.info(`RCS interaction: ${action} from ${userId}`);

    // 记录用户交互
    // 可以触发后续自动化流程

    return { success: true };
  }

  /**
   * 获取 RCS 统计
   */
  async getRCSStats(merchantId, startDate, endDate) {
    const { Op } = require('sequelize');
    
    const stats = await Message.findAll({
      where: {
        merchantId,
        type: 'rcs',
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', '*'), 'count'],
        [require('sequelize').fn('SUM', 'cost'), 'totalCost']
      ],
      group: ['status']
    });

    return stats;
  }
}

module.exports = new RCSMessageService();
