// Royal Satta Live - Client Application Logic

const state = {
  token: localStorage.getItem('satta_token') || null,
  user: null,
  markets: [],
  selectedMarketId: 'FB',
  spotlightMarketId: null,
  lastDeclaredResults: {},
  betMode: 'parcha', // 'parcha', 'crossing', 'jodi', or 'haruf'
  globalBetAmount: 50,
  activeDecade: 'all',
  betSlip: [] // Array of { marketId, marketName, betType, number, amount, rate }
};

// ======================== TOAST NOTIFICATIONS ========================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ======================== TAB NAVIGATION ========================
function switchTab(tabId) {
  triggerHaptic('light');
  // Update desktop buttons
  const tabs = ['markets', 'play', 'bets', 'chart', 'wallet'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${capitalize(t)}`);
    const view = document.getElementById(`view${capitalize(t)}`);
    const bNav = document.getElementById(`bNav${capitalize(t)}`);

    if (btn) btn.classList.toggle('active', t === tabId);
    if (view) view.style.display = (t === tabId) ? 'block' : 'none';
    if (bNav) bNav.classList.toggle('active', t === tabId);
  });

  // Action on tab entry
  if (tabId === 'markets') loadMarkets();
  if (tabId === 'play') renderPlayScreen();
  if (tabId === 'bets') loadMyBets();
  if (tabId === 'chart') loadResultsChart();
  if (tabId === 'wallet') {
    loadWalletTransactions();
    loadUserWithdrawals();
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ======================== AUTHENTICATION ========================
async function checkAuth() {
  if (!state.token) {
    renderAuthUI(null);
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      renderAuthUI(state.user);
    } else {
      localStorage.removeItem('satta_token');
      state.token = null;
      state.user = null;
      renderAuthUI(null);
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }
}

function renderAuthUI(user) {
  const userHeader = document.getElementById('userHeaderSection');
  const guestHeader = document.getElementById('guestHeaderSection');
  const headerBalance = document.getElementById('headerBalance');
  const headerUsername = document.getElementById('headerUsername');
  const slipUserBalance = document.getElementById('slipUserBalance');
  const walletPageBalance = document.getElementById('walletPageBalance');

  if (user) {
    if (userHeader) userHeader.style.display = 'flex';
    if (guestHeader) guestHeader.style.display = 'none';
    if (headerBalance) headerBalance.textContent = `₹${user.balance.toLocaleString()}`;
    if (headerUsername) headerUsername.textContent = user.username;
    if (slipUserBalance) slipUserBalance.textContent = `₹${user.balance.toLocaleString()}`;
    if (walletPageBalance) walletPageBalance.textContent = `₹${user.balance.toLocaleString()}`;
  } else {
    if (userHeader) userHeader.style.display = 'none';
    if (guestHeader) guestHeader.style.display = 'flex';
    if (slipUserBalance) slipUserBalance.textContent = '₹0 (Please Login)';
    if (walletPageBalance) walletPageBalance.textContent = '₹0';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameOrPhone = document.getElementById('loginUserOrPhone').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrPhone, password })
    });
    const data = await res.json();

    if (res.ok) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('satta_token', data.token);
      renderAuthUI(state.user);
      closeModals();
      showToast(`Welcome back, ${data.user.username}!`, 'success');
      loadMarkets();
    } else {
      showToast(data.error || 'Login failed', 'error');
    }
  } catch (err) {
    showToast('Network error during login.', 'error');
  }
}

async function quickDemoUserLogin(username = 'demo_user', password = 'demo123') {
  const userField = document.getElementById('loginUserOrPhone');
  const passField = document.getElementById('loginPassword');
  if (userField) userField.value = username;
  if (passField) passField.value = password;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrPhone: username, password: password })
    });
    const data = await res.json();

    if (res.ok) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('satta_token', data.token);
      renderAuthUI(state.user);
      closeModals();
      showToast(`⚡ Demo Login successful as ${data.user.username}! (Balance: ₹${data.user.balance.toLocaleString()})`, 'success');
      loadMarkets();
    } else {
      showToast(data.error || 'Demo login failed', 'error');
    }
  } catch (err) {
    showToast('Network error during demo login.', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, phone, password })
    });
    const data = await res.json();

    if (res.ok) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('satta_token', data.token);
      renderAuthUI(state.user);
      closeModals();
      showToast(data.message, 'success');
      loadMarkets();
    } else {
      showToast(data.error || 'Registration failed', 'error');
    }
  } catch (err) {
    showToast('Network error during registration.', 'error');
  }
}

function logout() {
  localStorage.removeItem('satta_token');
  state.token = null;
  state.user = null;
  renderAuthUI(null);
  showToast('Logged out successfully.', 'info');
  switchTab('markets');
}

// Modal controls
function openLoginModal() {
  closeModals();
  document.getElementById('loginModal').classList.add('active');
}
function openRegisterModal() {
  closeModals();
  document.getElementById('registerModal').classList.add('active');
}
function openAddFundsModal() {
  if (!state.user) {
    openLoginModal();
    return;
  }
  closeModals();
  document.getElementById('addFundsModal').classList.add('active');
}

let currentWdMethod = 'upi';

function switchWithdrawMethod(method) {
  currentWdMethod = method;
  const upiBtn = document.getElementById('wdMethodUpiBtn');
  const bankBtn = document.getElementById('wdMethodBankBtn');
  const upiFields = document.getElementById('wdUpiFields');
  const bankFields = document.getElementById('wdBankFields');

  if (method === 'upi') {
    if (upiBtn) { upiBtn.className = 'btn btn-primary'; }
    if (bankBtn) { bankBtn.className = 'btn btn-secondary'; }
    if (upiFields) upiFields.style.display = 'block';
    if (bankFields) bankFields.style.display = 'none';
  } else {
    if (upiBtn) { upiBtn.className = 'btn btn-secondary'; }
    if (bankBtn) { bankBtn.className = 'btn btn-primary'; }
    if (upiFields) upiFields.style.display = 'none';
    if (bankFields) bankFields.style.display = 'block';
  }
}

function openWithdrawModal() {
  if (!state.user) {
    openLoginModal();
    return;
  }
  closeModals();
  const input = document.getElementById('withdrawAmountInput');
  if (input) input.value = '';
  switchWithdrawMethod('upi');
  document.getElementById('withdrawModal').classList.add('active');
}

function setWithdrawAmount(amt) {
  const input = document.getElementById('withdrawAmountInput');
  if (input) input.value = amt;
}

function setWithdrawMax() {
  const input = document.getElementById('withdrawAmountInput');
  if (input && state.user) {
    input.value = Math.max(0, state.user.balance || 0);
  }
}

async function handleWithdrawSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    openLoginModal();
    return;
  }

  const amount = parseInt(document.getElementById('withdrawAmountInput').value, 10);
  if (isNaN(amount) || amount < 100) {
    showToast('Minimum withdrawal amount is ₹100.', 'error');
    return;
  }

  if (amount > (state.user.balance || 0)) {
    showToast(`Insufficient balance! Your current balance is ₹${(state.user.balance || 0).toLocaleString()}`, 'error');
    return;
  }

  const payload = {
    amount,
    paymentMethod: currentWdMethod
  };

  if (currentWdMethod === 'upi') {
    const upiId = document.getElementById('wdUpiId').value.trim();
    if (!upiId || !upiId.includes('@')) {
      showToast('Please enter a valid UPI ID (e.g. 9876543210@paytm)', 'error');
      return;
    }
    payload.upiId = upiId;
  } else {
    const accountHolder = document.getElementById('wdAccountHolder').value.trim();
    const bankAccount = document.getElementById('wdBankAccount').value.trim();
    const ifsc = document.getElementById('wdIfsc').value.trim().toUpperCase();

    if (!accountHolder || !bankAccount || !ifsc) {
      showToast('Please fill all bank account details (Name, A/C No, IFSC)', 'error');
      return;
    }
    payload.accountHolder = accountHolder;
    payload.bankAccount = bankAccount;
    payload.ifsc = ifsc;
  }

  const btn = document.getElementById('btnWithdrawSubmit');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing Payout...';
  }

  try {
    const res = await fetch('/api/wallet/withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      state.user.balance = data.newBalance;
      renderAuthUI(state.user);
      closeModals();
      showToast(data.message, 'success');
      loadWalletTransactions();
      loadUserWithdrawals();
    } else {
      showToast(data.error || 'Withdrawal failed.', 'error');
    }
  } catch (err) {
    showToast('Network error processing withdrawal.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Confirm & Withdraw Now';
    }
  }
}

async function loadUserWithdrawals() {
  const tbody = document.getElementById('walletWdTableBody');
  if (!tbody || !state.token) return;

  try {
    const res = await fetch('/api/wallet/withdrawals', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    renderUserWithdrawalsTable(data.withdrawals);
  } catch (err) {
    console.error('Failed to load user withdrawals:', err);
  }
}

function renderUserWithdrawalsTable(withdrawals) {
  const tbody = document.getElementById('walletWdTableBody');
  if (!tbody) return;

  if (!withdrawals || withdrawals.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          No withdrawal requests found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  withdrawals.forEach(w => {
    const row = document.createElement('tr');
    const dateStr = new Date(w.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const detail = w.method === 'upi'
      ? `UPI: <strong style="color: var(--gold-text);">${w.paymentDetails?.upiId || '-'}</strong>`
      : `Bank: ${w.paymentDetails?.bankAccount || '-'} (${w.paymentDetails?.ifsc || '-'})`;

    let statusBadge = '';
    if (w.status === 'completed') {
      statusBadge = '<span class="status-badge badge-open" style="background: rgba(16, 185, 129, 0.2); color: var(--neon-green); border: 1px solid var(--neon-green);">PAID / SETTLED</span>';
    } else if (w.status === 'rejected') {
      statusBadge = '<span class="status-badge badge-closed" style="background: rgba(239, 68, 68, 0.2); color: var(--neon-red); border: 1px solid var(--neon-red);">REJECTED & REFUNDED</span>';
    } else {
      statusBadge = '<span class="status-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--gold-text); border: 1px solid var(--gold-text);">PENDING PAYOUT</span>';
    }

    row.innerHTML = `
      <td data-label="Request ID" style="font-family: var(--font-mono); font-size: 0.82rem; color: #0F172A; font-weight: 700;">${w.id}</td>
      <td data-label="Requested At" style="font-size: 0.8rem; color: #475569;">${dateStr}</td>
      <td data-label="Amount" style="font-family: var(--font-mono); font-weight: 800; color: #B45309; font-size: 1.05rem;">₹${w.amount.toLocaleString()}</td>
      <td data-label="Method"><span class="status-badge" style="text-transform: uppercase; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1;">${w.method}</span></td>
      <td data-label="Account Details" style="font-size: 0.85rem; color: #0F172A;">${detail}</td>
      <td data-label="Status">${statusBadge}</td>
    `;
    tbody.appendChild(row);
  });
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// ======================== MARKETS & LIVE DISPLAY ========================
async function loadMarkets() {
  try {
    const res = await fetch('/api/markets');
    const data = await res.json();
    state.markets = data.markets;

    // Check if new results were declared by admin
    if (data.markets) {
      data.markets.forEach(m => {
        if (m.todayResult && state.lastDeclaredResults[m.id] === undefined && Object.keys(state.lastDeclaredResults).length > 0) {
          playCasinoSound('win');
          showToast(`🎉 ${m.name} का रिजल्ट ${m.todayResult} आ चुका है!`, 'success');
          state.spotlightMarketId = m.id; // Auto switch spotlight to newly declared market
        }
        if (m.todayResult) {
          state.lastDeclaredResults[m.id] = m.todayResult;
        }
      });
    }

    renderLiveSpotlight(data.markets);
    renderMarketsGrid(data.markets, data.currentTime);
    renderPlayMarketChips();
  } catch (err) {
    console.error('Failed to load markets:', err);
  }
}

// Render Next / Waiting Live Result Spotlight Box (Satta King Style)
function renderLiveSpotlight(markets) {
  const container = document.getElementById('liveSpotlightBox');
  if (!container || !markets || markets.length === 0) return;

  // Determine target market for the spotlight:
  let targetMarket = null;
  if (state.spotlightMarketId) {
    targetMarket = markets.find(m => m.id === state.spotlightMarketId);
  }

  // If not manually selected, prioritize market waiting for result:
  if (!targetMarket) {
    targetMarket = markets.find(m => !m.isOpen && !m.resultDeclared);
  }
  // Then prioritize market currently open:
  if (!targetMarket) {
    targetMarket = markets.find(m => m.isOpen);
  }
  // Fallback:
  if (!targetMarket) {
    targetMarket = markets[0];
  }

  const isDeclared = targetMarket.resultDeclared;
  const isWaiting = !targetMarket.isOpen && !targetMarket.resultDeclared;

  let statusBadgeHtml = '';
  let resultAreaHtml = '';

  if (isDeclared) {
    statusBadgeHtml = `<span class="spotlight-pill declared"><span class="pulse-dot"></span> RESULT DECLARED</span>`;
    resultAreaHtml = `
      <div class="spotlight-result-wrap">
        <div class="spotlight-ball-container">
          <div class="result-number-ball">${targetMarket.todayResult}</div>
        </div>
        <div class="spotlight-declared-text">
          <div style="font-size: 1.25rem; font-weight: 900; color: #1E8276;">🎉 ${targetMarket.name} का आज का रिजल्ट: ${targetMarket.todayResult}</div>
          <div style="font-size: 0.88rem; color: #64748B; margin-top: 4px; font-weight: 600;">
            विजेता पर्चियों का हिसाब 100% ऑटो-सेटल हो चुका है।
          </div>
          <div style="margin-top: 0.65rem;">
            <button class="btn btn-secondary btn-sm" onclick="switchTab('chart')">📊 रिजल्ट चार्ट देखें</button>
          </div>
        </div>
      </div>
    `;
  } else if (isWaiting) {
    statusBadgeHtml = `<span class="spotlight-pill waiting"><span class="pulse-dot" style="background:#EF4444; box-shadow:0 0 8px #EF4444;"></span> RESULT WAITING</span>`;
    resultAreaHtml = `
      <div class="spotlight-waiting-card">
        <div class="waiting-title-row">
          <span class="waiting-spinner">⏳</span>
          <span class="waiting-headline">${targetMarket.name} (${targetMarket.code}) RESULT WAITING...</span>
        </div>
        <div class="waiting-digits-display">
          <span class="digit-box animate-pulse">?</span>
          <span class="digit-box animate-pulse">?</span>
        </div>
        <div class="waiting-notice">
          ⚠️ एडमिन रिजल्ट डालते ही 1-सेकंड में यहाँ लाइव नंबर आ जाएगा!
        </div>
        <div class="waiting-meta">
          <span>⏰ रिजल्ट समय: <strong>${targetMarket.resultTime}</strong></span>
          <span>⚡ ऑटो-सिंक चालू है (हर 5 सेकंड में चेक)</span>
        </div>
      </div>
    `;
  } else {
    // Open for betting
    statusBadgeHtml = `<span class="spotlight-pill open"><span class="pulse-dot"></span> अभी काम चालू है (BETTING OPEN)</span>`;
    resultAreaHtml = `
      <div class="spotlight-open-card">
        <div class="open-headline">🎲 ${targetMarket.name} (${targetMarket.code}) — अभी काम चालू है (सट्टा पर्चा चालू)!</div>
        <div class="open-timing-sub">
          सट्टा पर्चा टाइम: <strong>${targetMarket.closeTime} तक</strong> • रिजल्ट टाइम: <strong>${targetMarket.resultTime}</strong>
        </div>
        <div style="display: flex; gap: 0.75rem; justify-content: center; margin-top: 1rem; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="selectMarketAndPlay('${targetMarket.id}')" style="font-weight: 800; padding: 0.65rem 1.6rem;">
            🎲 अभी पर्चा लगाओ (${targetMarket.code})
          </button>
          <button class="btn btn-secondary" onclick="selectMarketAndPlay('${targetMarket.id}'); setBetMode('parcha');" style="font-weight: 700; padding: 0.65rem 1.4rem;">
            📝 टेलीग्राम पर्चा पेस्ट
          </button>
        </div>
      </div>
    `;
  }

  // Quick switch chips for all markets
  const marketChipsHtml = markets.map(m => {
    const isSelected = m.id === targetMarket.id;
    const tag = m.resultDeclared ? m.todayResult : (m.isOpen ? 'OPEN' : 'WAIT');
    const tagColor = m.resultDeclared ? '#1E8276' : (m.isOpen ? '#059669' : '#DC2626');
    return `
      <button class="spotlight-chip ${isSelected ? 'active' : ''}" onclick="setSpotlightMarket('${m.id}')">
        <span>${m.code}</span>
        <span style="font-weight: 900; color: ${isSelected ? '#FFFFFF' : tagColor}; font-size: 0.75rem;">${tag}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="spotlight-header">
      <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
        <span class="spotlight-main-title">⚡ LIVE DRAW SPOTLIGHT / आगामी रिजल्ट</span>
        ${statusBadgeHtml}
      </div>
      <div class="spotlight-auto-sync">
        <span class="pulse-dot"></span> LIVE AUTO-SYNC (5s)
      </div>
    </div>

    <!-- Center Stage -->
    <div class="spotlight-body">
      <div class="spotlight-market-info">
        <h2 class="spotlight-market-name">${targetMarket.name} <span>(${targetMarket.code})</span></h2>
        <div class="spotlight-sub-times">
          क्लोज़िंग: <strong>${targetMarket.closeTime}</strong> | रिजल्ट टाइम: <strong>${targetMarket.resultTime}</strong> | जोड़ी रेट: <strong>10 का 900</strong>
        </div>
      </div>

      ${resultAreaHtml}
    </div>

    <div class="spotlight-chips-tray">
      <span style="font-size: 0.75rem; font-weight: 800; color: #64748B; text-transform: uppercase;">मार्केट बदलें:</span>
      <div class="spotlight-chips-row">${marketChipsHtml}</div>
    </div>
  `;
}

function setSpotlightMarket(marketId) {
  state.spotlightMarketId = marketId;
  renderLiveSpotlight(state.markets);
}

const YESTERDAY_RESULTS = {
  'DB': '58',
  'SG': '89',
  'FB': '45',
  'GB': '86',
  'GL': '64',
  'GALI': '64',
  'DS': '84'
};

function formatTime12H(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const hDisplay = h < 10 ? '0' + h : h;
  return `${hDisplay}:${m} ${ampm}`;
}

function renderMarketsGrid(markets, currentTime) {
  const container = document.getElementById('marketsGrid');
  if (!container) return;

  container.innerHTML = '';

  markets.forEach(m => {
    const isOpen = m.isOpen;
    const yVal = YESTERDAY_RESULTS[m.id] || YESTERDAY_RESULTS[m.code] || 'XX';
    const card = document.createElement('div');
    card.className = `market-card ${isOpen ? 'open-market' : 'closed-market'}`;

    const statusBadge = m.resultDeclared
      ? `<span class="status-badge badge-declared">● Result Declared</span>`
      : isOpen
        ? `<span class="status-badge badge-open">● Open For Play</span>`
        : `<span class="status-badge badge-closed">● Betting Closed</span>`;

    card.innerHTML = `
      <div>
        <div class="market-top">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="market-code">${m.code}</span>
            <span style="font-weight: 900; font-size: 1.05rem; color: #FFFFFF; letter-spacing: 0.3px;">${m.name}</span>
          </div>
          ${statusBadge}
        </div>

        <!-- Authentic Satta King Classic Board: e.g. GALI (11:25 PM) { 64 } ➔ [ ] -->
        <div class="satta-classic-board">
          <div class="satta-board-name">${m.name.toUpperCase()}</div>
          <div class="satta-board-time">(${formatTime12H(m.resultTime)})</div>
          <div class="satta-board-draw">
            <span class="draw-bracket">{</span>
            <span class="draw-num-yesterday">${yVal}</span>
            <span class="draw-bracket">}</span>
            <span class="draw-arrow-box">➔</span>
            <span class="draw-bracket">[</span>
            <span class="draw-num-today ${m.todayResult ? 'has-result' : 'pending-result'}">${m.todayResult ? m.todayResult : '&nbsp;&nbsp;'}</span>
            <span class="draw-bracket">]</span>
          </div>
        </div>

        <div class="market-timings">
          <div class="timing-row">
            <span>Last Time:</span>
            <span class="timing-val" style="color: ${isOpen ? 'var(--neon-green)' : 'var(--neon-red)'}; font-weight: 800;">${formatTime12H(m.closeTime)}</span>
          </div>
          <div class="timing-row">
            <span>Jodi Rate:</span>
            <span class="timing-val" style="color: var(--gold-text); font-weight: 800;">10 का 900</span>
          </div>
        </div>
      </div>

      <div class="market-bottom">
        <div class="countdown-box" id="countdown_${m.id}">
          ${getRemainingTimeText(m.closeTime, isOpen)}
        </div>
        <button class="btn ${isOpen ? 'btn-satta-play' : 'btn-secondary'} btn-sm" onclick="selectMarketAndPlay('${m.id}')">
          ${isOpen ? '🎲 Play Now' : '👁️ View Slip'}
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  updateLiveDrawTable(markets);
}

function updateLiveDrawTable(markets) {
  const tbody = document.getElementById('liveDrawTableBody');
  if (!tbody || !markets || markets.length === 0) return;

  const yesterdayResults = {
    'DB': '58',
    'SG': '89',
    'FB': '45',
    'GB': '86',
    'GL': '81',
    'GALI': '81',
    'DS': 'XX'
  };

  tbody.innerHTML = '';
  markets.forEach(m => {
    const row = document.createElement('tr');
    const yVal = yesterdayResults[m.id] || yesterdayResults[m.code] || 'XX';
    const tVal = m.todayResult
      ? `<span style="color: #1E8276; font-weight: 900; font-size: 1.15rem;">${m.todayResult}</span>`
      : (m.isOpen ? `<span style="color: #059669; font-weight: 800;">OPEN</span>` : `<span style="color: #DC2626; font-weight: 700;">${m.resultTime}</span>`);

    row.innerHTML = `
      <td style="text-align: left; padding-left: 1.5rem;">
        <span class="table-live-pill"><span class="pulse-dot"></span> LIVE</span>
        <strong style="margin-left: 0.5rem; font-size: 1rem; color: #0F172A;">${m.name} (${m.code})</strong>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">at ${m.resultTime} • Open Daily</div>
      </td>
      <td class="td-val-bold">${yVal}</td>
      <td class="td-val-bold">${tVal}</td>
    `;
    tbody.appendChild(row);
  });
}

function getRemainingTimeText(closeTime, isOpen) {
  if (!isOpen) return '<span style="color: var(--neon-red); font-weight: 800;">⛔ Time Over</span>';
  return `<span style="color: var(--neon-green); font-weight: 800;">⏳ Last Time: ${formatTime12H(closeTime)}</span>`;
}

function selectMarketAndPlay(marketId) {
  state.selectedMarketId = marketId;
  switchTab('play');
}

// ======================== GAME PLAY SCREEN ========================
function renderPlayScreen() {
  state.betMode = 'parcha';
  renderPlayActiveMarketBanner();
  const pSec = document.getElementById('parchaSection');
  if (pSec) pSec.style.display = 'block';
  updateBetSlipUI();
}

function renderPlayActiveMarketBanner() {
  const container = document.getElementById('playActiveMarketBanner');
  if (!container) return;

  // Find the single current active open market
  const openMarkets = (state.markets || []).filter(m => m.isOpen);

  let currentMarket = null;
  if (state.selectedMarketId) {
    currentMarket = (state.markets || []).find(m => m.id === state.selectedMarketId && m.isOpen);
  }

  if (!currentMarket && openMarkets.length > 0) {
    currentMarket = openMarkets[0];
    state.selectedMarketId = currentMarket.id;
  } else if (!currentMarket && state.markets && state.markets.length > 0) {
    currentMarket = state.markets[0];
    state.selectedMarketId = currentMarket.id;
  }

  if (!currentMarket) {
    container.innerHTML = `<div class="alert alert-warning">कोई एक्टिव मार्केट उपलब्ध नहीं है</div>`;
    return;
  }

  const isCurrentOpen = currentMarket.isOpen;
  const statusPill = isCurrentOpen
    ? `<span class="active-market-status-pill">● लाइव चालू गेम (Current Running Game)</span>`
    : `<span class="active-market-status-pill" style="background: #FEE2E2; color: #DC2626; border-color: #FECACA;">⛔ बंद है (Closed)</span>`;

  container.innerHTML = `
    <div class="play-active-market-header">
      <div class="active-market-details" style="width: 100%;">
        <div class="active-market-title-row">
          <span class="pulse-dot" style="background: ${isCurrentOpen ? '#22C55E' : '#EF4444'};"></span>
          <h3 class="active-market-title">${currentMarket.name.toUpperCase()} <span style="color: #64748B; font-weight: 700;">(${currentMarket.code})</span></h3>
          ${statusPill}
        </div>
        <div class="active-market-meta">
          <span>⏰ क्लोज़िंग टाइम: <strong>${formatTime12H(currentMarket.closeTime)}</strong></span>
          <span>🏆 रिजल्ट टाइम: <strong>${formatTime12H(currentMarket.resultTime)}</strong></span>
          <span>💰 जोड़ी रेट: <strong style="color: #B45309;">10 का 900</strong></span>
        </div>
      </div>
    </div>
  `;
}

function switchPlayMarket(marketId) {
  state.selectedMarketId = marketId;
  renderPlayActiveMarketBanner();
  showToast(`✅ गेम चुना गया: ${state.markets.find(m => m.id === marketId)?.name || marketId}`, 'success');
}

function setBetMode(mode) {
  state.betMode = 'parcha';
  const pSec = document.getElementById('parchaSection');
  if (pSec) pSec.style.display = 'block';
}

// ======================== TELEGRAM PARCHA FUNCTIONS ========================

function setParchaInto(amt) {
  const input = document.getElementById('parchaIntoInput');
  if (input) input.value = amt;
  document.querySelectorAll('.parcha-into-chip').forEach(c => {
    c.classList.toggle('active', c.textContent.trim() === `into ${amt}`);
  });
}

function addQuickParchaToSlip() {
  const jodiText = document.getElementById('parchaJodiInput')?.value || '';
  const intoAmt = parseInt(document.getElementById('parchaIntoInput')?.value, 10) || 50;
  const withPalat = document.getElementById('parchaWithPalat')?.checked || false;

  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) {
    showToast('पहले एक मार्केट चुनें', 'error');
    return;
  }

  if (!jodiText.trim()) {
    showToast('कृपया जोड़ी संख्याएं डालें (उदा: 12 34 56)', 'error');
    return;
  }

  const rawNumbers = jodiText.replace(/[,;-]/g, ' ').split(/\s+/).filter(n => n.length > 0);
  const validJodis = [];

  rawNumbers.forEach(n => {
    const clean = n.replace(/\D/g, '');
    if (clean.length === 1) {
      validJodis.push('0' + clean);
    } else if (clean.length === 2) {
      validJodis.push(clean);
    }
  });

  if (validJodis.length === 0) {
    showToast('कृपया सही 2-अंकीय जोड़ी डालें (उदा. 12 34 56)', 'error');
    return;
  }

  const jodiSet = new Set(validJodis);
  if (withPalat) {
    validJodis.forEach(num => {
      const palatNum = num[1] + num[0];
      jodiSet.add(palatNum);
    });
  }

  let addedCount = 0;
  jodiSet.forEach(num => {
    const existing = state.betSlip.find(b => b.marketId === currentMarket.id && b.betType === 'jodi' && b.number === num);
    if (existing) {
      existing.amount += intoAmt;
    } else {
      state.betSlip.push({
        marketId: currentMarket.id,
        marketName: currentMarket.name,
        betType: 'jodi',
        number: num,
        amount: intoAmt,
        rate: currentMarket.jodiRate || 90
      });
    }
    addedCount++;
  });

  if (addedCount > 0) {
    updateBetSlipUI();
    showToast(`⚡ पर्चे में ${addedCount} जोड़ियां सफलतापूर्वक जोड़ी गईं (₹${intoAmt} into)!`, 'success');
    document.getElementById('parchaJodiInput').value = '';
  }
}

