/**
 * SMS Platform API Client
 * 供前端页面调用 sms-platform 后端
 */

class SMSPlatformAPI {
  constructor() {
    // API 基础 URL - 根据环境切换
    this.baseURL = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000/api'
      : 'https://sms-platform-api.onrender.com/api';
    
    this.token = localStorage.getItem('sms_token');
  }

  /**
   * 设置认证 Token
   */
  setToken(token) {
    this.token = token;
    localStorage.setItem('sms_token', token);
  }

  /**
   * 清除认证
   */
  clearAuth() {
    this.token = null;
    localStorage.removeItem('sms_token');
    localStorage.removeItem('sms_user');
  }

  /**
   * 通用请求方法
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // ==================== 认证 API ====================

  /**
   * 注册商户
   */
  async register(merchantData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(merchantData)
    });
  }

  /**
   * 登录
   */
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('sms_user', JSON.stringify(data.user));
    }
    
    return data;
  }

  /**
   * 获取当前用户信息
   */
  async getProfile() {
    return this.request('/merchant/profile');
  }

  // ==================== 消息 API ====================

  /**
   * 发送单条短信
   */
  async sendSMS(to, content, options = {}) {
    return this.request('/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        to,
        content,
        type: options.type || 'sms',
        channelId: options.channelId,
        callbackUrl: options.callbackUrl
      })
    });
  }

  /**
   * 批量发送短信
   */
  async sendBulkSMS(messages) {
    return this.request('/messages/bulk', {
      method: 'POST',
      body: JSON.stringify({ messages })
    });
  }

  /**
   * 查询消息状态
   */
  async getMessageStatus(messageId) {
    return this.request(`/messages/${messageId}/status`);
  }

  /**
   * 获取消息历史
   */
  async getMessageHistory(page = 1, limit = 20) {
    return this.request(`/messages?page=${page}&limit=${limit}`);
  }

  // ==================== 账户 API ====================

  /**
   * 查询余额
   */
  async getBalance() {
    return this.request('/merchant/balance');
  }

  /**
   * 获取交易记录
   */
  async getTransactions(page = 1, limit = 20) {
    return this.request(`/merchant/transactions?page=${page}&limit=${limit}`);
  }

  // ==================== 模板 API ====================

  /**
   * 创建模板
   */
  async createTemplate(templateData) {
    return this.request('/templates', {
      method: 'POST',
      body: JSON.stringify(templateData)
    });
  }

  /**
   * 获取模板列表
   */
  async getTemplates() {
    return this.request('/templates');
  }

  /**
   * 使用模板发送
   */
  async sendWithTemplate(to, templateId, variables = {}) {
    return this.request('/messages/send-template', {
      method: 'POST',
      body: JSON.stringify({
        to,
        templateId,
        variables
      })
    });
  }

  // ==================== API Key 管理 ====================

  /**
   * 获取 API Keys
   */
  async getApiKeys() {
    return this.request('/apikeys');
  }

  /**
   * 创建新的 API Key
   */
  async createApiKey(name) {
    return this.request('/apikeys', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  /**
   * 删除 API Key
   */
  async deleteApiKey(keyId) {
    return this.request(`/apikeys/${keyId}`, {
      method: 'DELETE'
    });
  }

  // ==================== 子账号 API ====================

  /**
   * 创建子账号
   */
  async createSubaccount(subaccountData) {
    return this.request('/subaccounts', {
      method: 'POST',
      body: JSON.stringify(subaccountData)
    });
  }

  /**
   * 获取子账号列表
   */
  async getSubaccounts() {
    return this.request('/subaccounts');
  }

  // ==================== 报表 API ====================

  /**
   * 发送统计报表
   */
  async getReport(startDate, endDate) {
    return this.request(`/reports/sending?startDate=${startDate}&endDate=${endDate}`);
  }

  /**
   * 获取发送统计（Dashboard 用）
   */
  async getStats() {
    return this.request('/reports/stats');
  }

  // ==================== 定时发送 API ====================

  /**
   * 创建定时发送任务
   */
  async scheduleMessage(messageData, scheduleTime) {
    return this.request('/scheduled', {
      method: 'POST',
      body: JSON.stringify({
        ...messageData,
        scheduledAt: scheduleTime
      })
    });
  }

  /**
   * 获取定时任务列表
   */
  async getScheduledMessages() {
    return this.request('/scheduled');
  }

  /**
   * 取消定时任务
   */
  async cancelScheduledMessage(jobId) {
    return this.request(`/scheduled/${jobId}`, {
      method: 'DELETE'
    });
  }
}

// 创建全局实例
const smsAPI = new SMSPlatformAPI();

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SMSPlatformAPI;
}
