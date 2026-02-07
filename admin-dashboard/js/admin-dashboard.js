/**
 * Admin Dashboard - 主应用逻辑
 */

class AdminDashboard {
  constructor() {
    this.api = adminAPI;
    this.currentUser = null;
    this.realtimeInterval = null;
    this.charts = {};
    this.init();
  }

  init() {
    // 检查登录状态
    this.checkAuth();
    
    // 绑定导航事件
    this.bindNavigation();
    
    // 初始化实时数据
    this.startRealtimeUpdates();
  }

  checkAuth() {
    const token = localStorage.getItem('admin_token');
    const userStr = localStorage.getItem('admin_user');
    
    if (!token) {
      window.location.href = 'login.html';
      return;
    }

    try {
      this.currentUser = JSON.parse(userStr);
      this.updateUserUI();
    } catch (e) {
      this.logout();
    }
  }

  updateUserUI() {
    const userNameEl = document.getElementById('adminName');
    const userRoleEl = document.getElementById('adminRole');
    
    if (userNameEl && this.currentUser) {
      userNameEl.textContent = this.currentUser.name || this.currentUser.email;
    }
    if (userRoleEl && this.currentUser) {
      userRoleEl.textContent = this.currentUser.role === 'superadmin' ? '超级管理员' : '管理员';
    }
  }

  logout() {
    this.api.clearAuth();
    window.location.href = 'login.html';
  }