// ======================== DEDICATED SIMPLE HARUF STATE & ACTIONS ========================
const selectedHarufAndar = new Set();
const selectedHarufBahar = new Set();

function toggleSimpleHaruf(side, digit) {
  const set = side === 'andar' ? selectedHarufAndar : selectedHarufBahar;
  if (set.has(digit)) {
    set.delete(digit);
  } else {
    set.add(digit);
  }
  const btn = document.getElementById(`harufBtn_${side}_${digit}`);
  if (btn) {
    btn.classList.toggle('active', set.has(digit));
  }
}

function addSimpleHarufToSlip(side) {
  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) {
    showToast('पहले एक मार्केट चुनें', 'error');
    return;
  }

  const set = side === 'andar' ? selectedHarufAndar : selectedHarufBahar;
  const inputEl = document.getElementById(side === 'andar' ? 'simpleHarufAndarInto' : 'simpleHarufBaharInto');
  const amount = parseInt(inputEl?.value, 10) || 100;

  if (set.size === 0) {
    showToast(`कृपया कम से कम एक ${side === 'andar' ? 'अंदर' : 'बाहर'} हरुफ नंबर (0-9) दबाएं!`, 'error');
    return;
  }

  const betType = side === 'andar' ? 'haruf_andar' : 'haruf_bahar';
  const rate = currentMarket.harufRate || 9;
  let count = 0;

  set.forEach(digit => {
    const existing = state.betSlip.find(b => b.marketId === currentMarket.id && b.betType === betType && b.number === digit);
    if (existing) {
      existing.amount += amount;
    } else {
      state.betSlip.push({
        marketId: currentMarket.id,
        marketName: currentMarket.name,
        betType,
        number: digit,
        amount,
        rate
      });
    }
    count++;
  });

  // Clear visual selection
  set.clear();
  for (let i = 0; i <= 9; i++) {
    const btn = document.getElementById(`harufBtn_${side}_${i}`);
    if (btn) btn.classList.remove('active');
  }

  updateBetSlipUI();
  showToast(`⚡ ${count} ${side === 'andar' ? 'अंदर' : 'बाहर'} हरुफ पर्चे में जोड़े गए (₹${amount} into)!`, 'success');
}

