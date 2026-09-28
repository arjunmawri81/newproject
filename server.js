const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const { declareAndSettleResult, getMarketExposure } = require('./settlement');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'satta-king-secure-secret-key-2026';

app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Production In-Memory Rate Limiter (Sliding Window per IP)
const rateLimitMap = new Map();
function createRateLimiter(windowMs, maxRequests, message = 'Too many requests, please try again later.') {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const key = `${req.baseUrl || ''}${req.path}_${ip}`;
    
    let record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitMap.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const authLimiter = createRateLimiter(60 * 1000, 40, 'Too many attempts. Please slow down.');
const withdrawLimiter = createRateLimiter(60 * 1000, 20, 'Too many withdrawal attempts. Please wait a minute.');
const betLimiter = createRateLimiter(60 * 1000, 100, 'Bet placement rate limit reached. Please slow down.');

// Helper to format Date as YYYY-MM-DD in local time
function getTodayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get current HH:MM in 24-hr format
function getCurrentTimeStr() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Check if a market is currently open for bets
function isMarketOpen(market) {
  if (market.manualOverride === 'force_open') return true;
  if (market.manualOverride === 'force_closed') return false;

  const nowTime = getCurrentTimeStr();
  const close = market.closeTime;
  const open = market.openTime || '06:00';

  if (open <= close) {
    // Normal same-day window e.g. 06:00 to 17:45
    return nowTime >= open && nowTime < close;
  } else {
    // Overnight window e.g. open at 18:00, close at 04:30 next morning
    return nowTime >= open || nowTime < close;
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    const data = db.get();
    const user = data.users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ======================== AUTH ROUTES ========================

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { username, phone, password } = req.body;

  if (!username || !phone || !password) {
    return res.status(400).json({ error: 'Username, phone number, and password are required.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanPhone = phone.trim();

  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  const data = db.get();
  if (data.users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ error: 'Username already taken. Please choose another.' });
  }
  if (data.users.some(u => u.phone === cleanPhone)) {
    return res.status(400).json({ error: 'Phone number already registered. Please login.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = {
    id: 'user_' + uuidv4().substring(0, 8),
    username: cleanUsername,
    phone: cleanPhone,
    password: hashedPassword,
    role: 'user',
    balance: 5000, // Welcome Demo Bonus for instant play
    createdAt: new Date().toISOString()
  };

  data.users.push(newUser);

  // Record initial welcome bonus transaction
  data.transactions.push({
    id: uuidv4(),
    userId: newUser.id,
    username: newUser.username,
    type: 'deposit',
    amount: 5000,
    balanceAfter: 5000,
    description: 'Welcome Bonus Credit',
    createdAt: new Date().toISOString()
  });

  db.save();

  const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    message: 'Registration successful! Welcome bonus of ₹5,000 credited.',
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      phone: newUser.phone,
      role: newUser.role,
      balance: newUser.balance
    }
  });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { usernameOrPhone, password } = req.body;

  if (!usernameOrPhone || !password) {
    return res.status(400).json({ error: 'Username/Phone and password are required.' });
  }

  const data = db.get();
  const query = usernameOrPhone.trim().toLowerCase();
  const user = data.users.find(u => u.username.toLowerCase() === query || u.phone === usernameOrPhone.trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username/phone or password.' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    message: 'Logged in successfully.',
    token,
    user: {
      id: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      balance: user.balance
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      phone: req.user.phone,
      role: req.user.role,
      balance: req.user.balance
    }
  });
});

// ======================== MARKETS & LIVE RESULTS ========================

app.get('/api/markets', (req, res) => {
  const data = db.get();
  const today = getTodayDateStr();
  const currentTime = getCurrentTimeStr();

  const enrichedMarkets = data.markets.map(m => {
    const open = isMarketOpen(m);
    
    // Find today's result if declared
    const todayResult = data.results.find(r => r.marketId === m.id && r.date === today);

    return {
      ...m,
      isOpen: open,
      currentTime,
      todayResult: todayResult ? todayResult.resultNumber : null,
      resultDeclared: !!todayResult,
      declaredAt: todayResult ? todayResult.declaredAt : null
    };
  });

  res.json({
    today,
    currentTime,
    markets: enrichedMarkets
  });
});

