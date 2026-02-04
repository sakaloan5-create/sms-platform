// Scheduled message processor
const { ScheduledMessage, Message, Transaction, Merchant } = require('../models');
const { sendMessage } = require('./message.service');
const { broadcastMessageStatus } = require('./websocket.service');

// Process pending scheduled messages
const processScheduledMessages = async () => {
  try {
    const now = new Date();
    
    // Find pending messages that are due
    const pendingMessages = await ScheduledMessage.findAll({
      where: {
        status: 'pending',
        scheduledAt: { [require('sequelize').Op.lte]: now }
      },
      include: [{ model: Merchant }]
    });
    
    for (const scheduled of pendingMessages) {
      try {
        await scheduled.update({ status: 'processing' });
        
        const results = { sent: 0, failed: 0, errors: [] };
        
        for (const recipient of scheduled.recipients) {
          try {
            await sendMessage(scheduled.merchantId, {
              phoneNumber: recipient,
              content: scheduled.content,
              messageType: scheduled.type
            });
            results.sent++;
          } catch (error) {
            results.failed++;
            results.errors.push({ recipient, error: error.message });
          }
        }
        
        await scheduled.update({
          status: 'completed',
          processedAt: new Date(),
          result: results
        });
        
        // Notify via WebSocket
        broadcastMessageStatus(scheduled.merchantId, scheduled.id, 'completed', {
          sent: results.sent,
          failed: results.failed
        });
        
      } catch (error) {
        console.error('Error processing scheduled message:', error);
        await scheduled.update({
          status: 'failed',
          processedAt: new Date(),
          result: { error: error.message }
        });
      }
    }
    
    return { processed: pendingMessages.length };
  } catch (error) {
    console.error('Scheduled message processor error:', error);
    return { error: error.message };
  }
};

// Start the scheduler (run every minute)
const startScheduler = () => {
  console.log('Starting scheduled message processor...');
  setInterval(processScheduledMessages, 60000);
};

module.exports = {
  processScheduledMessages,
  startScheduler
};