// ============================================================================
// ADVANCED REAL-WORLD KHAYIWAL PARSING ENGINE & REAL-TIME LIVE DECODER
// ============================================================================

// 1. Convert Devanagari numerals (०-९) to Western digits (0-9)
function normalizeDevanagariDigits(str) {
  if (!str) return '';
  const devDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.split(devDigits[i]).join(String(i));
  }
  return res;
}

// Helper: Extract explicit amount if written like: into 50, * 50, x 50, = 50, - 50, : 50, 50 rs, 50 se, 50/-
function extractExplicitAmount(text) {
  // Regex for into variations and common typos (inot, itno, ito, nto, in to, etc.)
  const intoPattern = `\\b(?:into|inot|itno|ito|int|nto|in\\s*to|intoo|intr|inro|in|se|rs|rupaye|rupya|rupe|point|pts|pt|ki|ka|par|pr)\\b|\\s+x\\s+|[*=:/-]`;
  const postMatch = text.match(new RegExp(`(?:${intoPattern})\\s*(\\d+)`, 'i'));
  if (postMatch) {
    return {
      amount: parseInt(postMatch[1], 10),
      cleanText: text.replace(postMatch[0], ' ').trim(),
      hasExplicit: true,
      matchedKeyword: postMatch[0]
    };
  }

  const preMatch = text.match(new RegExp(`(\\d+)\\s*(?:${intoPattern})`, 'i'));
  if (preMatch) {
    return {
      amount: parseInt(preMatch[1], 10),
      cleanText: text.replace(preMatch[0], ' ').trim(),
      hasExplicit: true,
      matchedKeyword: preMatch[0]
    };
  }

  return {
    amount: null,
    cleanText: text,
    hasExplicit: false,
    matchedKeyword: null
  };
}

