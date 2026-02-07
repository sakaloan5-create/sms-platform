/**
 * Provider Factory
 * 统一管理和创建 SMS Provider
 */
const TwilioProvider = require('./twilio.provider');
const VonageProvider = require('./vonage.provider');
const ZenviaProvider = require('./zenvia.provider');
const MockProvider = require('./mock.provider');
const logger = require('../utils/logger');

class ProviderFactory {
  constructor() {
    this.providers = new Map();
    this.activeProviders = [];
  }

  /**
   * 注册 Provider
   * @param {string} name - Provider 名称
   * @param {object} config - 配置
   */
  register(name, config) {
    let provider;
    
    switch (name.toLowerCase()) {
      case 'twilio':
        provider = new TwilioProvider(config);
        break;
      case 'vonage':
        provider = new VonageProvider(config);
        break;
      case 'zenvia':
        provider = new ZenviaProvider(config);
        break;
      case 'mock':
        provider = new MockProvider(config);
        break;
      default:
        throw new Error(`Unknown provider: ${name}`);
    }

    this.providers.set(name.toLowerCase(), provider);
    logger.info(`Provider registered: ${name}`);
    return provider;
  }

  /**
   * 获取 Provider 实例
   * @param {string} name - Provider 名称
   * @returns {object|null}
   */
  get(name) {
    return this.providers.get(name.toLowerCase()) || null;
  }

  /**
   * 获取所有已注册的 Provider
   * @returns {array}
   */
  getAll() {
    return Array.from(this.providers.values());
  }

  /**
   * 根据目标号码智能选择 Provider
   * @param {string} to - 目标号码
   * @param {array} availableProviders - 可用 Provider 列表
   * @returns {object|null}
   */
  selectProviderForNumber(to, availableProviders = null) {
    const providers = availableProviders || this.getAll();
    
    if (providers.length === 0) {
      return null;
    }

    // 根据国家码选择最优 Provider
    const countryCode = this._extractCountryCode(to);
    
    // 巴西号码优先使用 Zenvia
    if (countryCode === '55') {
      const zenvia = providers.find(p => p.name === 'Zenvia');
      if (zenvia) return zenvia;
    }
    
    // 欧洲号码优先使用 Vonage
    const euCountries = ['44', '33', '49', '39', '34', '31'];
    if (euCountries.includes(countryCode)) {
      const vonage = providers.find(p => p.name === 'Vonage');
      if (vonage) return vonage;
    }
    
    // 默认使用 Twilio
    const twilio = providers.find(p => p.name === 'Twilio');
    if (twilio) return twilio;
    
    // 回退到第一个可用 Provider
    return providers[0];
  }

  /**
   * 带故障转移的发送
   * @param {string} to - 目标号码
   * @param {string} content - 内容
   * @param {array} providers - 尝试的 Provider 列表
   * @returns {Promise<object>}
   */
  async sendWithFailover(to, content, providers = null) {
    const providerList = providers || this.getAll();
    
    for (const provider of providerList) {
      try {
        logger.info(`Trying provider ${provider.name} for ${to}`);
        const result = await provider.send(to, content);
        
        if (result.success) {
          return {
            ...result,
            provider: provider.name
          };
        }
        
        logger.warn(`Provider ${provider.name} failed: ${result.error}`);
      } catch (error) {
        logger.error(`Provider ${provider.name} error: ${error.message}`);
      }
    }
    
    return {
      success: false,
      error: 'All providers failed',
      to: to
    };
  }

  _extractCountryCode(phoneNumber) {
    // 从 E.164 格式提取国家码
    const match = phoneNumber.match(/^\+(\d{1,3})/);
    return match ? match[1] : null;
  }
}

// 导出单例
module.exports = new ProviderFactory();