  bindNavigation() {
    // 侧边栏导航
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.loadPage(page);
      });
    });

    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  loadPage(page) {
    // 更新活动导航
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // 隐藏所有页面
    document.querySelectorAll('.page-content').forEach(content => {
      content.classList.add('hidden');
    });

    // 显示目标页面
    const targetPage = document.getElementById(`${page}Page`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
      this.initPage(page);
    }
  }

  initPage(page) {
    switch (page) {
      case 'dashboard':
        this.loadDashboardData();
        break;
      case 'merchants':
        this.loadMerchantsList();
        break;
      case 'channels':
        this.loadChannelsList();
        break;
      case 'messages':
        this.loadMessageAudit();
        break;
      case 'financial':
        this.loadFinancialReport();
        break;
      case 'alerts':
        this.loadAlerts();
        break;
    }
  }

  // ==================== 仪表盘 ====================
  async loadDashboardData() {
    try {
      const [stats, realtime] = await Promise.all([
        this.api.getSystemStats(),
        this.api.getRealtimeStats()
      ]);

      // 更新关键指标
      this.updateStatCard('totalMerchants', stats.totalMerchants);
      this.updateStatCard('activeMerchants', stats.activeMerchants);
      this.updateStatCard('todayMessages', realtime.todayMessages);
      this.updateStatCard('todayRevenue', `¥${realtime.todayRevenue.toFixed(2)}`);
      this.updateStatCard('systemHealth', stats.systemHealth, true);

      // 渲染图表
      this.renderRevenueChart(stats.revenueHistory);
      this.renderMessageChart(stats.messageHistory);
      this.renderChannelHealthChart(stats.channelHealth);

    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      this.showError('加载数据失败');
    }
  }

  updateStatCard(id, value, isStatus = false) {
    const el = document.getElementById(id);
    if (!el) return;

    if (isStatus) {
      el.textContent = value === 'healthy' ? '正常' : '异常';
      el.className = `stat-value ${value === 'healthy' ? 'text-success' : 'text-danger'}`;
    } else {
      el.textContent = value;
    }
  }

  renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    if (this.charts.revenue) {
      this.charts.revenue.destroy();
    }

    this.charts.revenue = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: '收入',
          data: data.map(d => d.revenue),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true
        }, {
          label: '成本',
          data: data.map(d => d.cost),
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  }

  renderMessageChart(data) {
    const ctx = document.getElementById('messageChart');
    if (!ctx) return;

    if (this.charts.messages) {
      this.charts.messages.destroy();
    }

    this.charts.messages = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: '发送成功',
          data: data.map(d => d.delivered),
          backgroundColor: '#16a34a'
        }, {
          label: '发送失败',
          data: data.map(d => d.failed),
          backgroundColor: '#dc2626'
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true },
          y: { stacked: true }
        }
      }
    });
  }

  // ==================== 商户管理 ====================
  async loadMerchantsList(page = 1) {
    try {
      const filters = {
        status: document.getElementById('merchantFilterStatus')?.value || '',
        search: document.getElementById('merchantSearch')?.value || ''
      };

      const data = await this.api.getMerchants(page, 20, filters);
      this.renderMerchantsTable(data.merchants);
      this.renderPagination('merchantsPagination', data.total, page, (p) => this.loadMerchantsList(p));

    } catch (error) {
      this.showError('加载商户列表失败');
    }
  }

  renderMerchantsTable(merchants) {
    const tbody = document.getElementById('merchantsTableBody');
    if (!tbody) return;

    tbody.innerHTML = merchants.map(m => `
      <tr>
        <td>${m.name}</td>
        <td>${m.email}</td>
        <td>
          <span class="badge badge-${m.status}">${this.getStatusText(m.status)}</span>
        </td>
        <td>¥${parseFloat(m.balance).toFixed(2)}</td>
        <td>${m.totalSent || 0}</td>
        <td>${new Date(m.createdAt).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="adminDashboard.viewMerchant('${m.id}')">查看</button>
          <button class="btn btn-sm btn-success" onclick="adminDashboard.rechargeModal('${m.id}')">充值</button>
          ${m.status === 'active' 
            ? `<button class="btn btn-sm btn-warning" onclick="adminDashboard.suspendMerchant('${m.id}')">暂停</button>`
            : `<button class="btn btn-sm btn-success" onclick="adminDashboard.activateMerchant('${m.id}')">激活</button>`
          }
        </td>
      </tr>
    `).join('');
  }

  getStatusText(status) {
    const map = {
      active: '正常',
      suspended: '已暂停',
      pending: '待审核',
      inactive: '未激活'
    };
    return map[status] || status;
  }

  // ==================== 充值模态框 ====================
  rechargeModal(merchantId) {
    this.currentRechargeMerchant = merchantId;
    document.getElementById('rechargeModal').classList.add('active');
  }

  async confirmRecharge() {
    const amount = parseFloat(document.getElementById('rechargeAmount').value);
    const notes = document.getElementById('rechargeNotes').value;

    if (!amount || amount <= 0) {
      this.showError('请输入有效金额');
      return;
    }

    try {
      await this.api.recharge(this.currentRechargeMerchant, amount, { notes });
      this.closeModal('rechargeModal');
      this.showSuccess('充值成功');
      this.loadMerchantsList();
    } catch (error) {
      this.showError('充值失败: ' + error.message);
    }
  }

  // ==================== 通道管理 ====================
  async loadChannelsList() {
    try {
      const channels = await this.api.getChannels();
      this.renderChannelsTable(channels);
    } catch (error) {
      this.showError('加载通道列表失败');
    }
  }

  renderChannelsTable(channels) {
    const tbody = document.getElementById('channelsTableBody');
    if (!tbody) return;

    tbody.innerHTML = channels.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${c.provider}</td>
        <td>
          <span class="badge badge-${c.status}">${this.getChannelStatusText(c.status)}</span>
        </td>
        <td>${c.successRate?.toFixed(1) || 0}%</td>
        <td>${c.avgLatency || 0}ms</td>
        <td>¥${c.basePrice}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="adminDashboard.editChannel('${c.id}')">编辑</button>
          <button class="btn btn-sm btn-info" onclick="adminDashboard.testChannel('${c.id}')">测试</button>
          <button class="btn btn-sm btn-danger" onclick="adminDashboard.deleteChannel('${c.id}')">删除</button>
        </td>
      </tr>
    `).join('');
  }

  getChannelStatusText(status) {
    const map = {
      active: '正常',
      inactive: '停用',
      maintenance: '维护中'
    };
    return map[status] || status;
  }

  // ==================== 消息审计 ====================
  async loadMessageAudit(page = 1) {
    try {
      const filters = {
        status: document.getElementById('messageFilterStatus')?.value || '',
        startDate: document.getElementById('messageStartDate')?.value || '',
        endDate: document.getElementById('messageEndDate')?.value || '',
        phoneNumber: document.getElementById('messagePhoneFilter')?.value || ''
      };

      const data = await this.api.getMessageAudit(filters, page, 50);
      this.renderMessageAuditTable(data.messages);
      this.renderPagination('messagePagination', data.total, page, (p) => this.loadMessageAudit(p));

    } catch (error) {
      this.showError('加载消息记录失败');
    }
  }

  renderMessageAuditTable(messages) {
    const tbody = document.getElementById('messageAuditTableBody');
    if (!tbody) return;

    tbody.innerHTML = messages.map(m => `
      <tr>
        <td>${new Date(m.createdAt).toLocaleString()}</td>
        <td>${m.merchantName}</td>
        <td>${m.to}</td>
        <td>${m.content.substring(0, 50)}${m.content.length > 50 ? '...' : ''}</td>
        <td>
          <span class="badge badge-${m.status}">${this.getMessageStatusText(m.status)}</span>
        </td>
        <td>¥${m.cost}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="adminDashboard.viewMessageDetail('${m.id}')">详情</button>
        </td>
      </tr>
    `).join('');
  }

  getMessageStatusText(status) {
    const map = {
      pending: '待发送',
      sent: '已发送',
      delivered: '已送达',
      failed: '失败'
    };
    return map[status] || status;
  }

  // ==================== 告警管理 ====================
  async loadAlerts() {
    try {
      const alerts = await this.api.getAlerts();
      this.renderAlertsTable(alerts);
    } catch (error) {
      this.showError('加载告警失败');
    }
  }

  renderAlertsTable(alerts) {
    const tbody = document.getElementById('alertsTableBody');
    if (!tbody) return;

    tbody.innerHTML = alerts.map(a => `
      <tr class="alert-${a.severity}">
        <td>${new Date(a.createdAt).toLocaleString()}</td>
        <td>
          <span class="badge badge-${a.severity}">${this.getSeverityText(a.severity)}</span>
        </td>
        <td>${a.title}</td>
        <td>${a.message}</td>
        <td>${a.status === 'resolved' ? '已解决' : '未处理'}</td>
        <td>
          ${a.status !== 'resolved' 
            ? `<button class="btn btn-sm btn-success" onclick="adminDashboard.resolveAlert('${a.id}')">解决</button>`
            : '-'
          }
        </td>
      </tr>
    `).join('');
  }

  getSeverityText(severity) {
    const map = {
      critical: '严重',
      warning: '警告',
      info: '信息'
    };
    return map[severity] || severity;
  }

  // ==================== 实时更新 ====================
  startRealtimeUpdates() {
    // 每30秒刷新一次实时数据
    this.realtimeInterval = setInterval(() => {
      if (document.getElementById('dashboardPage')?.classList.contains('hidden') === false) {
        this.loadDashboardData();
      }
    }, 30000);
  }

  stopRealtimeUpdates() {
    if (this.realtimeInterval) {
      clearInterval(this.realtimeInterval);
    }
  }

  // ==================== 工具方法 ====================
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

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
  }
}

// 初始化
const adminDashboard = new AdminDashboard();
