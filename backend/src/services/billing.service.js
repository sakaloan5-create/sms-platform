const { Merchant, Transaction, PricingPlan, Message, AuditLog } = require('../models');
const { Op } = require('sequelize');

// Calculate message cost based on content and destination
const calculateMessageCost = async (merchantId, phoneNumber, content, messageType = 'sms') => {
  const phoneUtil = require('libphonenumber-js');
  const phone = phoneUtil.parsePhoneNumber(phoneNumber);
  
  if (!phone || !phone.isValid()) {
    throw new Error('Invalid phone number');
  }
  
  const countryCode = phone.country;
  
  // Detect encoding and segments
  const { segments, encoding } = detectMessageEncoding(content);
  
  // Find pricing - first check merchant-specific pricing
  let pricing = await PricingPlan.findOne({
    where: {
      merchantId,
      countryCode,
      channelType: messageType,
      effectiveDate: { [Op.lte]: new Date() }
    },
    order: [['createdAt', 'DESC']]
  });
  
  // If no merchant-specific pricing, use default
  if (!pricing) {
    pricing = await PricingPlan.findOne({
      where: {
        merchantId: null,
        countryCode,
        channelType: messageType,
        isDefault: true
      }
    });
  }
  
  // If still no pricing, use fallback
  if (!pricing) {
    pricing = {
      pricePerSms: messageType === 'rcs' ? 0.08 : 0.05,
      currency: 'USD'
    };
  }
  
  const unitPrice = messageType === 'rcs' 
    ? (pricing.pricePerRcs || pricing.pricePerSms * 1.5)
    : pricing.pricePerSms;
  
  const totalCost = unitPrice * segments;
  
  return {
    countryCode,
    segments,
    encoding,
    unitPrice,
    totalCost: parseFloat(totalCost.toFixed(6)),
    currency: pricing.currency || 'USD'
  };
};

// Detect SMS encoding and segments
const detectMessageEncoding = (message) => {
  // GSM-7 character set
  const gsm7Chars = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%\u0026\'()*+,-./0123456789:;\u003c=\u003e?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  
  let isGsm7 = true;
  for (let char of message) {
    if (!gsm7Chars.includes(char)) {
      isGsm7 = false;
      break;
    }
  }
  
  const maxChars = isGsm7 ? 160 : 70;
  const maxConcatChars = isGsm7 ? 153 : 67;
  
  if (message.length <= maxChars) {
    return { segments: 1, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' };
  } else {
    const segments = Math.ceil(message.length / maxConcatChars);
    return { segments, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' };
  }
};

// Deduct balance for message
const deductBalance = async (merchantId, amount, messageId, description) => {
  const merchant = await Merchant.findByPk(merchantId);
  
  if (!merchant) {
    throw new Error('Merchant not found');
  }
  
  const newBalance = parseFloat(merchant.balance) - parseFloat(amount);
  
  // Check if balance + credit limit is sufficient
  const availableCredit = parseFloat(merchant.balance) + parseFloat(merchant.creditLimit);
  if (availableCredit < amount) {
    throw new Error('Insufficient balance');
  }
  
  // Update balance
  await merchant.update({ balance: newBalance });
  
  // Create transaction record
  const transaction = await Transaction.create({
    merchantId,
    type: 'deduction',
    amount: -amount,
    balanceAfter: newBalance,
    currency: 'USD',
    description,
    referenceId: messageId,
    referenceType: 'message'
  });
  
  return transaction;
};

// Recharge balance (admin only)
const rechargeBalance = async (merchantId, amount, adminId, description) => {
  const merchant = await Merchant.findByPk(merchantId);
  
  if (!merchant) {
    throw new Error('Merchant not found');
  }
  
  const newBalance = parseFloat(merchant.balance) + parseFloat(amount);
  await merchant.update({ balance: newBalance });
  
  const transaction = await Transaction.create({
    merchantId,
    type: 'recharge',
    amount,
    balanceAfter: newBalance,
    currency: 'USD',
    description,
    createdBy: adminId
  });
  
  await AuditLog.create({
    userId: adminId,
    userType: 'admin',
    action: 'RECHARGE',
    resourceType: 'merchant',
    resourceId: merchantId,
    newValue: { amount, newBalance }
  });
  
  return transaction;
};

// Get merchant balance and stats
const getBalance = async (merchantId) => {
  const merchant = await Merchant.findByPk(merchantId, {
    attributes: ['id', 'balance', 'creditLimit', 'currency']
  });
  
  if (!merchant) {
    throw new Error('Merchant not found');
  }
  
  // Get today's spending
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todaySpending = await Transaction.sum('amount', {
    where: {
      merchantId,
      type: 'deduction',
      createdAt: { [Op.gte]: today }
    }
  });
  
  // Get this month's spending
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  
  const monthSpending = await Transaction.sum('amount', {
    where: {
      merchantId,
      type: 'deduction',
      createdAt: { [Op.gte]: monthStart }
    }
  });
  
  return {
    balance: parseFloat(merchant.balance),
    creditLimit: parseFloat(merchant.creditLimit),
    availableCredit: parseFloat(merchant.balance) + parseFloat(merchant.creditLimit),
    currency: merchant.currency || 'USD',
    todaySpending: Math.abs(parseFloat(todaySpending || 0)),
    monthSpending: Math.abs(parseFloat(monthSpending || 0))
  };
};

// Get transaction history
const getTransactions = async (merchantId, options = {}) => {
  const { page = 1, limit = 20, type, startDate, endDate } = options;
  
  const where = { merchantId };
  
  if (type) where.type = type;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate);
    if (endDate) where.createdAt[Op.lte] = new Date(endDate);
  }
  
  const { count, rows } = await Transaction.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit)
  });
  
  return {
    transactions: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / parseInt(limit))
    }
  };
};

// Refund a message
const refundMessage = async (messageId, adminId, reason) => {
  const message = await Message.findByPk(messageId);
  
  if (!message) {
    throw new Error('Message not found');
  }
  
  if (message.status === 'refunded') {
    throw new Error('Message already refunded');
  }
  
  const merchant = await Merchant.findByPk(message.merchantId);
  const newBalance = parseFloat(merchant.balance) + parseFloat(message.cost);
  
  await merchant.update({ balance: newBalance });
  await message.update({ status: 'refunded' });
  
  const transaction = await Transaction.create({
    merchantId: message.merchantId,
    type: 'refund',
    amount: message.cost,
    balanceAfter: newBalance,
    currency: message.currency,
    description: `Refund for message ${messageId}: ${reason}`,
    referenceId: messageId,
    referenceType: 'message',
    createdBy: adminId
  });
  
  await AuditLog.create({
    userId: adminId,
    userType: 'admin',
    action: 'REFUND',
    resourceType: 'message',
    resourceId: messageId,
    newValue: { amount: message.cost, reason }
  });
  
  return transaction;
};

module.exports = {
  calculateMessageCost,
  detectMessageEncoding,
  deductBalance,
  rechargeBalance,
  getBalance,
  getTransactions,
  refundMessage
};
