// Billing service - calculates message cost
const { Channel } = require('../models');
const libphonenumber = require('libphonenumber-js');

// Calculate message cost
const calculateMessageCost = async (merchantId, phoneNumber, content, messageType = 'sms') => {
  // Detect country code from phone number
  const phoneInfo = libphonenumber.parsePhoneNumber(phoneNumber);
  const countryCode = phoneInfo?.country || 'US';
  
  // Calculate segments
  const isUnicode = /[^\x00-\x7F]/.test(content);
  const encoding = isUnicode ? 'ucs2' : 'gsm7';
  const maxLength = isUnicode ? 70 : 160;
  const segments = Math.ceil(content.length / maxLength);
  
  // Get channel pricing
  const channel = await Channel.findOne({
    where: { type: messageType, status: 'active' }
  });
  
  const basePrice = channel?.basePrice || 0.05;
  
  // Calculate total cost (can add country-specific pricing here)
  const countryMultiplier = getCountryMultiplier(countryCode);
  const pricePerSegment = basePrice * countryMultiplier;
  const totalCost = segments * pricePerSegment;
  
  return {
    countryCode,
    segments,
    encoding,
    pricePerSegment,
    totalCost: parseFloat(totalCost.toFixed(6)),
    currency: 'USD'
  };
};

// Get pricing multiplier by country
const getCountryMultiplier = (countryCode) => {
  // Premium countries (more expensive)
  const premiumCountries = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'JP'];
  const standardCountries = ['CN', 'HK', 'TW', 'SG', 'MY', 'TH', 'ID', 'PH', 'VN', 'IN', 'BR', 'MX', 'AR', 'CL', 'PE', 'CO', 'ZA', 'NG', 'KE', 'EG'];
  
  if (premiumCountries.includes(countryCode)) return 1.0;
  if (standardCountries.includes(countryCode)) return 0.8;
  return 1.2; // Other countries might be more expensive
};

// Deduct balance
const deductBalance = async (merchantId, amount, messageId, description) => {
  const { Merchant, Transaction } = require('../models');
  
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) throw new Error('Merchant not found');
  
  const available = parseFloat(merchant.balance) + parseFloat(merchant.creditLimit);
  if (available < amount) {
    throw new Error('Insufficient balance');
  }
  
  const newBalance = parseFloat(merchant.balance) - amount;
  await merchant.update({ balance: newBalance });
  
  // Create transaction record
  await Transaction.create({
    merchantId,
    type: 'debit',
    amount: -amount,
    balance: newBalance,
    description,
    referenceId: messageId,
    status: 'completed'
  });
  
  return { newBalance };
};

// Credit balance (for refunds)
const creditBalance = async (merchantId, amount, messageId, description) => {
  const { Merchant, Transaction } = require('../models');
  
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) throw new Error('Merchant not found');
  
  const newBalance = parseFloat(merchant.balance) + amount;
  await merchant.update({ balance: newBalance });
  
  await Transaction.create({
    merchantId,
    type: 'credit',
    amount,
    balance: newBalance,
    description,
    referenceId: messageId,
    status: 'completed'
  });
  
  return { newBalance };
};

module.exports = {
  calculateMessageCost,
  getCountryMultiplier,
  deductBalance,
  creditBalance
};
