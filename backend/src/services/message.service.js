const { Message, Channel, Merchant, MerchantChannel } = require('../models');
const { calculateMessageCost, deductBalance } = require('./billing.service');
const { selectBestChannel } = require('./channel.service');
const { v4: uuidv4 } = require('uuid');

// Send single message
const sendMessage = async (merchantId, data) => {
  const { phoneNumber, content, messageType = 'sms', callbackUrl, metadata = {} } = data;
  
  // Calculate cost
  const costInfo = await calculateMessageCost(merchantId, phoneNumber, content, messageType);
  
  // Check and deduct balance
  await deductBalance(merchantId, costInfo.totalCost, null, `Message to ${phoneNumber}`);
  
  // Select best channel
  const channel = await selectBestChannel(merchantId, costInfo.countryCode, messageType);
  
  if (!channel) {
    throw new Error('No available channel for this destination');
  }
  
  // Create message record
  const message = await Message.create({
    id: uuidv4(),
    merchantId,
    channelId: channel.id,
    phoneNumber,
    countryCode: costInfo.countryCode,
    messageType,
    content,
    contentLength: content.length,
    segments: costInfo.segments,
    encoding: costInfo.encoding,
    cost: costInfo.totalCost,
    currency: costInfo.currency,
    status: 'queued',
    callbackUrl,
    metadata
  });
  
  // Send via channel provider (async)
  sendViaProvider(message, channel).catch(error => {
    console.error('Failed to send message:', error);
    message.update({ 
      status: 'failed', 
      errorCode: 'SEND_ERROR',
      errorMessage: error.message 
    });
  });
  
  return {
    messageId: message.id,
    status: message.status,
    cost: costInfo.totalCost,
    currency: costInfo.currency,
    segments: costInfo.segments,
    channel: channel.name
  };
};

// Send bulk messages
const sendBulkMessages = async (merchantId, data) => {
  const { recipients, content, messageType = 'sms', callbackUrl } = data;
  
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error('Recipients array required');
  }
  
  if (recipients.length > 10000) {
    throw new Error('Maximum 10,000 recipients per batch');
  }
  
  const results = {
    total: recipients.length,
    queued: 0,
    failed: 0,
    totalCost: 0,
    errors: []
  };
  
  // Process in chunks
  const chunkSize = 100;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize);
    
    for (const phoneNumber of chunk) {
      try {
        const result = await sendMessage(merchantId, {
          phoneNumber,
          content,
          messageType,
          callbackUrl
        });
        results.queued++;
        results.totalCost += result.cost;
      } catch (error) {
        results.failed++;
        results.errors.push({ phoneNumber, error: error.message });
      }
    }
  }
  
  return results;
};

// Send via provider (mock implementation)
const sendViaProvider = async (message, channel) => {
  // Update status to sent
  await message.update({ 
    status: 'sent',
    sentAt: new Date()
  });
  
  // Mock provider integration - replace with actual provider SDK
  const providerResponses = {
    twilio: async (msg, ch) => {
      // Twilio SDK implementation
      return { id: `twilio_${Date.now()}`, status: 'sent' };
    },
    vonage: async (msg, ch) => {
      // Vonage SDK implementation
      return { id: `vonage_${Date.now()}`, status: 'sent' };
    },
    zenvia: async (msg, ch) => {
      // Zenvia SDK implementation
      return { id: `zenvia_${Date.now()}`, status: 'sent' };
    }
  };
  
  const provider = providerResponses[channel.provider];
  if (provider) {
    const response = await provider(message, channel);
    await message.update({ externalId: response.id });
  }
  
  // Simulate delivery (in production, this would be via webhook)
  setTimeout(async () => {
    await message.update({ 
      status: 'delivered',
      deliveredAt: new Date()
    });
    
    // Send callback if configured
    if (message.callbackUrl) {
      sendCallback(message.callbackUrl, {
        messageId: message.id,
        externalId: message.externalId,
        status: 'delivered',
        deliveredAt: message.deliveredAt
      });
    }
  }, 2000);
};

// Send webhook callback
const sendCallback = async (url, data) => {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (error) {
    console.error('Callback failed:', error);
  }
};

// Get message status
const getMessageStatus = async (messageId, merchantId) => {
  const message = await Message.findOne({
    where: { id: messageId, merchantId },
    include: [{ model: Channel, attributes: ['name', 'provider'] }]
  });
  
  if (!message) {
    throw new Error('Message not found');
  }
  
  return {
    id: message.id,
    status: message.status,
    phoneNumber: message.phoneNumber,
    countryCode: message.countryCode,
    messageType: message.messageType,
    content: message.content,
    segments: message.segments,
    cost: message.cost,
    currency: message.currency,
    channel: message.Channel?.name,
    sentAt: message.sentAt,
    deliveredAt: message.deliveredAt,
    errorCode: message.errorCode,
    errorMessage: message.errorMessage
  };
};

// Get message history
const getMessageHistory = async (merchantId, options = {}) => {
  const { page = 1, limit = 20, status, startDate, endDate, phoneNumber } = options;
  
  const where = { merchantId };
  
  if (status) where.status = status;
  if (phoneNumber) where.phoneNumber = { [Op.like]: `%${phoneNumber}%` };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate);
    if (endDate) where.createdAt[Op.lte] = new Date(endDate);
  }
  
  const { count, rows } = await Message.findAndCountAll({
    where,
    include: [{ model: Channel, attributes: ['name', 'provider'] }],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit)
  });
  
  return {
    messages: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / parseInt(limit))
    }
  };
};

// Handle incoming webhook from provider
const handleProviderWebhook = async (provider, data) => {
  const { messageId, status, errorCode, errorMessage } = data;
  
  const message = await Message.findOne({
    where: { externalId: messageId }
  });
  
  if (!message) {
    throw new Error('Message not found');
  }
  
  const updateData = { status };
  
  if (status === 'delivered') {
    updateData.deliveredAt = new Date();
  } else if (status === 'failed') {
    updateData.errorCode = errorCode;
    updateData.errorMessage = errorMessage;
  }
  
  await message.update(updateData);
  
  // Send callback if configured
  if (message.callbackUrl) {
    sendCallback(message.callbackUrl, {
      messageId: message.id,
      externalId: message.externalId,
      status,
      deliveredAt: message.deliveredAt,
      errorCode,
      errorMessage
    });
  }
  
  return { success: true };
};

module.exports = {
  sendMessage,
  sendBulkMessages,
  getMessageStatus,
  getMessageHistory,
  handleProviderWebhook
};
