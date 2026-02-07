/**
 * Samsung Messages RCS Provider
 * 通过 Samsung RCS Cloud API 发送
 */
const RCSProvider = require('./rcs.provider');
const axios = require('axios');
const logger = require('../utils/logger');

class SamsungRCSProvider extends RCSProvider {
  constructor(config) {
    super(config);
    this.name = 'Samsung RCS';
    this.baseURL = config.baseURL || 'https://api.samsungRCS.com/v1';
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.botId = config.botId;
  }

  /**
   * 生成认证头
   */
  getAuthHeaders() {
    const timestamp = Date.now();
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(`${this.apiKey}${timestamp}`)
      .digest('hex');

    return {
      'X-API-Key': this.apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 发送 RCS 消息
   */
  async send(to, message, options = {}) {
    try {
      const rcsMessage = this.buildRCSMessage(message);

      const response = await axios.post(
        `${this.baseURL}/bots/${this.botId}/messages`,
        {
          to: to,
          message: rcsMessage,
          callbackUrl: options.callbackUrl
        },
        { headers: this.getAuthHeaders() }
      );

      logger.info(`Samsung RCS sent: ${response.data.messageId}`);

      return {
        success: true,
        messageId: response.data.messageId,
        status: 'sent',
        provider: 'samsung_rcs'
      };

    } catch (error) {
      logger.error(`Samsung RCS failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * 构建 RCS 消息
   */
  buildRCSMessage(message) {
    const base = {
      messageId: this.generateMessageId(),
      timestamp: new Date().toISOString()
    };

    switch (message.type) {
      case 'text':
        return {
          ...base,
          type: 'textMessage',
          textMessage: { text: message.text }
        };

      case 'file':
        return {
          ...base,
          type: 'fileMessage',
          fileMessage: {
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            mimeType: message.mimeType,
            fileSize: message.fileSize
          }
        };

      case 'richCard':
        return {
          ...base,
          type: 'richCardMessage',
          richCardMessage: {
            layout: {
              cardOrientation: 'VERTICAL',
              imageAlignment: 'LEFT'
            },
            content: {
              media: message.imageUrl ? {
                mediaUrl: message.imageUrl,
                height: 'MEDIUM_HEIGHT'
              } : undefined,
              title: message.title,
              description: message.description,
              suggestions: this.buildSuggestions(message.suggestions)
            }
          }
        };

      case 'carousel':
        return {
          ...base,
          type: 'carouselMessage',
          carouselMessage: {
            layout: {
              cardWidth: 'MEDIUM'
            },
            content: message.cards.map(card => ({
              media: card.imageUrl ? {
                mediaUrl: card.imageUrl,
                height: 'MEDIUM_HEIGHT'
              } : undefined,
              title: card.title,
              description: card.description,
              suggestions: this.buildSuggestions(card.suggestions)
            }))
          }
        };

      default:
        return { ...base, type: 'textMessage', textMessage: { text: message.text || '' } };
    }
  }

  buildSuggestions(suggestions = []) {
    return suggestions.map(s => {
      switch (s.type) {
        case 'reply':
          return {
            action: {
              displayText: s.text,
              postback: { data: s.postback || s.text }
            }
          };

        case 'openUrl':
          return {
            action: {
              displayText: s.text,
              urlAction: { url: s.url }
            }
          };

        case 'dialPhoneNumber':
          return {
            action: {
              displayText: s.text,
              dialAction: { phoneNumber: s.phone }
            }
          };

        case 'location':
          return {
            action: {
              displayText: s.text,
              locationAction: {
                latitude: s.lat,
                longitude: s.lng,
                label: s.label
              }
            }
          };

        default:
          return { action: { displayText: s.text, postback: { data: s.text } } };
      }
    });
  }

  async isRCSCompatible(phoneNumber) {
    try {
      const response = await axios.get(
        `${this.baseURL}/lookup/${phoneNumber}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data.rcsEnabled === true;
    } catch (error) {
      return false;
    }
  }

  async getCapabilities(phoneNumber) {
    try {
      const response = await axios.get(
        `${this.baseURL}/lookup/${phoneNumber}/capabilities`,
        { headers: this.getAuthHeaders() }
      );
      return {
        compatible: response.data.rcsEnabled,
        features: response.data.features || [],
        maxFileSize: response.data.maxFileSize || 5 * 1024 * 1024
      };
    } catch (error) {
      return { compatible: false };
    }
  }

  async uploadMedia(file, mimeType) {
    // 上传到 Samsung 媒体存储
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', file, { contentType: mimeType });

    const response = await axios.post(
      `${this.baseURL}/media/upload`,
      form,
      { headers: { ...this.getAuthHeaders(), ...form.getHeaders() } }
    );

    return response.data.mediaUrl;
  }

  async getStatus(messageId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/messages/${messageId}`,
        { headers: this.getAuthHeaders() }
      );

      return {
        success: true,
        status: response.data.status.toLowerCase(),
        deliveredAt: response.data.deliveredAt,
        readAt: response.data.readAt
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  generateMessageId() {
    return `samsung-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = SamsungRCSProvider;
