/**
 * Merchant Dashboard - 商户后台主应用
 */

class MerchantDashboard {
  constructor() {
    this.api = smsAPI;
    this.currentUser = null;
    this.refreshInterval = null;
    this.charts = {};
    this.init();
  }

  init() {
    this.checkAuth();
    this.bindEvents();
    this.initLanguage();
  }

  checkAuth() {
    const token = localStorage.getItem('sms_token');
    const userStr = localStorage.getItem('sms_user');
    
    if (!token) {
      this.showLoginModal();
      return;
    }

    try {
      this.currentUser = JSON.parse(userStr);
      this.updateUserUI();
      this.loadDashboard();
    } catch (e) {
      this.logout();
    }
  }

  updateUserUI() {
    const nameEl = document.getElementById('userName');
    const balanceEl = document.getElementById('userBalance');
    
    if (nameEl && this.currentUser) {
      nameEl.textContent = this.currentUser.name || this.currentUser.email;
    }
    
    this.updateBalanceDisplay();
  }

  async updateBalanceDisplay() {
    try {
      const data = await this.api.getBalance();
      const balanceEl = document.getElementById('userBalance');
      if (balanceEl) {
        balanceEl.textContent = `¥${parseFloat(data.balance).toFixed(2)}`;
      }
    } catch (error) {
      console.error('获取余额失败:', error);
    }
  }