// Full historical result chart
app.get('/api/results/chart', (req, res) => {
  const data = db.get();
  const days = parseInt(req.query.days || '30', 10);
  
  // Sort results by date desc
  const results = [...data.results].sort((a, b) => b.date.localeCompare(a.date));
  res.json({ results });
});

// ======================== BETTING ROUTES ========================

app.post('/api/bets/place', authenticateToken, betLimiter, (req, res) => {
  const { marketId, items } = req.body;

  if (!marketId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Market and at least one bet item are required.' });
  }

  const data = db.get();
  const market = data.markets.find(m => m.id === marketId);
  if (!market) {
    return res.status(404).json({ error: 'Invalid market.' });
  }

  // Verify market is open
  if (!isMarketOpen(market)) {
    return res.status(400).json({ error: `Betting is closed for ${market.name}. Close time was ${market.closeTime}.` });
  }

  // Calculate total amount & validate items
  let totalBetAmount = 0;
  const validatedItems = [];

  for (const item of items) {
    const amount = parseInt(item.amount, 10);
    if (isNaN(amount) || amount < 5) {
      return res.status(400).json({ error: 'Minimum bet amount is ₹5 per entry.' });
    }

    const betType = item.betType;
    let number = String(item.number).trim();

    if (betType === 'jodi') {
      if (!/^\d{1,2}$/.test(number)) {
        return res.status(400).json({ error: `Invalid Jodi number: ${number}. Must be 00-99.` });
      }
      number = number.padStart(2, '0');
    } else if (betType === 'haruf_andar' || betType === 'haruf_bahar') {
      if (!/^\d$/.test(number)) {
        return res.status(400).json({ error: `Invalid Haruf number: ${number}. Must be 0-9.` });
      }
    } else {
      return res.status(400).json({ error: `Invalid bet type: ${betType}.` });
    }

    totalBetAmount += amount;
    validatedItems.push({
      betType,
      number,
      amount
    });
  }

  // Check user balance
  if (req.user.balance < totalBetAmount) {
    return res.status(400).json({
      error: `Insufficient balance! Total bet: ₹${totalBetAmount}, your current balance is ₹${req.user.balance}. Please add funds.`
    });
  }

  // Deduct balance atomically
  req.user.balance -= totalBetAmount;

  const today = getTodayDateStr();
  const createdBets = [];

  for (const item of validatedItems) {
    const rate = item.betType === 'jodi' ? (market.jodiRate || 90) : (market.harufRate || 9);
    const potentialWin = item.amount * rate;

    const newBet = {
      id: 'bet_' + uuidv4().substring(0, 10),
      userId: req.user.id,
      username: req.user.username,
      marketId: market.id,
      marketName: market.name,
      date: today,
      betType: item.betType,
      number: item.number,
      amount: item.amount,
      rate,
      potentialWin,
      status: 'pending',
      winAmount: 0,
      createdAt: new Date().toISOString()
    };

    data.bets.push(newBet);
    createdBets.push(newBet);
  }

  // Record ledger transaction
  data.transactions.push({
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    type: 'bet_placed',
    amount: -totalBetAmount,
    balanceAfter: req.user.balance,
    description: `Placed ${validatedItems.length} bet(s) in ${market.name}`,
    createdAt: new Date().toISOString()
  });

  db.save();

  res.json({
    message: `Successfully placed ${validatedItems.length} bet(s) totaling ₹${totalBetAmount}!`,
    newBalance: req.user.balance,
    bets: createdBets
  });
});

// View user's bet history
app.get('/api/bets/my-bets', authenticateToken, (req, res) => {
  const data = db.get();
  const { date, marketId, status } = req.query;

  let userBets = data.bets.filter(b => b.userId === req.user.id);

  if (date) {
    userBets = userBets.filter(b => b.date === date);
  }
  if (marketId) {
    userBets = userBets.filter(b => b.marketId === marketId);
  }
  if (status) {
    userBets = userBets.filter(b => b.status === status);
  }

  // Sort latest first
  userBets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    totalBets: userBets.length,
    bets: userBets
  });
});

