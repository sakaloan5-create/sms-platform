// Stats service - daily statistics aggregation
const { DailyStats, Message, Transaction } = require('../models');
const { Op } = require('sequelize');

// Update daily stats for a message
const updateMessageStats = async (message) => {
  const date = new Date(message.createdAt).toISOString().split('T')[0];
  
  // Find or create daily stats record
  let stats = await DailyStats.findOne({
    where: {
      merchantId: message.merchantId,
      date
    }
  });
  
  if (!stats) {
    stats = await DailyStats.create({
      merchantId: message.merchantId,
      date,
      byType: {},
      byChannel: {}
    });
  }
  
  // Update counters
  const updateData = {
    totalSent: stats.totalSent + 1,
    totalCost: parseFloat(stats.totalCost) + parseFloat(message.cost || 0)
  };
  
  if (message.status === 'delivered') {
    updateData.totalDelivered = stats.totalDelivered + 1;
  } else if (message.status === 'failed') {
    updateData.totalFailed = stats.totalFailed + 1;
  }
  
  // Update by type breakdown
  const byType = { ...stats.byType };
  byType[message.type] = (byType[message.type] || 0) + 1;
  updateData.byType = byType;
  
  // Update by channel breakdown
  if (message.channelId) {
    const byChannel = { ...stats.byChannel };
    byChannel[message.channelId] = (byChannel[message.channelId] || 0) + 1;
    updateData.byChannel = byChannel;
  }
  
  await stats.update(updateData);
};

// Aggregate stats for date range
const getStatsForPeriod = async (merchantId, startDate, endDate) => {
  const stats = await DailyStats.findAll({
    where: {
      merchantId,
      date: {
        [Op.between]: [startDate, endDate]
      }
    },
    order: [['date', 'ASC']]
  });
  
  // Aggregate totals
  const totals = stats.reduce((acc, s) => ({
    totalSent: acc.totalSent + s.totalSent,
    totalDelivered: acc.totalDelivered + s.totalDelivered,
    totalFailed: acc.totalFailed + s.totalFailed,
    totalCost: acc.totalCost + parseFloat(s.totalCost)
  }), { totalSent: 0, totalDelivered: 0, totalFailed: 0, totalCost: 0 });
  
  return {
    daily: stats,
    totals
  };
};

// Cleanup old stats (keep last 90 days for individual merchants, all time for admin)
const cleanupOldStats = async () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  const deleted = await DailyStats.destroy({
    where: {
      merchantId: { [Op.ne]: null },  // Only delete merchant-specific stats
      date: { [Op.lt]: cutoffDate.toISOString().split('T')[0] }
    }
  });
  
  console.log(`Cleaned up ${deleted} old daily stats records`);
  return deleted;
};

module.exports = {
  updateMessageStats,
  getStatsForPeriod,
  cleanupOldStats
};
