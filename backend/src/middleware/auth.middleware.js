const jwt = require('jsonwebtoken');
const { Merchant } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const merchant = await Merchant.findByPk(decoded.id);

    if (!merchant) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (merchant.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    req.user = merchant;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