// 2. Main Khayiwal Parser Engine
function parseParchaWithKhayiwalEngine(rawText) {
  if (!rawText || !rawText.trim()) {
    return {
      bets: [],
      summary: { jodiCount: 0, andarCount: 0, baharCount: 0, totalBets: 0, totalAmount: 0 },
      linesDecoded: [],
      suggestions: [],
      warnings: []
    };
  }

  const rawLines = rawText.split('\n');
  const parsedBets = [];
  const linesDecoded = [];
  const suggestions = [];
  const warnings = [];

  let lastParsedJodis = [];
  let lastValidRate = 50; // Default satta into amount

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    let originalLine = rawLines[lineIdx].trim();
    if (!originalLine) continue;

    // Convert Hindi numbers to 0-9
    let line = normalizeDevanagariDigits(originalLine);

    // Strip WhatsApp forward timestamps like "[12:30 pm, 28/09/2026] User:" or "12:30 PM - "
    line = line.replace(/^\[.*?\]\s*([^:]+:)?/i, '').trim();
    line = line.replace(/^\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-:]?\s*/i, '').trim();

    // Check if line is purely non-bet chat / market name / greetings
    const isPureNoise = /^(?:faridabad|gaziabad|gali|desawar|disawer|delhi\s*bazar|shree\s*ganesh|fb|gb|gl|ds|db|sg|ram\s*ram|namaste|jai\s*shree\s*shyam|jai\s*mata\s*di|satta|king|kahiwal|khaiwal|bhai|bhaiya|sir|ok|done|shukriya|thanks|total|date|tarikh)$/i.test(line);
    if (isPureNoise) {
      linesDecoded.push({
        raw: originalLine,
        type: 'header',
        desc: `📌 ${originalLine} (मार्केट/मैसेज टैग)`
      });
      continue;
    }

    // =========================================================================
    // CATEGORY 1: STANDALONE PALAT LINE (पलट / पलटी / PLT)
    // =========================================================================
    const isStandalonePalat = /^(?:palat|plt|palati|पलट|पलटी)(?:\s+(?:into|in|x|\*|=)?\s*\d+)?$/i.test(line.trim());
    if (isStandalonePalat) {
      let amount = lastValidRate;
      const explicitAmt = extractExplicitAmount(line);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        lastValidRate = amount;
      } else {
        const nums = line.match(/\b\d+\b/);
        if (nums) {
          amount = parseInt(nums[0], 10);
          lastValidRate = amount;
        }
      }

      if (lastParsedJodis.length > 0) {
        const flippedList = [];
        lastParsedJodis.forEach(jodi => {
          const flipped = jodi[1] + jodi[0];
          parsedBets.push({ betType: 'jodi', number: flipped, amount });
          flippedList.push(flipped);
        });
        linesDecoded.push({
          raw: originalLine,
          type: 'palat_flip',
          desc: `🔄 पिछली जोड़ियों की पलट (${flippedList.join(', ')}) × ₹${amount}`
        });
      } else {
        warnings.push(`लाइन ${lineIdx + 1}: "पलट" लिखने से पहले ऊपर कोई जोड़ी नहीं मिली!`);
      }
      continue;
    }

    // =========================================================================
    // CATEGORY 2: ALL JODA (सारे जोड़े)
    // =========================================================================
    const isAllJoda = /\b(?:all\s*joda|joda|jode|जोड़ा|जोड़े|सारे\s*जोड़े|जोडे)\b/i.test(line);
    if (isAllJoda) {
      let amount = lastValidRate;
      const explicitAmt = extractExplicitAmount(line);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        lastValidRate = amount;
      } else {
        const numMatches = line.match(/\b\d+\b/g);
        if (numMatches && numMatches.length >= 1) {
          amount = parseInt(numMatches[numMatches.length - 1], 10);
          lastValidRate = amount;
        }
      }

      const jodas = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
      jodas.forEach(j => {
        parsedBets.push({ betType: 'jodi', number: j, amount });
      });
      lastParsedJodis = [...jodas];
      linesDecoded.push({
        raw: originalLine,
        type: 'joda',
        desc: `🎲 10 जोड़े (00 से 99) × ₹${amount} = ₹${amount * 10}`
      });
      continue;
    }

    // =========================================================================
    // CATEGORY 3: ALL MUNDA (सारे मुंडे)
    // =========================================================================
    const isAllMunda = /\b(?:all\s*munda|munda|munde|मुंडा|मुंडे|सारे\s*मुंडे)\b/i.test(line);
    if (isAllMunda) {
      let amount = lastValidRate;
      const explicitAmt = extractExplicitAmount(line);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        lastValidRate = amount;
      } else {
        const numMatches = line.match(/\b\d+\b/g);
        if (numMatches && numMatches.length >= 1) {
          amount = parseInt(numMatches[numMatches.length - 1], 10);
          lastValidRate = amount;
        }
      }

      const mundas = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '00'];
      mundas.forEach(m => {
        parsedBets.push({ betType: 'jodi', number: m, amount });
      });
      lastParsedJodis = [...mundas];
      linesDecoded.push({
        raw: originalLine,
        type: 'munda',
        desc: `🎲 10 मुंडे (01 से 09, 00) × ₹${amount} = ₹${amount * 10}`
      });
      continue;
    }

    // =========================================================================
    // CATEGORY 4: CROSSING (क्रॉसिंग / Crx / Standalone 3-8 digit numbers like 12345)
    // Supports:
    // - Explicit keywords: crx, cross, crossing, wj (with joda), jc (joda cut), etc.
    // - Direct 3-8 digit numbers: e.g. "12345 inot 56", "12345 into 10", "1234 into 50", "12345", "12345 50"
    // =========================================================================
    const hasCrossingKeyword = /\b(?:crossing|cross|crx|क्रॉसिंग|क्रॉस|wj|with\s*joda|जोड़ा\s*सहित|jc|joda\s*cut|cut\s*joda|no\s*joda|without\s*joda|bina\s*joda|बिना\s*जोड़ा|जोड़ा\s*कट|कट\s*जोड़ा)\b/i.test(line);

    let has3PlusDigitCrossingPattern = false;
    let singleBigNumberToken = null;

    if (!hasCrossingKeyword) {
      const explicitAmt = extractExplicitAmount(line);
      const testContent = explicitAmt.cleanText.replace(/[^0-9\s]/g, ' ').trim();
      const tokens = testContent.split(/\s+/).filter(Boolean);
      // If there is a single 3 to 8 digit number (e.g. "1234", "12345", "012345"), it is automatically a Crossing!
      if (tokens.length === 1 && tokens[0].length >= 3 && tokens[0].length <= 8) {
        has3PlusDigitCrossingPattern = true;
        singleBigNumberToken = tokens[0];
      } else if (tokens.length === 2 && (tokens[0].length >= 3 && tokens[0].length <= 8) && tokens[1].length <= 4 && !explicitAmt.hasExplicit) {
        // e.g. "12345 50" -> 12345 is crossing, 50 is amount
        has3PlusDigitCrossingPattern = true;
        singleBigNumberToken = tokens[0];
      }
    }

    const isCrossing = hasCrossingKeyword || has3PlusDigitCrossingPattern;
    if (isCrossing) {
      let amount = lastValidRate || 50;
      let cleanLine = line;

      // Check for without joda / joda cut (jc / cut joda / bina joda / no joda)
      const isJodaCut = /\b(?:joda\s*cut|cut\s*joda|jc|no\s*joda|without\s*joda|bina\s*joda|बिना\s*जोड़ा|जोड़ा\s*कट|कट\s*जोड़ा)\b/i.test(cleanLine);
      const isExplicitWithJoda = /\b(?:wj|with\s*joda|जोड़ा\s*सहित)\b/i.test(cleanLine);

      // Clean out joda cut / wj modifier tags before extracting amounts
      cleanLine = cleanLine.replace(/\b(?:joda\s*cut|cut\s*joda|jc|no\s*joda|without\s*joda|bina\s*joda|बिना\s*जोड़ा|जोड़ा\s*कट|कट\s*जोड़ा|wj|with\s*joda|जोड़ा\s*सहित)\b/gi, ' ');

      // 1. Look for explicit into: "into 50", "inot 56", "* 50", "50 into", etc.
      const explicitAmt = extractExplicitAmount(cleanLine);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        cleanLine = explicitAmt.cleanText;
        lastValidRate = amount;
      } else {
        // 2. No explicit "into": check if multiple separate numbers exist
        // e.g. "crx 12346 10" or "12346 10" -> 12346 is crossing digits, 10 is amount!
        // But if ONLY 1 number: "crx 12346" -> 12346 is CROSSING DIGITS, amount is default rate!
        const numMatches = cleanLine.match(/\b\d+\b/g);
        if (numMatches && numMatches.length >= 2) {
          const lastNum = parseInt(numMatches[numMatches.length - 1], 10);
          amount = lastNum;
          lastValidRate = amount;
          const lastIdx = cleanLine.lastIndexOf(numMatches[numMatches.length - 1]);
          cleanLine = cleanLine.substring(0, lastIdx).trim();
        }
      }

      // Extract unique digits for crossing:
      const withoutCrxKeyword = cleanLine.replace(/\b(?:crossing|cross|crx|क्रॉसिंग|क्रॉस)\b/gi, ' ');
      const digitsRaw = withoutCrxKeyword.replace(/\D/g, '');
      const uniqueDigits = Array.from(new Set(digitsRaw.split('')));

      if (uniqueDigits.length >= 2) {
        const withoutJoda = isJodaCut && !isExplicitWithJoda;
        const crxPairs = [];

        for (let i = 0; i < uniqueDigits.length; i++) {
          for (let j = 0; j < uniqueDigits.length; j++) {
            if (withoutJoda && i === j) continue; // Skip doublets like 11, 22, 33, 44, 55, 66
            const pair = uniqueDigits[i] + uniqueDigits[j];
            parsedBets.push({ betType: 'jodi', number: pair, amount });
            crxPairs.push(pair);
          }
        }
        lastParsedJodis = [...crxPairs];
        const jodaTypeLabel = withoutJoda ? ' [जोड़ा कट / Joda Cut]' : ' [With Joda / जोड़ा सहित]';
        linesDecoded.push({
          raw: originalLine,
          type: 'crossing',
          desc: `🔀 क्रॉसिंग (${uniqueDigits.join('')})${jodaTypeLabel}: ${crxPairs.length} जोड़ियां × ₹${amount} = ₹${(crxPairs.length * amount).toLocaleString('en-IN')}`
        });

        const digitsStr = uniqueDigits.join('');
        const wjTotal = uniqueDigits.length * uniqueDigits.length;
        const jcTotal = uniqueDigits.length * (uniqueDigits.length - 1);

        if (withoutJoda) {
          suggestions.push({
            label: `🔀 With Joda बनाएं (${digitsStr} - ${wjTotal} जोड़ियां)`,
            variant: 'chip-accent',
            type: 'replace_line',
            lineIdx,
            newText: `crx ${digitsStr} wj into ${amount}`
          });
        } else {
          suggestions.push({
            label: `✂️ जोड़ा कट (Joda Cut) बनाएं (${digitsStr} - ${jcTotal} जोड़ियां)`,
            variant: 'chip-accent',
            type: 'replace_line',
            lineIdx,
            newText: `crx ${digitsStr} jc into ${amount}`
          });
        }

        // Suggest Palat pairs if 3-5 digits
        if (uniqueDigits.length <= 5) {
          const samplePalats = [];
          for (let i = 0; i < uniqueDigits.length - 1; i++) {
            samplePalats.push(uniqueDigits[i] + uniqueDigits[i + 1]);
          }
          if (samplePalats.length > 0) {
            suggestions.push({
              label: `🔄 पलट जोड़ियां बनाएं (${samplePalats.join(' ')} पलट)`,
              variant: '',
              type: 'replace_line',
              lineIdx,
              newText: `${samplePalats.join(' ')} palat into ${amount}`
            });
          }
        }
      } else {
        warnings.push(`लाइन ${lineIdx + 1}: क्रॉसिंग के लिए कम से कम 2 अलग अंक चाहिए (उदा. 12345 into 10 या crx 1234 jc into 50)`);
      }
      continue;
    }

    // =========================================================================
    // CATEGORY 5: HARUF (अंदर / बाहर / अंदर-बाहर / A-B / आर-पार)
    // =========================================================================
    // Case 5A: Both Andar & Bahar (अंदर-बाहर, A/B, A-B, Ar-Par, Dono)
    const isBothHaruf = /\b(?:a\/b|a-b|ab|ar\s*par|aar\s*paar|andar\s*bahar|ander\s*bahar|dono|अंदर\s*बाहर|आर\s*पार|दोनों)\b/i.test(line);
    if (isBothHaruf) {
      let amount = lastValidRate;
      let cleanLine = line;

      const explicitAmt = extractExplicitAmount(cleanLine);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        cleanLine = explicitAmt.cleanText;
        lastValidRate = amount;
      } else {
        const numMatches = cleanLine.match(/\b\d+\b/g);
        if (numMatches && numMatches.length >= 2) {
          amount = parseInt(numMatches[numMatches.length - 1], 10);
          lastValidRate = amount;
          const lastIdx = cleanLine.lastIndexOf(numMatches[numMatches.length - 1]);
          cleanLine = cleanLine.substring(0, lastIdx).trim();
        }
      }

      const cleanHarufPart = cleanLine.replace(/a\/b|a-b|ab|ar\s*par|aar\s*paar|andar\s*bahar|ander\s*bahar|dono|अंदर\s*बाहर|आर\s*पार|दोनों/gi, ' ');
      const digits = Array.from(new Set(cleanHarufPart.match(/\d/g) || []));
      if (digits.length > 0) {
        digits.forEach(d => {
          parsedBets.push({ betType: 'haruf_andar', number: d, amount });
          parsedBets.push({ betType: 'haruf_bahar', number: d, amount });
        });
        linesDecoded.push({
          raw: originalLine,
          type: 'haruf_both',
          desc: `🎯 अंदर+बाहर हरुफ (${digits.join(', ')}): ${digits.length * 2} हरुफ × ₹${amount} = ₹${digits.length * 2 * amount}`
        });
      } else {
        warnings.push(`लाइन ${lineIdx + 1}: अंदर-बाहर हरुफ का अंक नहीं मिला (उदा. 4 a/b into 100)`);
      }
      continue;
    }

    // Case 5B: Andar Haruf only
    const isAndar = /\b(?:andar|ander|and|अंदर)\b/i.test(line) || /\ba\s*[-:]?\s*\d/i.test(line) || /\d\s*a\b/i.test(line);
    if (isAndar) {
      let amount = lastValidRate;
      let cleanLine = line;

      const explicitAmt = extractExplicitAmount(cleanLine);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        cleanLine = explicitAmt.cleanText;
        lastValidRate = amount;
      } else {
        const numMatches = cleanLine.match(/\b\d+\b/g);
        if (numMatches && numMatches.length >= 2) {
          amount = parseInt(numMatches[numMatches.length - 1], 10);
          lastValidRate = amount;
          const lastIdx = cleanLine.lastIndexOf(numMatches[numMatches.length - 1]);
          cleanLine = cleanLine.substring(0, lastIdx).trim();
        }
      }

      const cleanHarufPart = cleanLine.replace(/andar|ander|and|अंदर|\ba\b/gi, ' ');
      const digits = Array.from(new Set(cleanHarufPart.match(/\d/g) || []));
      if (digits.length > 0) {
        digits.forEach(d => {
          parsedBets.push({ betType: 'haruf_andar', number: d, amount });
        });
        linesDecoded.push({
          raw: originalLine,
          type: 'haruf_andar',
          desc: `🅰️ अंदर हरुफ (${digits.join(', ')}): ${digits.length} हरुफ × ₹${amount} = ₹${digits.length * amount}`
        });
      } else {
        warnings.push(`लाइन ${lineIdx + 1}: अंदर हरुफ का अंक नहीं मिला (उदा. andar 4 into 100)`);
      }
      continue;
    }

    // Case 5C: Bahar Haruf only (e.g. "222 bhar into 100", "bahar 7 into 150", "b 7 100", "7 bahar")
    const isBahar = /\b(?:bahar|bhr|bhar|बाहर)\b/i.test(line) || /\bb\s*[-:]?\s*\d/i.test(line) || /\d\s*b\b/i.test(line);
    if (isBahar) {
      let amount = lastValidRate;
      let cleanLine = line;

      const explicitAmt = extractExplicitAmount(cleanLine);
      if (explicitAmt.hasExplicit) {
        amount = explicitAmt.amount;
        cleanLine = explicitAmt.cleanText;
        lastValidRate = amount;
      } else {
        const numMatches = cleanLine.match(/\b\d+\b/g);
        if (numMatches && numMatches.length >= 2) {
          amount = parseInt(numMatches[numMatches.length - 1], 10);
          lastValidRate = amount;
          const lastIdx = cleanLine.lastIndexOf(numMatches[numMatches.length - 1]);
          cleanLine = cleanLine.substring(0, lastIdx).trim();
        }
      }

      const cleanHarufPart = cleanLine.replace(/bahar|bhr|bhar|बाहर|\bb\b/gi, ' ');
      const digits = Array.from(new Set(cleanHarufPart.match(/\d/g) || []));
      if (digits.length > 0) {
        digits.forEach(d => {
          parsedBets.push({ betType: 'haruf_bahar', number: d, amount });
        });
        linesDecoded.push({
          raw: originalLine,
          type: 'haruf_bahar',
          desc: `🅱️ बाहर हरुफ (${digits.join(', ')}): ${digits.length} हरुफ × ₹${amount} = ₹${digits.length * amount}`
        });
      } else {
        warnings.push(`लाइन ${lineIdx + 1}: बाहर हरुफ का अंक नहीं मिला (उदा. bahar 7 into 100)`);
      }
      continue;
    }

    // =========================================================================
    // CATEGORY 6: STANDARD JODI LINE (with or without inline Palat)
    // e.g. "12 34 56 78 into 100", "12 34 56", "45 67 palat into 100", "12 34 56 100"
    // =========================================================================
    let amount = lastValidRate;
    let cleanLine = line;

    // Check for inline palat tag
    const isPalat = /\b(?:palat|plt|palati|पलट|पलटी)\b/i.test(cleanLine);

    // 1. Look for explicit amount: into 100, * 100, etc.
    const explicitAmt = extractExplicitAmount(cleanLine);
    if (explicitAmt.hasExplicit) {
      amount = explicitAmt.amount;
      cleanLine = explicitAmt.cleanText;
      lastValidRate = amount;
    } else {
      // 2. Check tokens if no explicit "into"
      const rawNums = cleanLine.replace(/palat|plt|palati|पलट|पलटी/gi, ' ').replace(/[^0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      if (rawNums.length >= 2) {
        const lastNum = rawNums[rawNums.length - 1];
        // If last number is 3+ digits (e.g. 100, 200, 500) and previous numbers are 1-2 digits:
        if (lastNum.length >= 3 && rawNums.slice(0, -1).every(n => n.length <= 2)) {
          amount = parseInt(lastNum, 10);
          lastValidRate = amount;
          rawNums.pop();
          cleanLine = rawNums.join(' ');
        }
      }
    }

    const cleanJodiContent = cleanLine.replace(/palat|plt|palati|पलट|पलटी/gi, ' ').replace(/[^0-9\s]/g, ' ');
    const rawTokens = cleanJodiContent.split(/\s+/).filter(Boolean);

    const validJodis = [];
    const currentLineJodis = [];

    rawTokens.forEach(tok => {
      if (tok.length === 1) {
        // e.g. "5" -> normalized to "05" (Munda 5)
        const padded = '0' + tok;
        validJodis.push(padded);
      } else if (tok.length === 2) {
        validJodis.push(tok);
      } else if (tok.length > 2) {
        warnings.push(`लाइन ${lineIdx + 1}: "${tok}" 3 या अधिक अंकों की संख्या है — जोड़ी 2 अंकों की होनी चाहिए`);
        // Add smart suggestion to turn this large token into Crossing or split it!
        const uniqueT = Array.from(new Set(tok.split(''))).join('');
        if (uniqueT.length >= 2) {
          suggestions.push({
            label: `🔀 "${tok}" को Crossing में बदलें (${uniqueT.length * uniqueT.length} जोड़ियां)`,
            variant: 'chip-warn',
            type: 'replace_line',
            lineIdx,
            newText: `crx ${uniqueT} wj into ${amount}`
          });
        }
      }
    });

    if (validJodis.length > 0) {
      validJodis.forEach(jodi => {
        parsedBets.push({ betType: 'jodi', number: jodi, amount });
        currentLineJodis.push(jodi);

        if (isPalat) {
          const palatJodi = jodi[1] + jodi[0];
          if (palatJodi !== jodi) {
            parsedBets.push({ betType: 'jodi', number: palatJodi, amount });
            currentLineJodis.push(palatJodi);
          }
        }
      });

      lastParsedJodis = [...currentLineJodis];
      const palatLabel = isPalat ? ' (पलट सहित)' : '';
      linesDecoded.push({
        raw: originalLine,
        type: 'jodi',
        desc: `🎲 ${currentLineJodis.length} जोड़ियां${palatLabel} (${currentLineJodis.join(', ')}) × ₹${amount} = ₹${currentLineJodis.length * amount}`
      });

      // If user did not use Palat, suggest 1-click Palat addition!
      if (!isPalat && validJodis.length <= 6) {
        suggestions.push({
          label: `🔄 + पलट लगाएं (${validJodis.join(' ')} पलट into ${amount})`,
          variant: '',
          type: 'append_palat',
          lineIdx,
          amount
        });
      }
    } else if (rawTokens.length === 0 || !isCrossing) {
      warnings.push(`लाइन ${lineIdx + 1}: "${originalLine}" में कोई जोड़ी या हरुफ समझ नहीं आया`);
    }
  }

  // Calculate summary totals
  let jodiCount = 0;
  let andarCount = 0;
  let baharCount = 0;
  let totalAmount = 0;

  parsedBets.forEach(b => {
    if (b.betType === 'jodi') jodiCount++;
    if (b.betType === 'haruf_andar') andarCount++;
    if (b.betType === 'haruf_bahar') baharCount++;
    totalAmount += b.amount;
  });

  return {
    bets: parsedBets,
    summary: {
      jodiCount,
      andarCount,
      baharCount,
      totalBets: parsedBets.length,
      totalAmount
    },
    linesDecoded,
    suggestions,
    warnings
  };
}


