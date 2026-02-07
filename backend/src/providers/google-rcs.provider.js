/**
 * Google Business Messages RCS Provider
 * 通过 Google Business Messages API 发送 RCS
 */
const RCSProvider = require('./rcs.provider');
const { JWT } = require('google-auth-library');
const axios = require('axios');
const logger = require('../utils/logger');

class GoogleRCSProvider extends RCSProvider {
  constructor(config) {
    super(config);
    this.name = 'Google RCS';
    this.baseURL = 'https://businessmessages.googleapis.com/v1';
    this.brandId = config.brandId;
    this.agentId = config.agentId;
    this.serviceAccount = config.serviceAccount;
    this.auth = new JWT({
      email: this.serviceAccount.client_email,
      key: this.serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/businessmessages']
    });
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken() {
    const client = await this.auth.authorize();
    return client.access_token;
  }

  /**
   * 发送 RCS 消息
   */
  async send(to, message, options = {}) {
    try {
      const token = await this.getAccessToken();
      
      // 构建消息内容
      const messageContent = this.buildMessageContent(message);

      const response = await axios.post(
        `${this.baseURL}/conversations/${to}/messages`,
        {
          messageId: options.messageId || this.generateMessageId(),
          representative: {
            representativeType: 'BOT'
          },
          ...messageContent
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Google RCS message sent: ${response.data.messageId}`);

      return {
        success: true,
        messageId: response.data.messageId,
        status: 'sent',
        provider: 'google_rcs',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Google RCS send failed: ${error.response?.data?.error?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
        errorCode: error.response?.status
      };
    }
  }

  /**
   * 构建消息内容
   */
  buildMessageContent(message) {
    switch (message.type) {
      case 'text':
        return {
          text: message.text
        };

      case 'image':
        return {
          image: {
            imageUrl: message.imageUrl,
            accessibilityText: message.altText || 'Image'
          }
        };

      case 'richCard':
        return this.buildRichCard(message);

      case 'carousel':
        return this.buildCarousel(message);

      case 'suggestion':
        return this.buildSuggestion(message);

      default:
        return { text: message.text || '' };
    }
  }

  /**
   * 构建富卡片
   */
  buildRichCard(message) {
    const card = {
      richCard: {
        standaloneCard: {
          cardContent: {
            title: message.title,
            description: message.description,
            media: message.imageUrl ? {
              height: 'MEDIUM',
              contentInfo: {
                fileUrl: message.imageUrl,
                altText: message.altText || 'Card image'
              }
            } : undefined,
            suggestions: this.buildSuggestions(message.suggestions)
          }
        }
      }
    };

    return card;
  }

  /**
   * 构建轮播卡片
   */
  buildCarousel(message) {
    return {
      richCard: {
        carouselCard: {
          cardWidth: 'MEDIUM',
          cardContents: message.cards.map(card => ({
            title: card.title,
            description: card.description,
            media: card.imageUrl ? {
              height: 'MEDIUM',
              contentInfo: {
                fileUrl: card.imageUrl,
                altText: card.altText || 'Card image'
              }
            } : undefined,
            suggestions: this.buildSuggestions(card.suggestions)
          }))
        }
      }
    };
  }

  /**
   * 构建建议按钮
   */
  buildSuggestions(suggestions = []) {
    if (!suggestions || suggestions.length === 0) return [];

    return suggestions.map(s => {
      switch (s.type) {
        case 'reply':
          return {
            reply: {
              text: s.text,
              postbackData: s.postback || s.text
            }
          };

        case 'action':
          return {
            action: {
              text: s.text,
              postbackData: s.postback || s.text,
              openUrlAction: s.url ? {
                url: s.url
              } : undefined,
              dialAction: s.phone ? {
                phoneNumber: s.phone
              } : undefined
            }
          };

        case 'link':
          return {
            action: {
              text: s.text,
              openUrlAction: { url: s.url }
            }
          };

        default:
          return { reply: { text: s.text, postbackData: s.text } };
      }
    });
  }

  /**
   * 检查号码是否支持 RCS
   */
  async isRCSCompatible(phoneNumber) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/users/${phoneNumber}/capabilities`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      return response.data.capabilities?.includes('RICH_MESSAGING') || false;

    } catch (error) {
      logger.warn(`RCS capability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取号码能力
   */
  async getCapabilities(phoneNumber) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/users/${phoneNumber}/capabilities`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      return {
        compatible: true,
        features: response.data.capabilities || [],
        maxFileSize: response.data.maxFileSize || 10 * 1024 * 1024, // 10MB
        supportedTypes: response.data.supportedTypes || ['text', 'image']
      };

    } catch (error) {
      return {
        compatible: false,
        error: error.message
      };
    }
  }

  /**
   * 上传媒体文件到 Google Cloud Storage
   */
  async uploadMedia(file, mimeType) {
    try {
      // 实际实现需要上传到 GCS 并获取公开 URL
      // 这里简化处理
      logger.info(`Media upload requested: ${mimeType}, size: ${file.length} bytes`);
      
      // 模拟返回 URL
      return `https://storage.googleapis.com/bucket/media/${Date.now()}`;

    } catch (error) {
      logger.error(`Media upload failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 查询消息状态
   */
  async getStatus(messageId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/messages/${messageId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      return {
        success: true,
        status: this.mapStatus(response.data.status),
        deliveredAt: response.data.deliverTime,
        readAt: response.data.readTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 状态映射
   */
  mapStatus(googleStatus) {
    const statusMap = {
      'MESSAGE_STATUS_UNSPECIFIED': 'pending',
      'SENT': 'sent',
      'DELIVERED': 'delivered',
      'READ': 'read',
      'FAILED': 'failed'
    };
    return statusMap[googleStatus] || 'pending';
  }

  generateMessageId() {
    return `rcs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = GoogleRCSProvider;
