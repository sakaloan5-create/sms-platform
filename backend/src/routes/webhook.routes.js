const express = require('express');
const { handleProviderWebhook } = require('../services/message.service');
const router = express.Router();

// Twilio status callback
router.post('/twilio', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;
    
    await handleProviderWebhook('twilio', {
      messageId: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode
    });
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Twilio webhook error:', error);
    res.status(500).send('Error');
  }
});

// Generic provider webhook endpoint
router.post('/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    await handleProviderWebhook(provider, req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error(`Webhook error for ${req.params.provider}:`, error);
    res.status(500).send('Error');
  }
});

module.exports = router;
