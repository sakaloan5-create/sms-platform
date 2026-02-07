/**
 * Monitoring Service
 * 系统监控和告警服务
 */
const { Message, Channel, Merchant, sequelize } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class MonitoringService {
  constructor() {
    this.alerts = [];
    this.checkInterval = null;
    this.webhookURL = process.env.ALERT_WEBHOOK_URL;
    this.emailAlerts = process.env.ALERT_EMAIL?.split(',') || [];
  }

  /**
   * 启动监控
   */
  start() {
    logger.info('Starting monitoring service...');
    
    // 每5分钟执行一次检查
    this.checkInterval = setInterval(() => {
      this.runChecks();
    }, 5 * 60 * 1000);

    // 立即执行一次
    this.runChecks();
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 执行所有检查
   */
  async runChecks() {
    try {
      await Promise.all([
        this.checkChannelHealth(),
        this.checkDeliveryRate(),
        this.checkBalanceAlerts(),
        this.checkSystemResources(),
        this.checkFailedMessageSpike(),
        this.checkQueueBacklog()
      ]);
    } catch (error) {
      logger.error('Monitoring check failed:', error);
    }
  }

  /**
   * 检查通道健康状态
   */
  async checkChannelHealth() {
    const channels = await Channel.findAll({ where: { status: 'active' } });
    
    for (const channel of channels) {
      // 获取最近1小时的统计数据
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const stats = await Message.findAll({
        where: {
          channelId: channel.id,
          createdAt: { [Op.gte]: oneHourAgo }
        },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status']
      });

      const total = stats.reduce((sum, s) => sum + parseInt(s.get('count')), 0);
      const failed = stats.find(s => s.status === 'failed')?.get('count') || 0;
      const delivered = stats.find(s => s.status === 'delivered')?.get('count') || 0;

      if (total > 0) {
        const successRate = (delivered / total) * 100;
        const failureRate = (failed / total) * 100;

        // 更新通道统计
        channel.successRate = successRate;
        await channel.save();

        // 告警条件
        if (failureRate > 20) {
          await this.createAlert({
            severity: 'critical',
            title: `通道 ${channel.name} 故障率过高`,
            message: `最近1小时失败率 ${failureRate.toFixed(1)}%，成功率仅 ${successRate.toFixed(1)}%`,
            channelId: channel.id,
            metric: { failureRate, successRate, total }
          });
        } else if (failureRate > 10) {
          await this.createAlert({
            severity: 'warning',
            title: `通道 ${channel.name} 异常`,
            message: `最近1小时失败率 ${failureRate.toFixed(1)}%`,
            channelId: channel.id,
            metric: { failureRate, successRate }
          });
        }
      }
    }
  }

  /**
   * 检查整体送达率
   */
  async checkDeliveryRate() {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    const stats = await Message.findAll({
      where: {
        createdAt: { [Op.gte]: fifteenMinutesAgo }
      },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    const total = stats.reduce((sum, s) => sum + parseInt(s.get('count')), 0);
    const delivered = stats.find(s => s.status === 'delivered')?.get('count') || 0;

    if (total > 50) { // 至少50条才判断
      const deliveryRate = (delivered / total) * 100;
      
      if (deliveryRate < 90) {
        await this.createAlert({
          severity: 'critical',
          title: '系统整体送达率异常',
          message: `最近15分钟送达率仅 ${deliveryRate.toFixed(1)}%，共 ${total} 条消息`,
          metric: { deliveryRate, total, delivered }
        });
      } else if (deliveryRate < 95) {
        await this.createAlert({
          severity: 'warning',
          title: '系统送达率下降',
          message: `最近15分钟送达率 ${deliveryRate.toFixed(1)}%`,
          metric: { deliveryRate, total }
        });
      }
    }
  }

  /**
   * 检查商户余额告警
   */
  async checkBalanceAlerts() {
    const lowBalanceMerchants = await Merchant.findAll({
      where: {
        status: 'active',
        balance: { [Op.lt]: 100 } // 余额低于100
      }
    });

    for (const merchant of lowBalanceMerchants) {
      const key = `balance_${merchant.id}`;
      const lastAlert = this.getLastAlertTime(key);
      
      // 每天只告警一次
      if (!lastAlert || Date.now() - lastAlert > 24 * 60 * 60 * 1000) {
        await this.createAlert({
          severity: 'warning',
          title: `商户 ${merchant.name} 余额不足`,
          message: `当前余额 ¥${merchant.balance}，可能影响正常发送`,
          merchantId: merchant.id,
          metric: { balance: merchant.balance }
        });
        this.setLastAlertTime(key);
      }
    }
  }

  /**
   * 检查系统资源（简化版，实际可接入更详细的系统监控）
   */
  async checkSystemResources() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;

    if (usagePercent > 90) {
      await this.createAlert({
        severity: 'critical',
        title: '系统内存使用率过高',
        message: `Heap 使用率 ${usagePercent.toFixed(1)}% (${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`,
        metric: { heapUsedMB, heapTotalMB, usagePercent }
      });
    } else if (usagePercent > 80) {
      await this.createAlert({
        severity: 'warning',
        title: '系统内存使用率偏高',
        message: `Heap 使用率 ${usagePercent.toFixed(1)}%`,
        metric: { heapUsedMB, usagePercent }
      });
    }

    // 检查未处理消息堆积
    const pendingCount = await Message.count({
      where: { status: 'pending' }
    });

    if (pendingCount > 10000) {
      await this.createAlert({
        severity: 'critical',
        title: '消息队列严重堆积',
        message: `待处理消息 ${pendingCount} 条`,
        metric: { pendingCount }
      });
    } else if (pendingCount > 5000) {
      await this.createAlert({
        severity: 'warning',
        title: '消息队列堆积',
        message: `待处理消息 ${pendingCount} 条`,
        metric: { pendingCount }
      });
    }
  }

  /**
   * 检查失败消息突增
   */
  async checkFailedMessageSpike() {
    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);
    const tenMinAgo = new Date(now - 10 * 60 * 1000);

    // 最近5分钟失败数
    const recentFailed = await Message.count({
      where: {
        status: 'failed',
        createdAt: { [Op.gte]: fiveMinAgo }
      }
    });

    // 5-10分钟前失败数
    const previousFailed = await Message.count({
      where: {
        status: 'failed',
        createdAt: { [Op.gte]: tenMinAgo, [Op.lt]: fiveMinAgo }
      }
    });

    // 失败数突增超过200%
    if (previousFailed > 10 && recentFailed > previousFailed * 3) {
      await this.createAlert({
        severity: 'critical',
        title: '失败消息数量突增',
        message: `最近5分钟失败 ${recentFailed} 条，环比增长 ${((recentFailed/previousFailed - 1) * 100).toFixed(0)}%`,
        metric: { recentFailed, previousFailed }
      });
    }
  }

  /**
   * 检查队列积压
   */
  async checkQueueBacklog() {
    // 检查超过10分钟还在pending的消息
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const staleMessages = await Message.count({
      where: {
        status: 'pending',
        createdAt: { [Op.lt]: tenMinAgo }
      }
    });

    if (staleMessages > 100) {
      await this.createAlert({
        severity: 'critical',
        title: '消息处理延迟严重',
        message: `${staleMessages} 条消息超过10分钟未处理`,
        metric: { staleMessages }
      });
    }
  }

  /**
   * 创建告警
   */
  async createAlert(alertData) {
    const alert = {
      id: require('uuid').v4(),
      ...alertData,
      status: 'active',
      createdAt: new Date(),
      resolvedAt: null
    };

    this.alerts.push(alert);
    logger.warn(`Alert created: ${alert.title}`);

    // 发送通知
    await this.sendNotification(alert);

    return alert;
  }

  /**
   * 发送告警通知
   */
  async sendNotification(alert) {
    // Webhook 通知
    if (this.webhookURL) {
      try {
        const axios = require('axios');
        await axios.post(this.webhookURL, {
          type: 'alert',
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.createdAt,
          metric: alert.metric
        }, { timeout: 5000 });
      } catch (error) {
        logger.error('Failed to send webhook alert:', error.message);
      }
    }

    // 日志记录
    logger[alert.severity === 'critical' ? 'error' : 'warn'](
      `[ALERT-${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`
    );
  }

  /**
   * 获取所有告警
   */
  getAlerts(filters = {}) {
    let result = [...this.alerts];

    if (filters.status) {
      result = result.filter(a => a.status === filters.status);
    }

    if (filters.severity) {
      result = result.filter(a => a.severity === filters.severity);
    }

    // 按时间倒序
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      logger.info(`Alert resolved: ${alert.title}`);
      return true;
    }
    return false;
  }

  /**
   * 获取系统统计
   */
  async getSystemStats() {
    const [
      totalMerchants,
      activeMerchants,
      totalMessages,
      todayMessages,
      channelHealth
    ] = await Promise.all([
      Merchant.count(),
      Merchant.count({ where: { status: 'active' } }),
      Message.count(),
      Message.count({
        where: {
          createdAt: { [Op.gte]: new Date().setHours(0, 0, 0, 0) }
        }
      }),
      this.getChannelHealthStats()
    ]);

    // 系统健康状态
    const criticalAlerts = this.alerts.filter(
      a => a.status === 'active' && a.severity === 'critical'
    ).length;

    const systemHealth = criticalAlerts > 0 ? 'degraded' : 'healthy';

    return {
      totalMerchants,
      activeMerchants,
      totalMessages,
      todayMessages,
      systemHealth,
      channelHealth,
      activeAlerts: this.alerts.filter(a => a.status === 'active').length
    };
  }

  /**
   * 获取通道健康统计
   */
  async getChannelHealthStats() {
    const channels = await Channel.findAll({
      attributes: ['id', 'name', 'provider', 'status', 'successRate']
    });

    return channels.map(c => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      status: c.status,
      successRate: c.successRate || 0
    }));
  }

  /**
   * 获取实时统计
   */
  async getRealtimeStats() {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const [recentMessages, todayRevenue] = await Promise.all([
      Message.count({
        where: { createdAt: { [Op.gte]: fiveMinAgo } }
      }),
      Message.sum('cost', {
        where: {
          createdAt: { [Op.gte]: new Date().setHours(0, 0, 0, 0) },
          status: { [Op.in]: ['sent', 'delivered'] }
        }
      })
    ]);

    return {
      recentMessages,
      todayRevenue: todayRevenue || 0,
      activeAlerts: this.alerts.filter(a => a.status === 'active').length
    };
  }

  // 内部工具方法
  lastAlertTimes = new Map();

  getLastAlertTime(key) {
    return this.lastAlertTimes.get(key);
  }

  setLastAlertTime(key) {
    this.lastAlertTimes.set(key, Date.now());
  }
}

// 导出单例
module.exports = new MonitoringService();
