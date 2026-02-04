// Twilio SMS provider integration
const twilio = require('twilio');

class TwilioProvider {
  constructor(config) {
    this.client = twilio(config.accountSid, config.authToken);
    this.fromNumber = config.fromNumber;
    this.messagingServiceSid = config.messagingServiceSid;
  }

  async sendMessage(phoneNumber, content, options = {}) {
    try {
      const params = {
        to: phoneNumber,
        body: content
      };
      
      if (this.messagingServiceSid) {
        params.messagingServiceSid = this.messagingServiceSid;
      } else {
        params.from = this.fromNumber;
      }
      
      if (options.statusCallback) {
        params.statusCallback = options.statusCallback;
      }
      
      const message = await this.client.messages.create(params);
      
      return {
        success: true,
        externalId: message.sid,
        status: message.status,
        price: message.price
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  async getMessageStatus(messageSid) {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        externalId: message.sid,
        status: message.status,
        deliveredAt: message.dateSent,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  validateWebhook(body, signature, url) {
    return twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      body
    );
  }
}

module.exports = { TwilioProvider };
