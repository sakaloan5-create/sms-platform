// Channel service - select best channel for message delivery
const { Channel, Merchant } = require('../models');

// Select best channel for a message
const selectBestChannel = async (merchantId, countryCode, messageType = 'sms') => {
  // Get all active channels for the message type
  const channels = await Channel.findAll({
    where: {
      type: messageType,
      status: 'active'
    }
  });
  
  if (channels.length === 0) {
    return null;
  }
  
  // Priority order:
  // 1. Country-specific channel
  // 2. General purpose channel with best price
  // 3. Any available channel
  
  let bestChannel = channels[0];
  
  for (const channel of channels) {
    const config = channel.config || {};
    
    // Check if channel supports this country
    if (config.supportedCountries?.includes(countryCode)) {
      return channel;
    }
    
    // Check if this is a better general purpose channel (lower price)
    if (parseFloat(channel.basePrice) < parseFloat(bestChannel.basePrice)) {
      bestChannel = channel;
    }
  }
  
  return bestChannel;
};

// Get all available channels for merchant
const getAvailableChannels = async (merchantId) => {
  return await Channel.findAll({
    where: { status: 'active' },
    attributes: ['id', 'name', 'provider', 'type', 'basePrice', 'config']
  });
};

// Get channel by ID
const getChannel = async (channelId) => {
  return await Channel.findByPk(channelId);
};

module.exports = {
  selectBestChannel,
  getAvailableChannels,
  getChannel
};
