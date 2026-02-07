/**
 * Mock SMS Provider
 * 用于开发和测试，不实际发送短信
 */
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class MockProvider {
  constructor(config = {}) {
    this.name = 'Mock';
    this.config = config;
    this.failureRate = config.failureRate || 0.05; // 默认5%失败率
  }

  async send(to, content, options = {}) {
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // 模拟失败
    if (Math.random() < this.failureRate) {
      logger.warn(`Mock provider simulated failure for ${to}`);
      return {
        success: false,
        error: 'Simulated failure',
        errorCode: 'MOCK_ERROR'
      };
    }

    const messageId = `mock-${uuidv4()}`;
    logger.info(`Mock message sent: ${messageId} to ${to}`);

    // 模拟分片计算
    const segments = this._calculateSegments(content);

    return {
      success: true,
      messageId: messageId,
      status: 'sent',
      segments: segments,
      price: (segments * 0.005).toFixed(6), // 模拟价格
      currency: 'USD',
      to: to,
      timestamp: new Date().toISOString()
    };
  }

  async sendBulk(messages) {
    const results = [];
    for (const msg of messages) {
      const result = await this.send(msg.to, msg.content, msg.options);
      results.push(result);
    }
    return results;
  }

  async getStatus(messageId) {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 模拟状态变化
    const statuses = ['sent', 'delivered'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    return {
      success: true,
      status: randomStatus,
      timestamp: new Date().toISOString()
    };
  }

  async validateNumber(phoneNumber) {
    // 简单验证
    const isValid = phoneNumber.startsWith('+') && phoneNumber.length >= 8;
    
    return {
      valid: isValid,
      format: isValid ? 'E.164' : 'invalid',
      type: 'mobile',
      note: 'Mock validation'
    };
  }

  async getBalance() {
    return {
      success: true,
      balance: 999999.99,
      currency: 'USD'
    };
  }

  _calculateSegments(content) {
    // 简单分片计算
    // GSM-7: 160 chars/segment
    // Unicode: 70 chars/segment
    const isUnicode = /[^\x00-\x7F]/.test(content);
    const maxChars = isUnicode ? 70 : 160;
    return Math.ceil(content.length / maxChars);
  }
}

module.exports = MockProvider;
