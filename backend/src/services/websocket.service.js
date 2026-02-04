// WebSocket service for real-time updates
let io = null;

const initWebSocket = (socketIo) => {
  io = socketIo;
  
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Join merchant room for targeted updates
    socket.on('join', (merchantId) => {
      socket.join(`merchant_${merchantId}`);
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};

const notifyMerchant = (merchantId, event, data) => {
  if (io) {
    io.to(`merchant_${merchantId}`).emit(event, data);
  }
};

const notifyAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

const broadcastMessageStatus = (merchantId, messageId, status, details = {}) => {
  notifyMerchant(merchantId, 'message:status', { messageId, status, ...details });
};

const broadcastBalanceUpdate = (merchantId, balance) => {
  notifyMerchant(merchantId, 'balance:update', { balance });
};

module.exports = {
  initWebSocket,
  notifyMerchant,
  notifyAll,
  broadcastMessageStatus,
  broadcastBalanceUpdate
};
