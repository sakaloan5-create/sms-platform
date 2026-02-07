/**
 * Vonage (Nexmo) SMS Provider
 * 欧洲/国际覆盖好
 */
const { Vonage } = require('@vonage/server-sdk');
const logger = require('../utils/logger');

class VonageProvider {
  constructor(config) {
    this.name = 'Vonage';
    this.vonage = new Vonage({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret
    });
    this.from = config.fromNumber || config.brand;
  }

  async send(to, content, options = {}) {
    try {
      const response = await this.vonage.sms.send({
        to: to,
        from: this.from,
        text: content,
        type: this._detectEncoding(content),
        callback: options.callbackUrl,
        ...options
      });

      const message = response.messages[0];
      
      if (message.status === '0') {
        logger.info(`Vonage message sent: ${message.messageId}`);
        return {
          success: true,
          messageId: message.messageId,
          status: 'sent',
          to: message.to,
          remainingBalance: message.remainingBalance,
          messagePrice: message.messagePrice,
          network: message.network
        };
      } else {
        logger.error(`Vonage send failed: ${message['error-text']}`);
        return {
          success: false,
          error: message['error-text'],
          errorCode: message.status
        };
      }
    } catch (error) {
      logger.error(`Vonage provider error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendBulk(messages) {
    const results = [];
    // Vonage 批量 API 限制
    const batchSize = 5;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const batchPromises = batch.map(msg => this.send(msg.to, msg.content, msg.options));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }

  async getStatus(messageId) {
    // Vonage 通过 webhook 回调状态
    // 这里提供查询接口（如果有）
    logger.warn('Vonage status check requires webhook integration');
    return {
      success: false,
      error: 'Status check via API not supported, use webhooks'
    };
  }

  async validateNumber(phoneNumber) {
    try {
      const response = await this.vonage.numberInsights.get({
        number: phoneNumber,
        features: ['carrier', 'type']
      });
      
      return {
        valid: response.status === 0,
        countryCode: response.countryCode,
        nationalFormat: response.nationalFormat,
        carrier: response.carrier,
        type: response.type,
        reachable: response.reachable
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  _detectEncoding(text) {
    // 检测是否需要 Unicode
    const gsm7Chars = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-.\/0123456789:;<=\>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà]*$/;
    return gsm7Chars.test(text) ? 'text' : 'unicode';
  }
}

module.exports = VonageProvider;