// 3. Live Real-Time Khayiwal Decoder & Breakdown Preview
function liveUpdateKhayiwalDecoder() {
  const textarea = document.getElementById('rawParchaText');
  const container = document.getElementById('parchaLiveDecoder');
  if (!textarea || !container) return;

  const rawText = textarea.value.trim();
  if (!rawText) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const result = parseParchaWithKhayiwalEngine(rawText);

  if (result.summary.totalBets === 0 && result.warnings.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  let html = '';

  // Badges Bar
  html += `<div class="parcha-decoder-badges">`;
  if (result.summary.jodiCount > 0) {
    html += `<span class="decoder-badge decoder-badge-jodi">🎲 जोड़ियां: <strong>${result.summary.jodiCount}</strong></span>`;
  }
  if (result.summary.andarCount > 0) {
    html += `<span class="decoder-badge decoder-badge-andar">🅰️ अंदर हरुफ: <strong>${result.summary.andarCount}</strong></span>`;
  }
  if (result.summary.baharCount > 0) {
    html += `<span class="decoder-badge decoder-badge-bahar">🅱️ बाहर हरुफ: <strong>${result.summary.baharCount}</strong></span>`;
  }
  html += `<span class="decoder-badge decoder-badge-total">💰 कुल पर्चा: <strong>₹${result.summary.totalAmount.toLocaleString('en-IN')}</strong> (${result.summary.totalBets} संख्याएं)</span>`;
  html += `</div>`;

  // Line by line breakdown
  if (result.linesDecoded.length > 0) {
    html += `<div class="parcha-decoder-lines">`;
    result.linesDecoded.forEach(ld => {
      html += `<div class="parcha-decoder-line-item"><span>•</span><span>${ld.desc}</span></div>`;
    });
    html += `</div>`;
  }

  // Warnings
  if (result.warnings.length > 0) {
    container.className = 'parcha-live-decoder has-warnings';
    result.warnings.forEach(w => {
      html += `<div class="parcha-decoder-warning"><span>⚠️</span><span>${w}</span></div>`;
    });
  } else {
    container.className = 'parcha-live-decoder';
  }

  container.innerHTML = html;
}

// 4. Quick Helper Template Inserter
function insertParchaTemplate(type) {
  const textarea = document.getElementById('rawParchaText');
  if (!textarea) return;

  let template = '';
  switch (type) {
    case 'jodi':
      template = '12 34 56 78 into 100';
      break;
    case 'palat':
      template = '45 67 palat into 100';
      break;
    case 'andar':
      template = 'andar 4 into 200';
      break;
    case 'bahar':
      template = 'bahar 7 into 150';
      break;
    case 'andar_bahar':
      template = '4 a/b into 100';
      break;
    case 'crossing_wj':
      template = 'crx 1234 into 50';
      break;
    case 'crossing_jc':
      template = 'crx 12346 joda cut into 10';
      break;
    case 'joda':
      template = 'all joda into 100';
      break;
    case 'munda':
      template = 'all munda into 50';
      break;
    default:
      template = '12 34 into 100';
  }

  if (textarea.value.trim().length > 0) {
    textarea.value = textarea.value.trim() + '\n' + template;
  } else {
    textarea.value = template;
  }

  textarea.focus();
  liveUpdateKhayiwalDecoder();
}

// 5. Load Real-World Parcha Samples
function loadParchaSample(sampleNo) {
  const textarea = document.getElementById('rawParchaText');
  if (!textarea) return;

  if (sampleNo === 1) {
    textarea.value = `12 34 56 78 into 100\n92 04 55 into 50\n01 10 into 200`;
  } else if (sampleNo === 2) {
    textarea.value = `45 67 palat into 100\nandar 4 into 200\nbahar 7 into 150\n4 a/b into 100`;
  } else {
    textarea.value = `crx 1234 into 50\ncrx 12346 joda cut into 10\nall joda into 100\n222 bhar into 100`;
  }

  liveUpdateKhayiwalDecoder();
}

// 6. Clear Raw Parcha Textarea
function clearRawParcha() {
  const textarea = document.getElementById('rawParchaText');
  if (textarea) textarea.value = '';
  liveUpdateKhayiwalDecoder();
  showToast('पर्चा साफ कर दिया गया', 'info');
}

// 7. Parse Raw WhatsApp / Telegram Parcha Messages and Add to Bet Slip
function parseRawParchaText() {
  const textarea = document.getElementById('rawParchaText');
  const text = textarea?.value || '';
  if (!text.trim()) {
    showToast('पहले WhatsApp या Telegram का पर्चा यहाँ लिखें या पेस्ट करें', 'error');
    return;
  }

  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) {
    showToast('कृपया पहले कोई एक्टिव मार्केट चुनें', 'error');
    return;
  }

  const result = parseParchaWithKhayiwalEngine(text);

  if (result.bets.length === 0) {
    showToast('पर्चे में से कोई भी संख्या लोड नहीं हो सकी। कृपया सही प्रारूप में लिखें।', 'error');
    return;
  }

  result.bets.forEach(b => {
    addSingleBetToSlip(currentMarket, b.betType, b.number, b.amount);
  });

  updateBetSlipUI();

  const slipEl = document.getElementById('betSlipPanel');
  if (slipEl) {
    slipEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  showToast(`✅ खाईवाल पर्चा से ${result.summary.totalBets} संख्याएं (₹${result.summary.totalAmount}) स्लिप में लोड हो गईं!`, 'success');
}

function addSingleBetToSlip(market, betType, number, amount) {
  const existing = state.betSlip.find(b => b.marketId === market.id && b.betType === betType && b.number === number);
  const rate = betType === 'jodi' ? (market.jodiRate || 90) : (market.harufRate || 9);

  if (existing) {
    existing.amount += amount;
  } else {
    state.betSlip.push({
      marketId: market.id,
      marketName: market.name,
      betType,
      number,
      amount,
      rate
    });
  }
}

function generateAndAddCrossing() {
  const digits = document.getElementById('crossingDigitsInput')?.value.replace(/\D/g, '') || '';
  const intoAmt = parseInt(document.getElementById('crossingIntoInput')?.value, 10) || 50;
  const withJoda = document.getElementById('crossingWithJoda')?.checked ?? true;

  if (digits.length < 2) {
    showToast('Please enter at least 2 distinct digits for crossing (e.g. 12345)', 'error');
    return;
  }

  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) {
    showToast('Select an active market', 'error');
    return;
  }

  let count = 0;
  for (let i = 0; i < digits.length; i++) {
    for (let j = 0; j < digits.length; j++) {
      if (!withJoda && i === j) continue;
      const pair = digits[i] + digits[j];
      addSingleBetToSlip(currentMarket, 'jodi', pair, intoAmt);
      count++;
    }
  }

  updateBetSlipUI();
  showToast(`🔀 ${digits} की क्रॉसिंग से ${count} जोड़ियां पर्चे में जोड़ी गईं (₹${intoAmt} into)!`, 'success');
  document.getElementById('crossingDigitsInput').value = '';
}