// ======================== WALLET ROUTES ========================

app.get('/api/wallet/transactions', authenticateToken, (req, res) => {
  const data = db.get();
  const userTx = data.transactions
    .filter(t => t.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    balance: req.user.balance,
    transactions: userTx
  });
});

// Demo wallet refill for testing
app.post('/api/wallet/add-demo', authenticateToken, (req, res) => {
  const amount = parseInt(req.body.amount || '5000', 10);
  if (amount <= 0 || amount > 50000) {
    return res.status(400).json({ error: 'Amount must be between ₹100 and ₹50,000.' });
  }

  req.user.balance = (req.user.balance || 0) + amount;

  const data = db.get();
  data.transactions.push({
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    type: 'deposit',
    amount: amount,
    balanceAfter: req.user.balance,
    description: `Demo Wallet Refill (+₹${amount})`,
    createdAt: new Date().toISOString()
  });

  db.save();

  res.json({
    message: `₹${amount} added to your wallet!`,
    newBalance: req.user.balance
  });
});

// Instant User Withdrawal Request
app.post('/api/wallet/withdraw', authenticateToken, withdrawLimiter, (req, res) => {
  const { amount, paymentMethod, upiId, bankAccount, ifsc, accountHolder } = req.body;
  
  const withdrawAmount = parseInt(amount, 10);
  if (isNaN(withdrawAmount) || withdrawAmount < 100 || withdrawAmount > 100000) {
    return res.status(400).json({ error: 'Withdrawal amount must be between ₹100 and ₹1,00,000.' });
  }

  if (req.user.balance < withdrawAmount) {
    return res.status(400).json({
      error: `Insufficient balance! You requested ₹${withdrawAmount}, but your wallet balance is ₹${req.user.balance}.`
    });
  }

  const method = (paymentMethod || 'upi').toLowerCase();
  let paymentDetails = {};

  if (method === 'upi') {
    if (!upiId || typeof upiId !== 'string' || !upiId.includes('@') || upiId.trim().length < 5) {
      return res.status(400).json({ error: 'Please enter a valid UPI ID (e.g. 9876543210@paytm or name@oksbi).' });
    }
    paymentDetails = { upiId: upiId.trim() };
  } else if (method === 'bank') {
    if (!bankAccount || bankAccount.trim().length < 8) {
      return res.status(400).json({ error: 'Please enter a valid bank account number (min 8 digits).' });
    }
    if (!ifsc || ifsc.trim().length < 4) {
      return res.status(400).json({ error: 'Please enter a valid Bank IFSC code.' });
    }
    paymentDetails = {
      bankAccount: bankAccount.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      accountHolder: (accountHolder || req.user.username).trim()
    };
  } else {
    return res.status(400).json({ error: 'Invalid payment method. Choose UPI or Bank Transfer.' });
  }

  // Deduct balance instantly to protect the house liability
  req.user.balance -= withdrawAmount;

  const data = db.get();
  if (!data.withdrawals) data.withdrawals = [];

  const withdrawalId = 'wd_' + uuidv4().substring(0, 8);
  const newWithdrawal = {
    id: withdrawalId,
    userId: req.user.id,
    username: req.user.username,
    phone: req.user.phone,
    amount: withdrawAmount,
    method,
    paymentDetails,
    status: 'pending', // 'pending' | 'completed' | 'rejected'
    createdAt: new Date().toISOString(),
    processedAt: null,
    processedBy: null,
    notes: ''
  };

  data.withdrawals.push(newWithdrawal);

  // Add ledger transaction
  const detailStr = method === 'upi' ? `UPI: ${paymentDetails.upiId}` : `A/C: ${paymentDetails.bankAccount} (${paymentDetails.ifsc})`;
  data.transactions.push({
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    type: 'withdrawal',
    amount: -withdrawAmount,
    balanceAfter: req.user.balance,
    description: `Withdrawal Request (${detailStr}) [ID: ${withdrawalId}]`,
    createdAt: new Date().toISOString()
  });

  db.save();

  res.json({
    message: `Withdrawal request for ₹${withdrawAmount} submitted! Amount debited from wallet.`,
    newBalance: req.user.balance,
    withdrawal: newWithdrawal
  });
});

