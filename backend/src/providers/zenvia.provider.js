/**
 * Zenvia SMS Provider
 * 巴西本地通道
 */
const axios = require('axios');
const logger = require('../utils/logger');

class ZenviaProvider {
  constructor(config) {
    this.name = 'Zenvia';
    this.apiToken = config.apiToken;
    this.baseURL = 'https://api.zenvia.com/v2';
    this.from = config.from;
  }

  async send(to, content, options = {}) {
    try {
      const response = await axios.post(
        `${this.baseURL}/channels/sms/messages`,
        {
          from: this.from,
          to: to,
          contents: [{
            type: 'text',
            text: content
          }]
        },
        {
          headers: {
            'X-API-TOKEN': this.apiToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const message = response.data;
      logger.info(`Zenvia message sent: ${message.id}`);

      return {
        success: true,
        messageId: message.id,
        status: this._mapStatus(message.status),
        from: message.from,
        to: message.to,
        timestamp: message.timestamp
      };
    } catch (error) {
      logger.error(`Zenvia send failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        errorCode: error.response?.status
      };
    }
  }

  async sendBulk(messages) {
    // Zenvia 支持批量发送
    const results = [];
    for (const msg of messages) {
      const result = await this.send(msg.to, msg.content, msg.options);
      results.push(result);
      // 控制速率
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return results;
  }

  async getStatus(messageId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/channels/sms/messages/${messageId}`,
        {
          headers: {
            'X-API-TOKEN': this.apiToken
          }
        }
      );

      const message = response.data;
      return {
        success: true,
        status: this._mapStatus(message.status),
        timestamp: message.timestamp,
        direction: message.direction
      };
    } catch (error) {
      logger.error(`Zenvia status check failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async validateNumber(phoneNumber) {
    // Zenvia 号码验证需要通过其他方式
    // 简单的格式检查
    const brPattern = /^55\d{10,11}$/;
    return {
      valid: brPattern.test(phoneNumber),
      format: brPattern.test(phoneNumber) ? 'E.164' : 'invalid',
      note: 'Basic format validation only'
    };
  }

  _mapStatus(zenviaStatus) {
    const statusMap = {
      'QUEUED': 'pending',
      'SENT': 'sent',
      'DELIVERED': 'delivered',
      'READ': 'delivered',
      'UNDELIVERED': 'failed',
      'REJECTED': 'failed',
      'EXPIRED': 'failed'
    };
    return statusMap[zenviaStatus] || 'pending';
  }
}

module.exports = ZenviaProvider;