function copyTelegramParchaSlip() {
  if (state.betSlip.length === 0) {
    showToast('Bet slip is empty. Add numbers first.', 'error');
    return;
  }

  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  const marketName = currentMarket ? currentMarket.name : 'ALL MARKETS';
  const todayStr = new Date().toLocaleDateString('en-GB');

  const jodiBets = state.betSlip.filter(b => b.betType === 'jodi');
  const andarBets = state.betSlip.filter(b => b.betType === 'haruf_andar');
  const baharBets = state.betSlip.filter(b => b.betType === 'haruf_bahar');
  const totalPoints = state.betSlip.reduce((sum, b) => sum + b.amount, 0);

  let text = `👑 *ROYAL SATTA PARCHA SLIP* 👑\n`;
  text += `🎯 *Game:* ${marketName}\n`;
  text += `📅 *Date:* ${todayStr}\n`;
  text += `────────────────────\n`;

  if (jodiBets.length > 0) {
    const jodiStr = jodiBets.map(b => `${b.number}(₹${b.amount})`).join(', ');
    text += `🎲 *Jodi (${jodiBets.length}):* ${jodiStr}\n`;
  }
  if (andarBets.length > 0) {
    const aStr = andarBets.map(b => `${b.number}(₹${b.amount})`).join(', ');
    text += `🅰️ *Andar Haruf:* ${aStr}\n`;
  }
  if (baharBets.length > 0) {
    const bStr = baharBets.map(b => `${b.number}(₹${b.amount})`).join(', ');
    text += `🅱️ *Bahar Haruf:* ${bStr}\n`;
  }

  text += `────────────────────\n`;
  text += `💰 *TOTAL INVESTMENT:* ₹${totalPoints.toLocaleString()}\n`;
  text += `🚀 *Status:* Confirmed on Web App`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 पर्चा क्लिपबोर्ड में कॉपी हो गया! WhatsApp/Telegram पर शेयर करें।', 'success');
  }).catch(() => {
    showToast('Failed to copy parcha', 'error');
  });
}

function setGlobalBetAmt(amt) {
  const parsed = parseInt(amt, 10);
  if (isNaN(parsed) || parsed < 5) return;
  state.globalBetAmount = parsed;

  document.querySelectorAll('.amt-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === `₹${parsed}`);
  });
}

function filterJodiDecade(decade) {
  state.activeDecade = decade;
  document.querySelectorAll('.jodi-tab-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('onclick').includes(`'${decade}'`));
  });
  renderJodiMatrix();
}

function renderJodiMatrix() {
  const grid = document.getElementById('jodiGrid');
  if (!grid) return;

  grid.innerHTML = '';

  for (let i = 0; i < 100; i++) {
    const numStr = String(i).padStart(2, '0');
    const firstDigit = numStr[0];

    if (state.activeDecade !== 'all' && state.activeDecade !== firstDigit) {
      continue;
    }

    const cell = document.createElement('div');
    cell.className = 'num-cell';
    cell.id = `jodi_cell_${numStr}`;

    // Check if currently in bet slip for current market
    const slipItem = state.betSlip.find(b => b.marketId === state.selectedMarketId && b.betType === 'jodi' && b.number === numStr);
    if (slipItem) {
      cell.classList.add('selected');
      cell.innerHTML = `
        <span class="num-val">${numStr}</span>
        <span class="num-bet-tag">₹${slipItem.amount}</span>
      `;
    } else {
      cell.innerHTML = `<span class="num-val">${numStr}</span>`;
    }

    cell.onclick = () => toggleJodiBet(numStr);
    grid.appendChild(cell);
  }
}

function toggleJodiBet(numStr) {
  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) return;

  const existingIndex = state.betSlip.findIndex(b => b.marketId === state.selectedMarketId && b.betType === 'jodi' && b.number === numStr);

  if (existingIndex > -1) {
    // Already in slip -> remove
    state.betSlip.splice(existingIndex, 1);
  } else {
    // Add to slip
    state.betSlip.push({
      marketId: currentMarket.id,
      marketName: currentMarket.name,
      betType: 'jodi',
      number: numStr,
      amount: state.globalBetAmount,
      rate: currentMarket.jodiRate || 90
    });
  }

  playCasinoSound('click');
  triggerHaptic('light');
  renderJodiMatrix();
  updateBetSlipUI();
}

// Select Jodi Patterns (Odd, Even, Doubles)
function selectJodiPattern(type) {
  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) {
    showToast('Please select a market first!', 'error');
    return;
  }
  const amt = Number(state.globalBetAmount) || 50;

  for (let i = 0; i < 100; i++) {
    const numStr = String(i).padStart(2, '0');
    let matches = false;
    if (type === 'odd' && i % 2 !== 0) matches = true;
    if (type === 'even' && i % 2 === 0) matches = true;
    if (type === 'doubles' && numStr[0] === numStr[1]) matches = true;

    if (matches) {
      const idx = state.betSlip.findIndex(b => b.marketId === currentMarket.id && b.betType === 'jodi' && b.number === numStr);
      if (idx === -1) {
        state.betSlip.push({
          marketId: currentMarket.id,
          marketName: currentMarket.name,
          betType: 'jodi',
          number: numStr,
          amount: amt,
          rate: currentMarket.jodiRate || 90
        });
      }
    }
  }

  playCasinoSound('click');
  renderJodiMatrix();
  updateBetSlipUI();
  showToast(`Selected all ${type.toUpperCase()} numbers (${amt} pts each)`, 'success');
}

