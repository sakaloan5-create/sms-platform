const { Message, Channel, Merchant } = require('../models');
const { Op } = require('sequelize');
const { calculateMessageCost, deductBalance } = require('./billing.service');
const { selectBestChannel } = require('./channel.service');
const { broadcastMessageStatus, broadcastBalanceUpdate } = require('./websocket.service');
const { TwilioProvider } = require('../providers/twilio.provider');
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

// Send via provider
const sendViaProvider = async (message, channel) => {
  try {
    let provider;
    const config = channel.config || {};
    
    // Initialize appropriate provider
    switch (channel.provider) {
      case 'twilio':
        provider = new TwilioProvider(config);
        break;
      default:
        // Fallback to mock for unsupported providers
        console.warn(`Provider ${channel.provider} not implemented, using mock`);
        await mockSend(message);
        return;
    }
    
    // Update status to sent
    await message.update({ 
      status: 'sent',
      sentAt: new Date()
    });
    
    // Broadcast status update
    broadcastMessageStatus(message.merchantId, message.id, 'sent');
    
    // Send via provider
    const result = await provider.sendMessage(
      message.phoneNumber,
      message.content,
      { statusCallback: config.webhookUrl }
    );
    
    if (result.success) {
      await message.update({ externalId: result.externalId });
      
      // If synchronous delivery confirmation
      if (result.status === 'delivered') {
        await message.update({ 
          status: 'delivered',
          deliveredAt: new Date()
        });
        broadcastMessageStatus(message.merchantId, message.id, 'delivered');
      }
    } else {
      await message.update({ 
        status: 'failed',
        errorCode: result.code,
        errorMessage: result.error
      });
      broadcastMessageStatus(message.merchantId, message.id, 'failed', {
        error: result.error
      });
      
      // Refund on failure
      const merchant = await Merchant.findByPk(message.merchantId);
      const newBalance = parseFloat(merchant.balance) + parseFloat(message.cost);
      await merchant.update({ balance: newBalance });
      broadcastBalanceUpdate(message.merchantId, newBalance);
    }
    
  } catch (error) {
    console.error('Send via provider failed:', error);
    await message.update({ 
      status: 'failed',
      errorCode: 'PROVIDER_ERROR',
      errorMessage: error.message
    });
    broadcastMessageStatus(message.merchantId, message.id, 'failed', {
      error: error.message
    });
  }
};

// Mock send for testing
const mockSend = async (message) => {
  await message.update({ 
    status: 'sent',
    sentAt: new Date(),
    externalId: `mock_${Date.now()}`
  });
  
  broadcastMessageStatus(message.merchantId, message.id, 'sent');
  
  setTimeout(async () => {
    await message.update({ 
      status: 'delivered',
      deliveredAt: new Date()
    });
    broadcastMessageStatus(message.merchantId, message.id, 'delivered');
    
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
    
    // Refund on failure
    const merchant = await Merchant.findByPk(message.merchantId);
    const newBalance = parseFloat(merchant.balance) + parseFloat(message.cost);
    await merchant.update({ balance: newBalance });
    broadcastBalanceUpdate(message.merchantId, newBalance);
  }
  
  await message.update(updateData);
  
  // Broadcast via WebSocket
  broadcastMessageStatus(message.merchantId, message.id, status, {
    errorCode,
    errorMessage
  });
  
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
