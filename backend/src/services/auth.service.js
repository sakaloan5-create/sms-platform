const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Merchant, AuditLog } = require('../models');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Hash password
const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// Register new merchant
const registerMerchant = async (data) => {
  const { email, password, name, phone, defaultLanguage = 'en' } = data;
  
  // Check if email exists
  const existingMerchant = await Merchant.findOne({ where: { email } });
  if (existingMerchant) {
    throw new Error('Email already registered');
  }
  
  // Hash password
  const hashedPassword = await hashPassword(password);
  
  // Generate API credentials
  const apiKey = require('crypto').randomBytes(32).toString('hex');
  const apiSecret = require('crypto').randomBytes(32).toString('hex');
  
  // Create merchant
  const merchant = await Merchant.create({
    email,
    password: hashedPassword,
    name,
    phone,
    defaultLanguage,
    status: 'pending',
    apiKey,
    apiSecret: await hashPassword(apiSecret)
  });
  
  // Log audit
  await AuditLog.create({
    userId: merchant.id,
    userType: 'merchant',
    action: 'REGISTER',
    resourceType: 'merchant',
    resourceId: merchant.id,
    newValue: { email, name, status: 'pending' }
  });
  
  return {
    id: merchant.id,
    email: merchant.email,
    name: merchant.name,
    status: merchant.status,
    apiKey,
    apiSecret // Only shown once during registration
  };
};

// Login
const login = async (email, password, ipAddress, userAgent) => {
  const merchant = await Merchant.findOne({ where: { email } });
  
  if (!merchant) {
    throw new Error('Invalid credentials');
  }
  
  if (merchant.status === 'suspended') {
    throw new Error('Account suspended');
  }
  
  const isValidPassword = await comparePassword(password, merchant.password);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }
  
  // Update last login
  await merchant.update({ lastLoginAt: new Date() });
  
  // Generate token
  const token = generateToken({
    id: merchant.id,
    email: merchant.email,
    role: merchant.role,
    name: merchant.name
  });
  
  // Log audit
  await AuditLog.create({
    userId: merchant.id,
    userType: merchant.role,
    action: 'LOGIN',
    resourceType: 'merchant',
    resourceId: merchant.id,
    ipAddress,
    userAgent
  });
  
  return {
    token,
    user: {
      id: merchant.id,
      email: merchant.email,
      name: merchant.name,
      role: merchant.role,
      balance: merchant.balance,
      defaultLanguage: merchant.defaultLanguage
    }
  };
};

// Admin login
const adminLogin = async (email, password, ipAddress, userAgent) => {
  const admin = await Merchant.findOne({ 
    where: { email, role: 'admin' } 
  });
  
  if (!admin) {
    throw new Error('Invalid credentials');
  }
  
  const isValidPassword = await comparePassword(password, admin.password);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }
  
  const token = generateToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    name: admin.name
  });
  
  await AuditLog.create({
    userId: admin.id,
    userType: 'admin',
    action: 'ADMIN_LOGIN',
    resourceType: 'admin',
    resourceId: admin.id,
    ipAddress,
    userAgent
  });
  
  return {
    token,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    }
  };
};

// Verify token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Refresh token
const refreshToken = async (token) => {
  const decoded = verifyToken(token);
  const merchant = await Merchant.findByPk(decoded.id);
  
  if (!merchant || merchant.status !== 'active') {
    throw new Error('Account not active');
  }
  
  const newToken = generateToken({
    id: merchant.id,
    email: merchant.email,
    role: merchant.role,
    name: merchant.name
  });
  
  return { token: newToken };
};

// Change password
const changePassword = async (merchantId, oldPassword, newPassword) => {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) {
    throw new Error('Merchant not found');
  }
  
  const isValidPassword = await comparePassword(oldPassword, merchant.password);
  if (!isValidPassword) {
    throw new Error('Invalid current password');
  }
  
  const hashedPassword = await hashPassword(newPassword);
  await merchant.update({ password: hashedPassword });
  
  await AuditLog.create({
    userId: merchant.id,
    userType: merchant.role,
    action: 'CHANGE_PASSWORD',
    resourceType: 'merchant',
    resourceId: merchant.id
  });
  
  return { success: true };
};

// Regenerate API keys
const regenerateApiKeys = async (merchantId) => {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) {
    throw new Error('Merchant not found');
  }
  
  const apiKey = require('crypto').randomBytes(32).toString('hex');
  const apiSecret = require('crypto').randomBytes(32).toString('hex');
  
  await merchant.update({
    apiKey,
    apiSecret: await hashPassword(apiSecret)
  });
  
  await AuditLog.create({
    userId: merchant.id,
    userType: merchant.role,
    action: 'REGENERATE_API_KEYS',
    resourceType: 'merchant',
    resourceId: merchant.id
  });
  
  return { apiKey, apiSecret };
};

module.exports = {
  generateToken,
  hashPassword,
  comparePassword,
  registerMerchant,
  login,
  adminLogin,
  verifyToken,
  refreshToken,
  changePassword,
  regenerateApiKeys,
  JWT_SECRET
};