function clearJodiSelection() {
  state.betSlip = state.betSlip.filter(b => !(b.marketId === state.selectedMarketId && b.betType === 'jodi'));
  playCasinoSound('click');
  renderJodiMatrix();
  updateBetSlipUI();
  showToast('Cleared Jodi selections', 'info');
}

function addManualJodi() {
  const numInput = document.getElementById('manualJodiNum');
  const amtInput = document.getElementById('manualJodiAmt');
  let num = numInput.value.trim();
  const amt = parseInt(amtInput.value, 10);

  if (!/^\d{1,2}$/.test(num)) {
    showToast('Please enter a valid 2-digit number (00-99).', 'error');
    return;
  }
  num = num.padStart(2, '0');

  if (isNaN(amt) || amt < 5) {
    showToast('Minimum bet amount is ₹5.', 'error');
    return;
  }

  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) return;

  const existing = state.betSlip.find(b => b.marketId === state.selectedMarketId && b.betType === 'jodi' && b.number === num);
  if (existing) {
    existing.amount += amt;
  } else {
    state.betSlip.push({
      marketId: currentMarket.id,
      marketName: currentMarket.name,
      betType: 'jodi',
      number: num,
      amount: amt,
      rate: currentMarket.jodiRate || 90
    });
  }

  numInput.value = '';
  renderJodiMatrix();
  updateBetSlipUI();
  showToast(`Added Jodi ${num} (₹${amt}) to slip.`, 'success');
}

function renderHarufGrids() {
  const andarGrid = document.getElementById('harufAndarGrid');
  const baharGrid = document.getElementById('harufBaharGrid');
  if (!andarGrid || !baharGrid) return;

  andarGrid.innerHTML = '';
  baharGrid.innerHTML = '';

  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  const harufRate = currentMarket ? currentMarket.harufRate : 9;

  for (let i = 0; i < 10; i++) {
    const digitStr = String(i);

    // Andar Cell
    const aCell = document.createElement('div');
    aCell.className = 'num-cell';
    const aSlip = state.betSlip.find(b => b.marketId === state.selectedMarketId && b.betType === 'haruf_andar' && b.number === digitStr);
    if (aSlip) {
      aCell.classList.add('selected');
      aCell.innerHTML = `<span class="num-val">${digitStr}</span><span class="num-bet-tag">₹${aSlip.amount}</span>`;
    } else {
      aCell.innerHTML = `<span class="num-val">${digitStr}</span>`;
    }
    aCell.onclick = () => toggleHarufBet('haruf_andar', digitStr);
    andarGrid.appendChild(aCell);

    // Bahar Cell
    const bCell = document.createElement('div');
    bCell.className = 'num-cell';
    const bSlip = state.betSlip.find(b => b.marketId === state.selectedMarketId && b.betType === 'haruf_bahar' && b.number === digitStr);
    if (bSlip) {
      bCell.classList.add('selected');
      bCell.innerHTML = `<span class="num-val">${digitStr}</span><span class="num-bet-tag">₹${bSlip.amount}</span>`;
    } else {
      bCell.innerHTML = `<span class="num-val">${digitStr}</span>`;
    }
    bCell.onclick = () => toggleHarufBet('haruf_bahar', digitStr);
    baharGrid.appendChild(bCell);
  }
}

function toggleHarufBet(betType, digitStr) {
  const currentMarket = state.markets.find(m => m.id === state.selectedMarketId);
  if (!currentMarket) return;

  const existingIndex = state.betSlip.findIndex(b => b.marketId === state.selectedMarketId && b.betType === betType && b.number === digitStr);

  if (existingIndex > -1) {
    state.betSlip.splice(existingIndex, 1);
  } else {
    state.betSlip.push({
      marketId: currentMarket.id,
      marketName: currentMarket.name,
      betType,
      number: digitStr,
      amount: state.globalBetAmount,
      rate: currentMarket.harufRate || 9
    });
  }

  playCasinoSound('click');
  triggerHaptic('light');
  renderHarufGrids();
  updateBetSlipUI();
}

function updateSelectedCellHighlights() {
  renderJodiMatrix();
  renderHarufGrids();
}

// ======================== BET SLIP & SUBMIT ========================
function updateBetSlipUI() {
  const countEl = document.getElementById('slipItemsCount');
  const totalAmountEl = document.getElementById('slipTotalAmount');
  const tbody = document.getElementById('slipItemsBody');
  const dock = document.getElementById('mobileFloatingSlipDock');
  const dockCount = document.getElementById('dockSlipCount');
  const dockTotal = document.getElementById('dockSlipTotal');

  if (!countEl || !totalAmountEl || !tbody) return;

  countEl.textContent = state.betSlip.length;

  if (state.betSlip.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem; font-weight: 700;">
          पर्चे में अभी कोई जोड़ी नहीं है। ऊपर दिए गए WhatsApp बॉक्स में पर्चा पेस्ट करें या जोड़ी डालकर लोड करें!
        </td>
      </tr>
    `;
    totalAmountEl.textContent = '₹0';
    if (dock) dock.style.display = 'none';
    return;
  }

  let totalAmount = 0;
  tbody.innerHTML = '';

  state.betSlip.forEach((item, index) => {
    totalAmount += item.amount;
    const potentialWin = item.amount * item.rate;

    let typeLabel = item.betType.toUpperCase();
    let badgeBg = '#FEF3C7';
    let badgeColor = '#92400E';

    if (item.betType === 'haruf_andar') {
      typeLabel = 'अंदर हरुफ (A)';
      badgeBg = '#DBEAFE';
      badgeColor = '#1E40AF';
    } else if (item.betType === 'haruf_bahar') {
      typeLabel = 'बाहर हरुफ (B)';
      badgeBg = '#F3E8FF';
      badgeColor = '#6B21A8';
    } else if (item.betType === 'jodi') {
      typeLabel = 'जोड़ी (Jodi)';
      badgeBg = '#FEF3C7';
      badgeColor = '#92400E';
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight: 800; color: #0F172A; font-size: 0.95rem;">${item.marketName}</td>
      <td>
        <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem; text-transform: uppercase;">
          ${typeLabel}
        </span>
      </td>
      <td style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 900; color: #0F172A;">${item.number}</td>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 4px;">
          <span style="font-size: 0.85rem; font-weight: 800; color: #64748B;">₹</span>
          <input type="number" value="${item.amount}" min="5" style="width: 75px; padding: 4px 6px; background: #F8FAFC; border: 1.5px solid #CBD5E1; color: #0F172A; border-radius: 6px; font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem;" onchange="updateSlipItemAmount(${index}, this.value)">
        </div>
      </td>
      <td style="font-family: var(--font-mono); color: #059669; font-weight: 900; font-size: 1.05rem;">₹${potentialWin.toLocaleString()}</td>
      <td>
        <button class="btn btn-danger btn-sm" style="padding: 3px 8px; font-weight: 800; font-size: 0.85rem;" onclick="removeSlipItem(${index})" title="हटाएं">&times;</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  totalAmountEl.textContent = `₹${totalAmount.toLocaleString()}`;

  // Update floating mobile dock
  if (dock && dockCount && dockTotal) {
    if (window.innerWidth <= 900 && state.betSlip.length > 0) {
      dock.style.display = 'flex';
      dockCount.textContent = state.betSlip.length;
      dockTotal.textContent = `₹${totalAmount.toLocaleString()}`;
    } else {
      dock.style.display = 'none';
    }
  }
}

function scrollToSlipOrSubmit() {
  triggerHaptic('medium');
  const panel = document.getElementById('betSlipPanel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
    panel.style.borderColor = '#F59E0B';
    panel.style.boxShadow = '0 0 25px rgba(245, 158, 11, 0.45)';
    setTimeout(() => {
      panel.style.borderColor = '';
      panel.style.boxShadow = '';
    }, 1200);
  }
}

function updateSlipItemAmount(index, newAmt) {
  const amt = parseInt(newAmt, 10);
  if (isNaN(amt) || amt < 5) return;
  state.betSlip[index].amount = amt;
  triggerHaptic('light');
  updateBetSlipUI();
  updateSelectedCellHighlights();
}

function removeSlipItem(index) {
  state.betSlip.splice(index, 1);
  triggerHaptic('medium');
  updateBetSlipUI();
  updateSelectedCellHighlights();
}

function clearBetSlip() {
  state.betSlip = [];
  triggerHaptic('medium');
  updateBetSlipUI();
  updateSelectedCellHighlights();
  showToast('Bet slip cleared.', 'info');
}

async function submitBetSlip() {
  if (!state.user) {
    showToast('Please login or register to place bets!', 'error');
    openLoginModal();
    return;
  }

  if (state.betSlip.length === 0) {
    showToast('Please select at least one Jodi or Haruf number.', 'error');
    return;
  }

  // Check if all items belong to open markets
  for (const item of state.betSlip) {
    const market = state.markets.find(m => m.id === item.marketId);
    if (market && !market.isOpen) {
      showToast(`Market ${market.name} is currently closed for betting!`, 'error');
      return;
    }
  }

  const totalAmount = state.betSlip.reduce((acc, i) => acc + i.amount, 0);
  if (state.user.balance < totalAmount) {
    showToast(`Insufficient balance (₹${state.user.balance}). You need ₹${totalAmount}.`, 'error');
    openAddFundsModal();
    return;
  }

  // Group bets by market
  const marketsInSlip = [...new Set(state.betSlip.map(i => i.marketId))];

  try {
    document.getElementById('btnSubmitBet').disabled = true;
    document.getElementById('btnSubmitBet').textContent = 'Submitting Bets...';

    for (const mId of marketsInSlip) {
      const items = state.betSlip
        .filter(i => i.marketId === mId)
        .map(i => ({
          betType: i.betType,
          number: i.number,
          amount: i.amount
        }));

      const res = await fetch('/api/bets/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          marketId: mId,
          items
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place bets');
      }

      state.user.balance = data.newBalance;
    }

    renderAuthUI(state.user);
    state.betSlip = [];
    updateBetSlipUI();
    updateSelectedCellHighlights();
    triggerHaptic('success');

    showToast(`All bets placed successfully! Total: ₹${totalAmount}`, 'success');
    setTimeout(() => switchTab('bets'), 1000);
  } catch (err) {
    showToast(err.message || 'Error placing bets', 'error');
  } finally {
    document.getElementById('btnSubmitBet').disabled = false;
    document.getElementById('btnSubmitBet').textContent = '⚡ Confirm & Place Bet';
  }
}

// ======================== MY BETS ========================
async function loadMyBets() {
  if (!state.user) {
    document.getElementById('myBetsTableBody').innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          Please <a href="javascript:void(0)" onclick="openLoginModal()" style="color: var(--gold-text); font-weight: 700;">Login</a> to view your placed bets.
        </td>
      </tr>
    `;
    return;
  }

  const statusFilter = document.getElementById('filterBetStatus').value;
  let url = '/api/bets/my-bets';
  if (statusFilter) url += `?status=${statusFilter}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    renderMyBetsTable(data.bets);
  } catch (err) {
    console.error('Failed to load bets:', err);
  }
}

function renderMyBetsTable(bets) {
  const tbody = document.getElementById('myBetsTableBody');
  if (!tbody) return;

  if (!bets || bets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No bets placed yet. Go to 'Play Game' to start playing!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  bets.forEach(b => {
    const row = document.createElement('tr');

    let statusBadge = '';
    if (b.status === 'pending') {
      statusBadge = `<span class="status-badge badge-declared" style="display: inline-block;">Pending</span>`;
    } else if (b.status === 'won') {
      statusBadge = `<span class="status-badge badge-open" style="display: inline-block;">🎉 WON ₹${b.winAmount.toLocaleString()}</span>`;
    } else {
      statusBadge = `<span class="status-badge badge-closed" style="display: inline-block;">LOST</span>`;
    }

    let typeStr = b.betType.toUpperCase();
    if (b.betType === 'haruf_andar') typeStr = 'Haruf (Andar)';
    if (b.betType === 'haruf_bahar') typeStr = 'Haruf (Bahar)';

    const placedTime = new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
      <td data-label="Date" style="font-family: var(--font-mono); color: #0F172A; font-weight: 700;">${b.date}</td>
      <td data-label="Market" style="font-weight: 800; color: #0F172A;">${b.marketName}</td>
      <td data-label="Bet Type" style="color: #B45309; font-weight: 700;">${typeStr}</td>
      <td data-label="Number" style="font-family: var(--font-mono); font-size: 1.15rem; font-weight: 900; color: #0F172A;">${b.number}</td>
      <td data-label="Points Placed" style="font-family: var(--font-mono); font-weight: 800; color: #0F172A;">₹${b.amount}</td>
      <td data-label="Rate" style="font-family: var(--font-mono); color: #475569; font-weight: 700;">${b.rate}x</td>
      <td data-label="Status">${statusBadge}</td>
      <td data-label="Won Payout" style="font-family: var(--font-mono); font-weight: 800; color: ${b.status === 'won' ? '#15803D' : '#64748B'};">
        ${b.status === 'won' ? `+₹${b.winAmount.toLocaleString()}` : '₹0'}
      </td>
      <td data-label="Placed At" style="font-size: 0.8rem; color: #64748B; font-weight: 600;">${placedTime}</td>
    `;
    tbody.appendChild(row);
  });
}