// View user's withdrawal requests
app.get('/api/wallet/withdrawals', authenticateToken, (req, res) => {
  const data = db.get();
  const list = (data.withdrawals || [])
    .filter(w => w.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    withdrawals: list
  });
});

// ======================== ADMIN ROUTES ========================

// 1. Declare Result with Auto Settlement Engine
app.post('/api/admin/declare-result', authenticateToken, requireAdmin, (req, res) => {
  const { marketId, date, resultNumber } = req.body;

  if (!marketId || !date || resultNumber === undefined || resultNumber === '') {
    return res.status(400).json({ error: 'Market, Date, and 2-digit Result Number are required.' });
  }

  try {
    const summary = declareAndSettleResult(marketId, date, resultNumber, req.user.username);
    res.json({
      message: `Result ${summary.resultNumber} declared for ${summary.market}! ${summary.totalWinners} winner(s) automatically credited ₹${summary.totalPayout}.`,
      summary
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. View Live Exposure / Book Liability Sheet
app.get('/api/admin/exposure', authenticateToken, requireAdmin, (req, res) => {
  const { marketId, date } = req.query;
  const targetDate = date || getTodayDateStr();

  if (!marketId) {
    return res.status(400).json({ error: 'marketId query param required.' });
  }

  const exposure = getMarketExposure(marketId, targetDate);
  if (!exposure) {
    return res.status(404).json({ error: 'Market not found.' });
  }

  res.json(exposure);
});

// 3. View All Bets (Admin overview)
app.get('/api/admin/all-bets', authenticateToken, requireAdmin, (req, res) => {
  const data = db.get();
  const { date, marketId, status } = req.query;

  let allBets = [...data.bets];
  if (date) allBets = allBets.filter(b => b.date === date);
  if (marketId) allBets = allBets.filter(b => b.marketId === marketId);
  if (status) allBets = allBets.filter(b => b.status === status);

  allBets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ bets: allBets });
});

// 4. View All Users
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const data = db.get();
  const usersSummary = data.users.map(u => {
    const userBets = data.bets.filter(b => b.userId === u.id);
    const totalBetAmount = userBets.reduce((acc, b) => acc + b.amount, 0);
    const totalWonAmount = userBets.filter(b => b.status === 'won').reduce((acc, b) => acc + b.winAmount, 0);

    return {
      id: u.id,
      username: u.username,
      phone: u.phone,
      role: u.role,
      balance: u.balance,
      createdAt: u.createdAt,
      totalBetsPlaced: userBets.length,
      totalBetAmount,
      totalWonAmount
    };
  });

  res.json({ users: usersSummary });
});

// 5. Adjust User Balance (Credit/Debit)
app.post('/api/admin/adjust-balance', authenticateToken, requireAdmin, (req, res) => {
  const { userId, amount, description } = req.body;

  const adjAmount = parseInt(amount, 10);
  if (isNaN(adjAmount) || adjAmount === 0) {
    return res.status(400).json({ error: 'Valid adjustment amount required.' });
  }

  const data = db.get();
  const user = data.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (user.balance + adjAmount < 0) {
    return res.status(400).json({ error: 'Balance cannot be negative.' });
  }

  user.balance += adjAmount;

  data.transactions.push({
    id: uuidv4(),
    userId: user.id,
    username: user.username,
    type: 'admin_adjustment',
    amount: adjAmount,
    balanceAfter: user.balance,
    description: description || `Admin adjustment by ${req.user.username}`,
    createdAt: new Date().toISOString()
  });

  db.save();

  res.json({
    message: `Balance updated for ${user.username}. New balance: ₹${user.balance}`,
    user: {
      id: user.id,
      username: user.username,
      balance: user.balance
    }
  });
});

// 6. Update Market Settings (Timings, Rates, Manual Override)
app.put('/api/admin/markets/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { openTime, closeTime, resultTime, jodiRate, harufRate, manualOverride } = req.body;

  const data = db.get();
  const market = data.markets.find(m => m.id === id);
  if (!market) {
    return res.status(404).json({ error: 'Market not found.' });
  }

  if (openTime !== undefined) market.openTime = openTime;
  if (closeTime !== undefined) market.closeTime = closeTime;
  if (resultTime !== undefined) market.resultTime = resultTime;
  if (jodiRate !== undefined) market.jodiRate = parseInt(jodiRate, 10);
  if (harufRate !== undefined) market.harufRate = parseInt(harufRate, 10);
  if (manualOverride !== undefined) market.manualOverride = manualOverride; // 'force_open', 'force_closed', or null

  db.save();

  res.json({
    message: `Settings updated for ${market.name}.`,
    market
  });
});

