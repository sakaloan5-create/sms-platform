/**
 * Admin Dashboard API Client
 * 管理后台专用 API 客户端
 */

class AdminAPI {
  constructor() {
    this.baseURL = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000/api'
      : 'https://sms-platform-api.onrender.com/api';
    this.token = localStorage.getItem('admin_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('admin_token', token);
  }

  clearAuth() {
    this.token = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  }

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
        if (response.status === 401) {
          this.clearAuth();
          window.location.href = '/admin-dashboard/login.html';
        }
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('Admin API Request failed:', error);
      throw error;
    }
  }

  // ==================== 认证 ====================
  async login(email, password) {
    const data = await this.request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('admin_user', JSON.stringify(data.user));
    }
    return data;
  }

  // ==================== 商户管理 ====================
  async getMerchants(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    return this.request(`/admin/merchants?${params}`);
  }

  async getMerchantDetail(merchantId) {
    return this.request(`/admin/merchants/${merchantId}`);
  }

  async createMerchant(merchantData) {
    return this.request('/admin/merchants', {
      method: 'POST',
      body: JSON.stringify(merchantData)
    });
  }

  async updateMerchant(merchantId, updateData) {
    return this.request(`/admin/merchants/${merchantId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
  }

  async suspendMerchant(merchantId, reason) {
    return this.request(`/admin/merchants/${merchantId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async activateMerchant(merchantId) {
    return this.request(`/admin/merchants/${merchantId}/activate`, {
      method: 'POST'
    });
  }

  // ==================== 充值管理 ====================
  async recharge(merchantId, amount, options = {}) {
    return this.request(`/admin/merchants/${merchantId}/recharge`, {
      method: 'POST',
      body: JSON.stringify({
        amount,
        paymentMethod: options.paymentMethod || 'manual',
        reference: options.reference,
        notes: options.notes
      })
    });
  }

  async deductBalance(merchantId, amount, reason) {
    return this.request(`/admin/merchants/${merchantId}/deduct`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason })
    });
  }

  async getRechargeHistory(merchantId, page = 1, limit = 20) {
    return this.request(`/admin/merchants/${merchantId}/recharges?page=${page}&limit=${limit}`);
  }

  // ==================== 通道管理 ====================
  async getChannels() {
    return this.request('/admin/channels');
  }

  async createChannel(channelData) {
    return this.request('/admin/channels', {
      method: 'POST',
      body: JSON.stringify(channelData)
    });
  }

  async updateChannel(channelId, updateData) {
    return this.request(`/admin/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
  }

  async deleteChannel(channelId) {
    return this.request(`/admin/channels/${channelId}`, {
      method: 'DELETE'
    });
  }

  async testChannel(channelId, testNumber) {
    return this.request(`/admin/channels/${channelId}/test`, {
      method: 'POST',
      body: JSON.stringify({ testNumber })
    });
  }

  async getChannelStats(channelId, startDate, endDate) {
    return this.request(`/admin/channels/${channelId}/stats?startDate=${startDate}&endDate=${endDate}`);
  }

  // ==================== 财务报表 ====================
  async getFinancialReport(startDate, endDate) {
    return this.request(`/admin/reports/financial?startDate=${startDate}&endDate=${endDate}`);
  }

  async getRevenueStats(period = 'daily') {
    return this.request(`/admin/reports/revenue?period=${period}`);
  }

  async getCostStats(period = 'daily') {
    return this.request(`/admin/reports/cost?period=${period}`);
  }

  // ==================== 消息审计 ====================
  async getMessageAudit(filters = {}, page = 1, limit = 50) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.merchantId) params.append('merchantId', filters.merchantId);
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.phoneNumber) params.append('phoneNumber', filters.phoneNumber);
    return this.request(`/admin/messages?${params}`);
  }

  async getMessageDetail(messageId) {
    return this.request(`/admin/messages/${messageId}`);
  }

  // ==================== 系统监控 ====================
  async getSystemStats() {
    return this.request('/admin/system/stats');
  }

  async getRealtimeStats() {
    return this.request('/admin/system/realtime');
  }

  async getAlerts() {
    return this.request('/admin/alerts');
  }

  async resolveAlert(alertId) {
    return this.request(`/admin/alerts/${alertId}/resolve`, {
      method: 'POST'
    });
  }

  // ==================== 日志审计 ====================
  async getAuditLogs(filters = {}, page = 1, limit = 50) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.adminId) params.append('adminId', filters.adminId);
    if (filters.action) params.append('action', filters.action);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    return this.request(`/admin/audit-logs?${params}`);
  }
}

const adminAPI = new AdminAPI();