// ======================== RESULTS CHART ========================
let cachedChartResults = [];
let activeChartFilter = 'ALL';

async function loadResultsChart() {
  try {
    const res = await fetch('/api/results/chart');
    const data = await res.json();
    cachedChartResults = data.results || [];
    renderResultsChartTable(cachedChartResults, activeChartFilter);
  } catch (err) {
    console.error('Failed to load results chart:', err);
  }
}

function filterChartColumn(marketCode) {
  activeChartFilter = marketCode;
  // Update chip active classes
  const chips = ['ALL', 'DS', 'FB', 'GB', 'GALI', 'DB', 'SG'];
  chips.forEach(c => {
    const btn = document.getElementById(`chartFilter${c}`);
    if (btn) {
      if (c === marketCode) {
        btn.style.background = '#1E8276';
        btn.style.color = '#FFFFFF';
        btn.style.borderColor = '#115E59';
      } else {
        btn.style.background = '#F1F5F9';
        btn.style.color = '#334155';
        btn.style.borderColor = '#CBD5E1';
      }
    }
  });

  renderResultsChartTable(cachedChartResults, activeChartFilter);
}

function renderResultsChartTable(results, filter = 'ALL') {
  const tbody = document.getElementById('chartTableBody');
  const thead = document.querySelector('#chartTable thead');
  if (!tbody) return;

  if (!results || results.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No historical results recorded yet. Check back soon!
        </td>
      </tr>
    `;
    return;
  }

  // Update table header based on filter
  if (filter === 'ALL') {
    thead.innerHTML = `
      <tr>
        <th style="width: 13%;">Date</th>
        <th>DS</th>
        <th>DB</th>
        <th>SG</th>
        <th>FB</th>
        <th>GB</th>
        <th>GL</th>
      </tr>
    `;
  } else {
    const mNames = {
      DS: 'Desawar (DS)',
      FB: 'Faridabad (FB)',
      GB: 'Ghaziabad (GB)',
      GALI: 'Gali (GL)',
      DB: 'Delhi Bazaar (DB)',
      SG: 'Shri Ganesh (SG)'
    };
    thead.innerHTML = `
      <tr>
        <th style="width: 35%;">Date</th>
        <th style="width: 65%;">${mNames[filter] || filter} Result</th>
      </tr>
    `;
  }

  // Group results by date
  const byDate = {};
  results.forEach(r => {
    if (!byDate[r.date]) {
      byDate[r.date] = {};
    }
    byDate[r.date][r.marketId] = r.resultNumber;
  });

  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  tbody.innerHTML = '';
  sortedDates.forEach(d => {
    const row = document.createElement('tr');
    const m = byDate[d] || {};
    const dayNum = d.split('-')[2] ? parseInt(d.split('-')[2], 10) : d;

    if (filter === 'ALL') {
      row.innerHTML = `
        <td class="td-date-red">${dayNum}</td>
        <td class="td-val-bold">${m.DS || '--'}</td>
        <td class="td-val-bold">${m.DB || '--'}</td>
        <td class="td-val-bold">${m.SG || '--'}</td>
        <td class="td-val-bold">${m.FB || '--'}</td>
        <td class="td-val-bold">${m.GB || '--'}</td>
        <td class="td-val-bold">${m.GALI || m.GL || '--'}</td>
      `;
    } else {
      const val = m[filter] || (filter === 'GALI' ? m.GL : null) || '--';
      row.innerHTML = `
        <td class="td-date-red" style="font-weight: 800; font-size: 1rem;">${d}</td>
        <td class="td-val-bold" style="font-size: 1.5rem; color: #115E59; font-weight: 900;">${val}</td>
      `;
    }
    tbody.appendChild(row);
  });
}

// ======================== WALLET & DEMO FUNDS ========================
async function loadWalletTransactions() {
  if (!state.user) {
    document.getElementById('walletTxTableBody').innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          Please <a href="javascript:void(0)" onclick="openLoginModal()" style="color: var(--gold-text); font-weight: 700;">Login</a> to view wallet passbook.
        </td>
      </tr>
    `;
    return;
  }

  try {
    const res = await fetch('/api/wallet/transactions', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    state.user.balance = data.balance;
    renderAuthUI(state.user);
    renderWalletTxTable(data.transactions);
  } catch (err) {
    console.error('Failed to load transactions:', err);
  }
}

function renderWalletTxTable(transactions) {
  const tbody = document.getElementById('walletTxTableBody');
  if (!tbody) return;

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No transactions yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  transactions.forEach(t => {
    const row = document.createElement('tr');
    const isCredit = t.amount > 0;
    const dateStr = new Date(t.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

    row.innerHTML = `
      <td data-label="Date & Time" style="font-size: 0.82rem; color: #475569; font-weight: 600;">${dateStr}</td>
      <td data-label="Type">
        <span class="status-badge ${isCredit ? 'badge-open' : 'badge-closed'}" style="display: inline-block;">
          ${t.type.toUpperCase()}
        </span>
      </td>
      <td data-label="Description" style="color: #0F172A; font-weight: 700;">${t.description}</td>
      <td data-label="Amount" style="font-family: var(--font-mono); font-weight: 800; color: ${isCredit ? '#15803D' : '#DC2626'};">
        ${isCredit ? `+₹${t.amount.toLocaleString()}` : `-₹${Math.abs(t.amount).toLocaleString()}`}
      </td>
      <td data-label="Running Balance" style="font-family: var(--font-mono); color: #B45309; font-weight: 800;">₹${t.balanceAfter.toLocaleString()}</td>
    `;
    tbody.appendChild(row);
  });
}

async function quickAddDemoFunds(amount) {
  if (!state.user) {
    openLoginModal();
    return;
  }

  try {
    const res = await fetch('/api/wallet/add-demo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    if (res.ok) {
      state.user.balance = data.newBalance;
      renderAuthUI(state.user);
      closeModals();
      showToast(data.message, 'success');
      loadWalletTransactions();
    } else {
      showToast(data.error || 'Failed to add funds', 'error');
    }
  } catch (err) {
    showToast('Network error adding funds', 'error');
  }
}

// Live Clock Updater
function startLiveClock() {
  const clockEl = document.getElementById('liveClockText');
  const portalTsEl = document.getElementById('portalUpdatedTimestamp');
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString();
    }
    if (portalTsEl) {
      portalTsEl.textContent = `${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}, ${now.toLocaleTimeString()} IST`;
    }
  }

  update();
  setInterval(update, 1000);
}

// Live Winning Marquee Broadcast
function startLiveWinTicker() {
  const tickerEl = document.getElementById('liveTickerText');
  if (!tickerEl) return;

  const sampleWins = [
    "🎉 Rohit_S won ₹18,000 in Desawar (Jodi 84) • ⚡ Aman_99 received ₹9,000 instant UPI payout!",
    "🏆 Priya_Delhi won ₹27,000 in Gali (Jodi 47) • ⚡ Auto win settled in 0.4 seconds!",
    "💰 Suresh_K won ₹4,500 in Faridabad (Haruf 7 Bahar) • 🚀 ₹4,500 transferred to Paytm UPI!",
    "🔥 Deepak_007 won ₹45,000 in Ghaziabad (Jodi 22) • ⚡ Instant withdrawal processed!",
    "⭐ Rahul_999 won ₹9,000 in Shri Ganesh • 👑 100% verified settlement active!"
  ];

  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % sampleWins.length;
    tickerEl.style.opacity = '0';
    tickerEl.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      tickerEl.textContent = sampleWins[idx];
      tickerEl.style.opacity = '1';
    }, 300);
  }, 5000);
}

// ======================== CASINO AUDIO ENGINE (WEB AUDIO API) ========================
// Tactical Mobile Vibration & Haptic Engine
function triggerHaptic(type = 'light') {
  if (navigator.vibrate) {
    try {
      if (type === 'light') navigator.vibrate(12);
      else if (type === 'medium') navigator.vibrate(26);
      else if (type === 'success') navigator.vibrate([15, 35, 20]);
      else if (type === 'error') navigator.vibrate([40, 40, 40]);
    } catch (e) {}
  }
  if (type === 'success') playCasinoSound('win');
  else if (type === 'light' || type === 'medium') playCasinoSound('click');
}

let audioCtx = null;
function playCasinoSound(type = 'click') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    if (type === 'click') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.18, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.22);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.22);
      });
    }
  } catch (err) {
    // Non-blocking if audio policy blocks autoplay
  }
}

// Initialization on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  startLiveWinTicker();
  checkAuth();
  loadMarkets();

  // Auto-refresh markets every 5 seconds for instant admin result report
  setInterval(() => {
    loadMarkets();
  }, 5000);
});