// 7. Admin View All Withdrawals
app.get('/api/admin/withdrawals', authenticateToken, requireAdmin, (req, res) => {
  const data = db.get();
  const { status, search } = req.query;
  let list = [...(data.withdrawals || [])];

  if (status && status !== 'all') {
    list = list.filter(w => w.status === status);
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(w => 
      w.username.toLowerCase().includes(q) ||
      (w.phone && w.phone.includes(q)) ||
      (w.paymentDetails?.upiId && w.paymentDetails.upiId.toLowerCase().includes(q)) ||
      (w.paymentDetails?.bankAccount && w.paymentDetails.bankAccount.includes(q)) ||
      w.id.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const allWd = data.withdrawals || [];
  const pendingCount = allWd.filter(w => w.status === 'pending').length;
  const pendingAmount = allWd.filter(w => w.status === 'pending').reduce((sum, w) => sum + w.amount, 0);
  const completedAmount = allWd.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0);

  res.json({
    withdrawals: list,
    stats: {
      totalRequests: allWd.length,
      pendingCount,
      pendingAmount,
      completedAmount
    }
  });
});

// 8. Admin Approve or Reject/Refund Withdrawal
app.post('/api/admin/withdrawals/:id/action', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body; // action: 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be approve or reject.' });
  }

  const data = db.get();
  if (!data.withdrawals) data.withdrawals = [];
  const withdrawal = data.withdrawals.find(w => w.id === id);

  if (!withdrawal) {
    return res.status(404).json({ error: 'Withdrawal request not found.' });
  }

  if (withdrawal.status !== 'pending') {
    return res.status(400).json({ error: `Withdrawal has already been marked as ${withdrawal.status}.` });
  }

  const user = data.users.find(u => u.id === withdrawal.userId);

  if (action === 'approve') {
    withdrawal.status = 'completed';
    withdrawal.processedAt = new Date().toISOString();
    withdrawal.processedBy = req.user.username;
    withdrawal.notes = notes || 'Payout processed successfully';

    db.save();
    return res.json({
      message: `Withdrawal ${id} marked as Paid/Completed!`,
      withdrawal
    });
  }

  if (action === 'reject') {
    withdrawal.status = 'rejected';
    withdrawal.processedAt = new Date().toISOString();
    withdrawal.processedBy = req.user.username;
    withdrawal.notes = notes || 'Declined by administrator';

    // Auto Refund money back to user wallet
    if (user) {
      user.balance += withdrawal.amount;

      data.transactions.push({
        id: uuidv4(),
        userId: user.id,
        username: user.username,
        type: 'refund',
        amount: withdrawal.amount,
        balanceAfter: user.balance,
        description: `Refund for rejected withdrawal [${id}]: ${notes || 'Declined'}`,
        createdAt: new Date().toISOString()
      });
    }

    db.save();
    return res.json({
      message: `Withdrawal ${id} rejected and ₹${withdrawal.amount} refunded back to ${withdrawal.username}'s wallet!`,
      withdrawal,
      refundedBalance: user ? user.balance : null
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString(), localTime: getCurrentTimeStr() });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Satta King Platform Server running on port ${PORT}`);
  console.log(`🌐 Web App: http://localhost:${PORT}`);
  console.log(`🔑 Admin Panel: http://localhost:${PORT}/admin.html`);
  console.log(`👤 Default Admin: admin / admin123`);
  console.log(`👤 Demo Player: demo_user / demo123, player1 / player123`);
  console.log(`=======================================================`);
});

module.exports = app;