  bindEvents() {
    // 导航
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigateTo(page);
      });
    });

    // 退出
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // 发送表单
    const sendForm = document.getElementById('sendSMSForm');
    if (sendForm) {
      sendForm.addEventListener('submit', (e) => this.handleSendSMS(e));
    }

    // 批量发送
    const bulkForm = document.getElementById('bulkSMSForm');
    if (bulkForm) {
      bulkForm.addEventListener('submit', (e) => this.handleBulkSend(e));
    }
  }

  initLanguage() {
    // 从 localStorage 或浏览器设置获取语言
    const savedLang = localStorage.getItem('preferred_language');
    const browserLang = navigator.language.split('-')[0];
    const defaultLang = savedLang || browserLang || 'en';
    
    if (typeof setLanguage === 'function') {
      setLanguage(defaultLang);
    }
  }

  navigateTo(page) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // 隐藏所有页面
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.add('hidden');
    });

    // 显示目标页面
    const targetSection = document.getElementById(`${page}Section`);
    if (targetSection) {
      targetSection.classList.remove('hidden');
      this.initPage(page);
    }

    // 更新 URL hash
    window.location.hash = page;
  }

  initPage(page) {
    switch (page) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'send':
        this.initSendPage();
        break;
      case 'history':
        this.loadMessageHistory();
        break;
      case 'templates':
        this.loadTemplates();
        break;
      case 'balance':
        this.loadBalanceHistory();
        break;
      case 'api':
        this.loadApiKeys();
        break;
    }
  }

  // ==================== 仪表盘 ====================
  async loadDashboard() {
    try {
      const [stats, balance] = await Promise.all([
        this.api.getStats(),
        this.api.getBalance()
      ]);

      // 更新关键指标
      this.updateDashboardCard('totalSent', stats.totalSent || 0);
      this.updateDashboardCard('totalDelivered', stats.totalDelivered || 0);
      this.updateDashboardCard('deliveryRate', `${stats.deliveryRate?.toFixed(1) || 0}%`);
      this.updateDashboardCard('currentBalance', `¥${parseFloat(balance.balance).toFixed(2)}`);

      // 渲染图表
      if (stats.dailyStats) {
        this.renderUsageChart(stats.dailyStats);
      }

      // 最近发送记录
      if (stats.recentMessages) {
        this.renderRecentMessages(stats.recentMessages);
      }

    } catch (error) {
      console.error('加载仪表盘失败:', error);
    }
  }

  updateDashboardCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  renderUsageChart(data) {
    const ctx = document.getElementById('usageChart');
    if (!ctx) return;

    if (this.charts.usage) {
      this.charts.usage.destroy();
    }

    this.charts.usage = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: i18n.t('chart.sent'),
          data: data.map(d => d.sent),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true
        }, {
          label: i18n.t('chart.delivered'),
          data: data.map(d => d.delivered),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.1)',
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  renderRecentMessages(messages) {
    const tbody = document.getElementById('recentMessagesTable');
    if (!tbody) return;

    tbody.innerHTML = messages.map(m => `
      <tr>
        <td>${new Date(m.createdAt).toLocaleString()}</td>
        <td>${m.to}</td>
        <td>${m.content.substring(0, 30)}${m.content.length > 30 ? '...' : ''}</td>
        <td>
          <span class="status-badge status-${m.status}">${this.getStatusText(m.status)}</span>
        </td>
        <td>¥${m.cost}</td>
      </tr>
    `).join('');
  }

  // ==================== 发送短信 ====================
  initSendPage() {
    // 字符计数
    const contentInput = document.getElementById('smsContent');
    const counterEl = document.getElementById('charCounter');
    
    if (contentInput && counterEl) {
      contentInput.addEventListener('input', () => {
        const length = contentInput.value.length;
        const segments = this.calculateSegments(contentInput.value);
        counterEl.textContent = `${length} ${i18n.t('chars')}, ${segments} ${i18n.t('segments')}`;
      });
    }
  }

  calculateSegments(content) {
    const isUnicode = /[^\x00-\x7F]/.test(content);
    const maxChars = isUnicode ? 70 : 160;
    return Math.ceil(content.length / maxChars);
  }

  async handleSendSMS(e) {
    e.preventDefault();
    
    const to = document.getElementById('phoneNumber').value.trim();
    const content = document.getElementById('smsContent').value.trim();
    
    if (!to || !content) {
      this.showError(i18n.t('error.fillAllFields'));
      return;
    }

    // 验证手机号格式
    if (!this.validatePhone(to)) {
      this.showError(i18n.t('error.invalidPhone'));
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = i18n.t('sending');

    try {
      const result = await this.api.sendSMS(to, content);
      
      this.showSuccess(i18n.t('success.messageSent', { id: result.messageId }));
      e.target.reset();
      document.getElementById('charCounter').textContent = '';
      
      // 刷新余额
      this.updateBalanceDisplay();
      
    } catch (error) {
      this.showError(error.message || i18n.t('error.sendFailed'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  validatePhone(phone) {
    // 简单验证：+ 开头，后面至少 8 位数字
    return /^\+[1-9]\d{7,}$/.test(phone.replace(/\s/g, ''));
  }

  // ==================== 批量发送 ====================
  async handleBulkSend(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('bulkNumberFile');
    const content = document.getElementById('bulkContent').value.trim();
    
    if (!fileInput.files[0] || !content) {
      this.showError(i18n.t('error.fillAllFields'));
      return;
    }

    // 解析 CSV/Excel
    const numbers = await this.parseNumberFile(fileInput.files[0]);
    
    if (numbers.length === 0) {
      this.showError(i18n.t('error.noValidNumbers'));
      return;
    }

    if (numbers.length > 1000) {
      this.showError(i18n.t('error.tooManyNumbers', { max: 1000 }));
      return;
    }

    const messages = numbers.map(num => ({
      to: num,
      content: content
    }));

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = i18n.t('sending') + '...';

    try {
      const results = await this.api.sendBulkSMS(messages);
      
      const success = results.filter(r => r.success).length;
      const failed = results.length - success;
      
      this.showSuccess(i18n.t('success.bulkSent', { success, failed }));
      this.updateBalanceDisplay();
      
    } catch (error) {
      this.showError(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = i18n.t('send');
    }
  }

  async parseNumberFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // 简单解析：按行分割，提取手机号
        const lines = text.split(/\r?\n/);
        const numbers = lines
          .map(line => line.trim())
          .filter(line => line && this.validatePhone(line));
        resolve(numbers);
      };
      reader.readAsText(file);
    });
  }

  // ==================== 发送历史 ====================
  async loadMessageHistory(page = 1) {
    try {
      const filters = {
        status: document.getElementById('historyFilterStatus')?.value || '',
        startDate: document.getElementById('historyStartDate')?.value || '',
        endDate: document.getElementById('historyEndDate')?.value || ''
      };

      const data = await this.api.getMessageHistory(page, 20);
      this.renderHistoryTable(data.messages);
      this.renderPagination('historyPagination', data.total, page, 
        (p) => this.loadMessageHistory(p));

    } catch (error) {
      this.showError(i18n.t('error.loadFailed'));
    }
  }

  renderHistoryTable(messages) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    tbody.innerHTML = messages.map(m => `
      <tr>
        <td>${new Date(m.createdAt).toLocaleString()}</td>
        <td>${m.to}</td>
        <td>${m.content.substring(0, 40)}${m.content.length > 40 ? '...' : ''}</td>
        <td>
          <span class="status-badge status-${m.status}">${this.getStatusText(m.status)}</span>
        </td>
        <td>${m.segments}</td>
        <td>¥${m.cost}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="merchantDashboard.viewMessageDetail('${m.id}')">
            ${i18n.t('detail')}
          </button>
        </td>
      </tr>
    `).join('');
  }

  // ==================== 模板管理 ====================
  async loadTemplates() {
    try {
      const templates = await this.api.getTemplates();
      this.renderTemplatesList(templates);
    } catch (error) {
      this.showError(i18n.t('error.loadFailed'));
    }
  }

  renderTemplatesList(templates) {
    const container = document.getElementById('templatesList');
    if (!container) return;

    container.innerHTML = templates.map(t => `
      <div class="template-card" data-id="${t.id}">
        <div class="template-header">
          <h4>${t.name}</h4>
          <span class="template-type">${t.type}</span>
        </div>
        <p class="template-content">${t.content}</p>
        <div class="template-actions">
          <button class="btn btn-sm btn-primary" onclick="merchantDashboard.useTemplate('${t.id}')">
            ${i18n.t('use')}
          </button>
          <button class="btn btn-sm btn-danger" onclick="merchantDashboard.deleteTemplate('${t.id}')">
            ${i18n.t('delete')}
          </button>
        </div>
      </div>
    `).join('');
  }

  useTemplate(templateId) {
    const template = this.templates?.find(t => t.id === templateId);
    if (template) {
      document.getElementById('smsContent').value = template.content;
      this.navigateTo('send');
    }
  }

  // ==================== 余额管理 ====================
  async loadBalanceHistory(page = 1) {
    try {
      const data = await this.api.getTransactions(page, 20);
      this.renderBalanceTable(data.transactions);
      this.updateBalanceDisplay();
    } catch (error) {
      this.showError(i18n.t('error.loadFailed'));
    }
  }

  renderBalanceTable(transactions) {
    const tbody = document.getElementById('balanceTableBody');
    if (!tbody) return;

    tbody.innerHTML = transactions.map(t => `
      <tr>
        <td>${new Date(t.createdAt).toLocaleString()}</td>
        <td>
          <span class="transaction-type type-${t.type}">${this.getTransactionTypeText(t.type)}</span>
        </td>
        <td class="${t.amount >= 0 ? 'text-success' : 'text-danger'}">
          ${t.amount >= 0 ? '+' : ''}¥${Math.abs(t.amount).toFixed(2)}
        </td>
        <td>¥${parseFloat(t.balance).toFixed(2)}</td>
        <td>${t.description || '-'}</td>
      </tr>
    `).join('');
  }

  getTransactionTypeText(type) {
    const map = {
      recharge: i18n.t('transaction.recharge'),
      debit: i18n.t('transaction.debit'),
      refund: i18n.t('transaction.refund'),
      credit: i18n.t('transaction.credit')
    };
    return map[type] || type;
  }

  // ==================== API Key 管理 ====================
  async loadApiKeys() {
    try {
      const keys = await this.api.getApiKeys();
      this.renderApiKeysList(keys);
    } catch (error) {
      this.showError(i18n.t('error.loadFailed'));
    }
  }

  renderApiKeysList(keys) {
    const tbody = document.getElementById('apiKeysTableBody');
    if (!tbody) return;

    tbody.innerHTML = keys.map(k => `
      <tr>
        <td>${k.name}</td>
        <td>${k.key.substring(0, 10)}...${k.key.substring(-4)}</td>
        <td>${new Date(k.createdAt).toLocaleDateString()}</td>
        <td>${k.lastUsed ? new Date(k.lastUsed).toLocaleString() : i18n.t('never')}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="merchantDashboard.revokeApiKey('${k.id}')">
            ${i18n.t('revoke')}
          </button>
        </td>
      </tr>
    `).join('');
  }

  async createApiKey() {
    const name = prompt(i18n.t('prompt.apiKeyName'));
    if (!name) return;

    try {
      const result = await this.api.createApiKey(name);
      this.showSuccess(i18n.t('success.apiKeyCreated', { key: result.apiKey }));
      this.loadApiKeys();
    } catch (error) {
      this.showError(error.message);
    }
  }

  // ==================== 工具方法 ====================
  getStatusText(status) {
    const map = {
      pending: i18n.t('status.pending'),
      sent: i18n.t('status.sent'),
      delivered: i18n.t('status.delivered'),
      failed: i18n.t('status.failed')
    };
    return map[status] || status;
  }

  renderPagination(elementId, total, currentPage, callback) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const totalPages = Math.ceil(total / 20);
    let html = '';

    for (let i = 1; i <= totalPages; i++) {
      html += `
        <button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" 
                onclick="(${callback})(${i})">${i}</button>
      `;
    }

    container.innerHTML = html;
  }

  showLoginModal() {
    // 重定向到登录页或显示登录弹窗
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
      loginModal.classList.add('active');
    }
  }

  logout() {
    this.api.clearAuth();
    window.location.reload();
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    // 使用现有的 toast 或创建一个
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }

    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }
}

// 简单的国际化工具
const i18n = {
  t(key, params = {}) {
    const lang = localStorage.getItem('preferred_language') || 'en';
    const translations = window.translations?.[lang] || {};
    let text = this.getNestedValue(translations, key) || key;
    
    // 替换参数
    Object.keys(params).forEach(k => {
      text = text.replace(`{{${k}}}`, params[k]);
    });
    
    return text;
  },
  
  getNestedValue(obj, key) {
    return key.split('.').reduce((o, k) => o?.[k], obj);
  }
};

// 初始化
const merchantDashboard = new MerchantDashboard();
