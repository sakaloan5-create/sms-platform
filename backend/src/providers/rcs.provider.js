/**
 * RCS Provider Interface
 * 富媒体消息服务标准接口
 */

class RCSProvider {
  constructor(config) {
    this.name = config.name || 'RCS';
    this.config = config;
    this.type = 'rcs';
  }

  /**
   * 发送 RCS 消息
   * @param {string} to - 接收号码
   * @param {object} message - RCS 消息对象
   * @param {object} options - 可选参数
   * @returns {Promise<object>}
   */
  async send(to, message, options = {}) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * 验证号码是否支持 RCS
   * @param {string} phoneNumber - 手机号
   * @returns {Promise<boolean>}
   */
  async isRCSCompatible(phoneNumber) {
    throw new Error('isRCSCompatible() must be implemented by subclass');
  }

  /**
   * 获取 RCS 能力
   * @param {string} phoneNumber - 手机号
   * @returns {Promise<object>} - 支持的类型、文件大小限制等
   */
  async getCapabilities(phoneNumber) {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  /**
   * 上传媒体文件
   * @param {Buffer} file - 文件数据
   * @param {string} mimeType - MIME 类型
   * @returns {Promise<string>} - 文件 URL
   */
  async uploadMedia(file, mimeType) {
    throw new Error('uploadMedia() must be implemented by subclass');
  }

  /**
   * 更新消息状态
   * @param {string} messageId - 消息 ID
   * @returns {Promise<object>}
   */
  async getStatus(messageId) {
    throw new Error('getStatus() must be implemented by subclass');
  }
}

module.exports = RCSProvider;
