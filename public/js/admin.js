// Royal Satta Live - Admin Control Room Logic

const adminState = {
  token: localStorage.getItem('satta_admin_token') || localStorage.getItem('satta_token') || null,
  user: null,
  markets: []
};

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
function switchAdminTab(tabId) {
  const tabs = ['declare', 'exposure', 'users', 'withdrawals', 'markets', 'allBets'];
  tabs.forEach(t => {
    const btn = document.getElementById(`adminTabBtn${capitalize(t)}`);
    const view = document.getElementById(`adminView${capitalize(t)}`);

    if (btn) btn.classList.toggle('active', t === tabId);
    if (view) view.style.display = (t === tabId) ? 'block' : 'none';
  });

  if (tabId === 'declare') initDeclareView();
  if (tabId === 'exposure') loadExposureData();
  if (tabId === 'users') loadAdminUsers();
  if (tabId === 'withdrawals') loadAdminWithdrawals();
  if (tabId === 'markets') loadAdminMarketSettings();
  if (tabId === 'allBets') loadAdminAllBets();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ======================== AUTHENTICATION & DEMO LOGIN ========================
function startAdminClock() {
  const clockEl = document.getElementById('adminLiveClockText');
  if (!clockEl) return;
  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-IN', { hour12: false });
  }
  update();
  setInterval(update, 1000);
}

function openAdminLoginGate() {
  const modal = document.getElementById('adminLoginGateModal');
  if (modal) modal.classList.add('active');
}

function closeAdminLoginGate() {
  const modal = document.getElementById('adminLoginGateModal');
  if (modal) modal.classList.remove('active');
}

async function checkAdminAuth() {
  startAdminClock();

  if (!adminState.token) {
    openAdminLoginGate();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user.role !== 'admin') {
        showToast('Access denied: You do not have admin permissions.', 'error');
        openAdminLoginGate();
        return;
      }
      adminState.user = data.user;
      closeAdminLoginGate();
      document.getElementById('adminUserPill').textContent = `Admin: ${data.user.username}`;
      initDeclareView();
    } else {
      localStorage.removeItem('satta_admin_token');
      adminState.token = null;
      openAdminLoginGate();
    }
  } catch (err) {
    console.error('Admin auth check failed:', err);
    openAdminLoginGate();
  }
}

async function quickDemoAdminLogin(username = 'admin', password = 'admin123') {
  const uInput = document.getElementById('adminGateUsername');
  const pInput = document.getElementById('adminGatePassword');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = password;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrPhone: username, password: password })
    });
    const data = await res.json();
    if (res.ok && data.user.role === 'admin') {
      adminState.token = data.token;
      adminState.user = data.user;
      localStorage.setItem('satta_admin_token', data.token);
      document.getElementById('adminUserPill').textContent = `Admin: ${data.user.username}`;
      closeAdminLoginGate();
      showToast(`⚡ Demo Admin Login successful as ${data.user.username}!`, 'success');
      initDeclareView();
    } else {
      showToast(data.error || 'Admin login failed', 'error');
    }
  } catch (err) {
    showToast('Network error during admin login', 'error');
  }
}

async function handleAdminLoginForm(e) {
  e.preventDefault();
  const username = document.getElementById('adminGateUsername').value.trim();
  const password = document.getElementById('adminGatePassword').value;
  await quickDemoAdminLogin(username, password);
}

function logoutAdmin() {
  localStorage.removeItem('satta_admin_token');
  adminState.token = null;
  adminState.user = null;
  showToast('Logged out of Admin Control Room', 'info');
  openAdminLoginGate();
}

// ======================== DECLARE RESULT & AUTO SETTLEMENT ========================
function initDeclareView() {
  const dateInput = document.getElementById('declareDateInput');
  if (dateInput && !dateInput.value) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
  const expDateInput = document.getElementById('exposureDateInput');
  if (expDateInput && !expDateInput.value) {
    expDateInput.value = new Date().toISOString().split('T')[0];
  }
  const allBetsDateInput = document.getElementById('allBetsDateInput');
  if (allBetsDateInput && !allBetsDateInput.value) {
    allBetsDateInput.value = new Date().toISOString().split('T')[0];
  }
}

function previewDigits(val) {
  const pAndar = document.getElementById('previewAndar');
  const pBahar = document.getElementById('previewBahar');
  if (!pAndar || !pBahar) return;

  const clean = val.trim();
  if (clean.length === 2) {
    pAndar.textContent = clean[0];
    pBahar.textContent = clean[1];
  } else if (clean.length === 1) {
    pAndar.textContent = '0';
    pBahar.textContent = clean[0];
  } else {
    pAndar.textContent = '-';
    pBahar.textContent = '-';
  }
}

async function handleDeclareResult(e) {
  e.preventDefault();

  const marketId = document.getElementById('declareMarketSelect').value;
  const date = document.getElementById('declareDateInput').value;
  const resultNumber = document.getElementById('declareResultNumber').value.trim();

  if (!marketId || !date || resultNumber === '') {
    showToast('Market, Date, and 2-Digit Result are required.', 'error');
    return;
  }

  const btn = document.getElementById('btnDeclareSubmit');
  try {
    btn.disabled = true;
    btn.textContent = 'Processing Auto-Settlement Engine...';

    const res = await fetch('/api/admin/declare-result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ marketId, date, resultNumber })
    });

    const data = await res.json();

    if (res.ok) {
      showToast(data.message, 'success');
      renderSettlementSummary(data.summary);
    } else {
      showToast(data.error || 'Failed to declare result', 'error');
    }
  } catch (err) {
    showToast('Network error while declaring result', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Declare Result & Auto-Credit Winners';
  }
}

function renderSettlementSummary(summary) {
  document.getElementById('settlementEmptyPlaceholder').style.display = 'none';
  document.getElementById('settlementStatsArea').style.display = 'block';

  document.getElementById('statEvaluatedBets').textContent = summary.totalBetsEvaluated;
  document.getElementById('statTotalWinners').textContent = summary.totalWinners;
  document.getElementById('statTotalPayout').textContent = `₹${summary.totalPayout.toLocaleString()}`;

  const tbody = document.getElementById('settlementWinnersList');
  if (!summary.winnerDetails || summary.winnerDetails.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1rem;">
          No matching winning bets found for this result. (Admin Profit: 100%)
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  summary.winnerDetails.forEach(w => {
    const row = document.createElement('tr');
    let typeLabel = w.betType.toUpperCase();
    if (w.betType === 'haruf_andar') typeLabel = 'Haruf (Andar)';
    if (w.betType === 'haruf_bahar') typeLabel = 'Haruf (Bahar)';

    row.innerHTML = `
      <td style="font-weight: 800; color: #0F172A;">${w.username}</td>
      <td style="color: #B45309; font-weight: 700;">${typeLabel} [${w.number}]</td>
      <td style="font-weight: 700; color: #0F172A;">₹${w.betAmount}</td>
      <td style="font-family: var(--font-mono); font-weight: 900; color: #15803D;">+₹${w.winAmount.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); color: #B45309; font-weight: 800;">₹${w.newBalance.toLocaleString()}</td>
    `;
    tbody.appendChild(row);
  });
}

// ======================== LIVE EXPOSURE / LIABILITY BOOK ========================
async function loadExposureData() {
  const marketId = document.getElementById('exposureMarketSelect').value;
  const date = document.getElementById('exposureDateInput').value;

  try {
    const res = await fetch(`/api/admin/exposure?marketId=${marketId}&date=${date}`, {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    const data = await res.json();
    renderExposureUI(data);
  } catch (err) {
    console.error('Failed to load exposure:', err);
  }
}

function renderExposureUI(data) {
  document.getElementById('expTotalCollection').textContent = `₹${data.totalCollection.toLocaleString()}`;
  document.getElementById('expTotalBets').textContent = data.totalBetsCount;

  // Find max risk (highest total payout)
  const maxRisk = data.numbersReport.length > 0 ? data.numbersReport[0].totalPayout : 0;
  document.getElementById('expMaxRisk').textContent = `₹${maxRisk.toLocaleString()}`;

  const safeCount = data.numbersReport.filter(n => n.netProfitOrLoss >= 0).length;
  document.getElementById('expSafeNumbersCount').textContent = `${safeCount} / 100`;

  const tbody = document.getElementById('exposureTableBody');
  tbody.innerHTML = '';

  // Show top 25 highest exposure numbers
  const topNumbers = data.numbersReport.slice(0, 25);
  topNumbers.forEach(n => {
    const isLoss = n.netProfitOrLoss < 0;
    const row = document.createElement('tr');

    let riskBadge = '';
    if (n.totalPayout === 0) {
      riskBadge = '<span class="status-badge badge-open">Zero Risk</span>';
    } else if (isLoss) {
      riskBadge = '<span class="status-badge badge-closed">High Liability</span>';
    } else {
      riskBadge = '<span class="status-badge badge-declared">Profitable</span>';
    }

    row.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 900; color: #0F172A;">${n.number}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #0F172A;">₹${n.jodiBet.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); font-weight: 800; color: #B45309;">₹${n.totalPayout.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); font-weight: 800; color: ${isLoss ? '#DC2626' : '#15803D'};">
        ${isLoss ? `-₹${Math.abs(n.netProfitOrLoss).toLocaleString()}` : `+₹${n.netProfitOrLoss.toLocaleString()}`}
      </td>
      <td>${riskBadge}</td>
    `;
    tbody.appendChild(row);
  });
}

// ======================== USER MANAGEMENT ========================
async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    const data = await res.json();
    renderAdminUsersTable(data.users);
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderAdminUsersTable(users) {
  const tbody = document.getElementById('adminUsersTableBody');
  tbody.innerHTML = '';

  users.forEach(u => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight: 800; color: #0F172A;">${u.username}</td>
      <td style="font-family: var(--font-mono); color: #475569; font-weight: 600;">${u.phone || '-'}</td>
      <td><span class="status-badge ${u.role === 'admin' ? 'badge-declared' : 'badge-open'}">${u.role.toUpperCase()}</span></td>
      <td style="font-family: var(--font-mono); font-size: 1.15rem; font-weight: 800; color: #B45309;">₹${u.balance.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #0F172A;">${u.totalBetsPlaced}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #0F172A;">₹${u.totalBetAmount.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); color: #15803D; font-weight: 800;">₹${u.totalWonAmount.toLocaleString()}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openAdjustBalanceModal('${u.id}', '${u.username}', ${u.balance})"
          style="background: #1E8276; border-color: #115E59; font-weight: 800; padding: 0.35rem 0.75rem;">
          💰 Credit / Debit
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function openAdjustBalanceModal(id, username, balance) {
  document.getElementById('adjUserId').value = id;
  document.getElementById('adjUsername').value = username;
  document.getElementById('adjCurrentBalance').value = `₹${balance.toLocaleString()}`;
  document.getElementById('adjAmount').value = '';
  document.getElementById('adjDescription').value = '';
  document.getElementById('adjustBalanceModal').classList.add('active');
}

function closeAdminModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

async function handleAdjustBalance(e) {
  e.preventDefault();
  const userId = document.getElementById('adjUserId').value;
  const amount = document.getElementById('adjAmount').value;
  const description = document.getElementById('adjDescription').value;

  try {
    const res = await fetch('/api/admin/adjust-balance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ userId, amount, description })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      closeAdminModals();
      loadAdminUsers();
    } else {
      showToast(data.error || 'Failed to adjust balance', 'error');
    }
  } catch (err) {
    showToast('Network error adjusting balance', 'error');
  }
}

// ======================== MARKET SETTINGS & OVERRIDES ========================
async function loadAdminMarketSettings() {
  try {
    const res = await fetch('/api/markets');
    const data = await res.json();
    renderAdminMarketsTable(data.markets);
  } catch (err) {
    console.error('Failed to load market settings:', err);
  }
}

function renderAdminMarketsTable(markets) {
  const tbody = document.getElementById('adminMarketsTableBody');
  tbody.innerHTML = '';

  markets.forEach(m => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight: 800; color: #0F172A;">${m.name} (${m.code})</td>
      <td><input type="time" id="m_open_${m.id}" value="${m.openTime || '06:00'}" class="form-control" style="width: 100px; padding: 4px;"></td>
      <td><input type="time" id="m_close_${m.id}" value="${m.closeTime}" class="form-control" style="width: 100px; padding: 4px;"></td>
      <td><input type="time" id="m_result_${m.id}" value="${m.resultTime}" class="form-control" style="width: 100px; padding: 4px;"></td>
      <td><input type="number" id="m_jodi_${m.id}" value="${m.jodiRate || 90}" class="form-control" style="width: 70px; padding: 4px;"></td>
      <td><input type="number" id="m_haruf_${m.id}" value="${m.harufRate || 9}" class="form-control" style="width: 70px; padding: 4px;"></td>
      <td>
        <select id="m_override_${m.id}" class="form-control" style="width: 130px; padding: 4px;">
          <option value="" ${!m.manualOverride ? 'selected' : ''}>Auto Schedule</option>
          <option value="force_open" ${m.manualOverride === 'force_open' ? 'selected' : ''}>Force OPEN 🟢</option>
          <option value="force_closed" ${m.manualOverride === 'force_closed' ? 'selected' : ''}>Force CLOSED 🔴</option>
        </select>
      </td>
      <td>
        <button class="btn btn-success btn-sm" onclick="saveMarketSettings('${m.id}')" style="font-weight: 800; padding: 0.35rem 0.75rem;">💾 Save</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function saveMarketSettings(id) {
  const openTime = document.getElementById(`m_open_${id}`).value;
  const closeTime = document.getElementById(`m_close_${id}`).value;
  const resultTime = document.getElementById(`m_result_${id}`).value;
  const jodiRate = document.getElementById(`m_jodi_${id}`).value;
  const harufRate = document.getElementById(`m_haruf_${id}`).value;
  const manualOverride = document.getElementById(`m_override_${id}`).value || null;

  try {
    const res = await fetch(`/api/admin/markets/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ openTime, closeTime, resultTime, jodiRate, harufRate, manualOverride })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      loadAdminMarketSettings();
    } else {
      showToast(data.error || 'Failed to update market', 'error');
    }
  } catch (err) {
    showToast('Network error updating market', 'error');
  }
}

// ======================== ALL BETS LOG ========================
async function loadAdminAllBets() {
  const date = document.getElementById('allBetsDateInput').value;
  const marketId = document.getElementById('allBetsMarketSelect').value;
  const status = document.getElementById('allBetsStatusSelect').value;

  let url = `/api/admin/all-bets?`;
  if (date) url += `date=${date}&`;
  if (marketId) url += `marketId=${marketId}&`;
  if (status) url += `status=${status}&`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    const data = await res.json();
    renderAdminAllBetsTable(data.bets);
  } catch (err) {
    console.error('Failed to load all bets:', err);
  }
}

function renderAdminAllBetsTable(bets) {
  const tbody = document.getElementById('adminAllBetsTableBody');
  if (!bets || bets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: #64748B; padding: 2rem;">
          No bets found matching current filters.
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
      statusBadge = `<span class="status-badge" style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;">Pending</span>`;
    } else if (b.status === 'won') {
      statusBadge = `<span class="status-badge" style="background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC;">WON ₹${b.winAmount.toLocaleString()}</span>`;
    } else {
      statusBadge = `<span class="status-badge" style="background: #FEE2E2; color: #B91C1C; border: 1px solid #FCA5A5;">LOST</span>`;
    }

    const timeStr = new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
      <td style="font-family: var(--font-mono); color: #0F172A; font-weight: 700;">${b.date}</td>
      <td style="font-weight: 800; color: #0F172A;">${b.username}</td>
      <td style="font-weight: 700; color: #334155;">${b.marketName}</td>
      <td style="color: #B45309; font-weight: 700;">${b.betType.toUpperCase()}</td>
      <td style="font-family: var(--font-mono); font-size: 1.15rem; font-weight: 900; color: #0F172A;">${b.number}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #0F172A;">₹${b.amount}</td>
      <td>${statusBadge}</td>
      <td style="font-family: var(--font-mono); color: ${b.status === 'won' ? '#15803D' : '#64748B'}; font-weight: 800;">
        ${b.status === 'won' ? `+₹${b.winAmount.toLocaleString()}` : '₹0'}
      </td>
      <td style="font-size: 0.8rem; color: #64748B; font-weight: 600;">${timeStr}</td>
    `;
    tbody.appendChild(row);
  });
}

// ======================== PAYOUTS & WITHDRAWALS ========================
async function loadAdminWithdrawals() {
  if (!adminState.token) return;

  const statusFilter = document.getElementById('adminWdStatusFilter')?.value || 'pending';
  const searchQuery = document.getElementById('adminWdSearchInput')?.value || '';

  try {
    const query = new URLSearchParams();
    if (statusFilter) query.append('status', statusFilter);
    if (searchQuery) query.append('search', searchQuery);

    const res = await fetch(`/api/admin/withdrawals?${query.toString()}`, {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
    const data = await res.json();

    if (data.stats) {
      document.getElementById('statWdPendingCount').textContent = data.stats.pendingCount || 0;
      document.getElementById('statWdPendingAmount').textContent = '₹' + (data.stats.pendingAmount || 0).toLocaleString();
      document.getElementById('statWdCompletedAmount').textContent = '₹' + (data.stats.completedAmount || 0).toLocaleString();
      document.getElementById('statWdTotalCount').textContent = data.stats.totalRequests || 0;
    }

    renderAdminWithdrawalsTable(data.withdrawals || []);
  } catch (err) {
    console.error('Failed to load withdrawals:', err);
    showToast('Failed to load withdrawals', 'error');
  }
}

function renderAdminWithdrawalsTable(withdrawals) {
  const tbody = document.getElementById('adminWithdrawalsTableBody');
  if (!tbody) return;

  if (!withdrawals || withdrawals.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #64748B; padding: 2rem;">
          No withdrawal requests found matching current filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  withdrawals.forEach(w => {
    const row = document.createElement('tr');
    const timeStr = new Date(w.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

    let statusBadge = '';
    if (w.status === 'completed') {
      statusBadge = '<span class="status-badge" style="background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC;">PAID</span>';
    } else if (w.status === 'rejected') {
      statusBadge = '<span class="status-badge" style="background: #FEE2E2; color: #B91C1C; border: 1px solid #FCA5A5;">REJECTED</span>';
    } else {
      statusBadge = '<span class="status-badge" style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;">PENDING</span>';
    }

    let detailHtml = '';
    if (w.method === 'upi') {
      const upi = w.paymentDetails?.upiId || '-';
      detailHtml = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-family: var(--font-mono); font-weight: 700; color: #B45309;">${upi}</span>
          <button class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 800;" onclick="copyToClipboard('${upi}', this)">📋 Copy</button>
        </div>
      `;
    } else {
      const acc = w.paymentDetails?.bankAccount || '-';
      const ifsc = w.paymentDetails?.ifsc || '-';
      const holder = w.paymentDetails?.accountHolder || '-';
      detailHtml = `
        <div style="font-size: 0.8rem; line-height: 1.4; color: #0F172A;">
          <strong>${holder}</strong><br>
          A/C: <span style="font-family: var(--font-mono); color: #B45309; font-weight: 700;">${acc}</span>
          <button class="btn btn-secondary btn-sm" style="padding: 0.1rem 0.4rem; font-size: 0.65rem; font-weight: 800;" onclick="copyToClipboard('${acc}', this)">📋</button><br>
          IFSC: <span style="font-family: var(--font-mono); font-weight: 700;">${ifsc}</span>
        </div>
      `;
    }

    let actionButtons = '';
    if (w.status === 'pending') {
      actionButtons = `
        <div style="display: flex; gap: 0.35rem;">
          <button class="btn btn-success btn-sm" onclick="openPayoutActionModal('${w.id}', 'approve', '${w.username}', ${w.amount})" style="font-weight: 800;">
            ✓ Mark Paid
          </button>
          <button class="btn btn-danger btn-sm" onclick="openPayoutActionModal('${w.id}', 'reject', '${w.username}', ${w.amount})" style="font-weight: 800;">
            ✕ Reject & Refund
          </button>
        </div>
      `;
    } else {
      actionButtons = `<span style="font-size: 0.8rem; color: #64748B; font-weight: 600;">${w.notes || 'Settled'}</span>`;
    }

    row.innerHTML = `
      <td>
        <div style="font-family: var(--font-mono); font-weight: 800; color: #0F172A; font-size: 0.85rem;">${w.id}</div>
        <div style="font-size: 0.75rem; color: #64748B;">${timeStr}</div>
      </td>
      <td>
        <strong style="color: #0F172A;">${w.username}</strong>
        ${w.phone ? `<div style="font-size: 0.75rem; color: #475569;">${w.phone}</div>` : ''}
      </td>
      <td style="font-family: var(--font-mono); font-size: 1.15rem; font-weight: 900; color: #B45309;">
        ₹${w.amount.toLocaleString()}
      </td>
      <td><span class="status-badge" style="text-transform: uppercase; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1;">${w.method}</span></td>
      <td>${detailHtml}</td>
      <td>${statusBadge}</td>
      <td>${actionButtons}</td>
    `;
    tbody.appendChild(row);
  });
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Copied';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }
    showToast(`Copied "${text}" to clipboard`, 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

function openPayoutActionModal(id, action, username, amount) {
  document.getElementById('payoutActionWdId').value = id;
  document.getElementById('payoutActionType').value = action;
  const title = document.getElementById('payoutActionTitle');
  const prompt = document.getElementById('payoutActionPrompt');
  const noteLabel = document.getElementById('payoutActionNoteLabel');
  const submitBtn = document.getElementById('payoutActionSubmitBtn');
  const noteInput = document.getElementById('payoutActionNote');

  noteInput.value = '';

  if (action === 'approve') {
    title.textContent = 'Confirm Payout Disbursement';
    prompt.innerHTML = `Are you sure you want to mark withdrawal <strong>${id}</strong> for <strong>${username}</strong> of <span style="color: var(--gold-text); font-weight: 800;">₹${amount.toLocaleString()}</span> as <strong>PAID</strong>?`;
    noteLabel.textContent = 'Bank UTR / Transaction Reference ID (Optional)';
    submitBtn.textContent = '✓ Confirm Payout Paid';
    submitBtn.className = 'btn btn-success';
  } else {
    title.textContent = 'Reject & Refund Withdrawal';
    prompt.innerHTML = `Are you sure you want to <strong>REJECT</strong> request <strong>${id}</strong>?<br><br>⚠️ <span style="color: var(--neon-red);">₹${amount.toLocaleString()} will be automatically refunded back to <strong>${username}</strong>'s wallet immediately.</span>`;
    noteLabel.textContent = 'Reason for Rejection (e.g. Invalid UPI ID)';
    submitBtn.textContent = '✕ Reject & Refund Balance';
    submitBtn.className = 'btn btn-danger';
  }

  document.getElementById('payoutActionModal').classList.add('active');
}

async function submitPayoutAction(event) {
  event.preventDefault();
  const id = document.getElementById('payoutActionWdId').value;
  const action = document.getElementById('payoutActionType').value;
  const notes = document.getElementById('payoutActionNote').value.trim();

  const submitBtn = document.getElementById('payoutActionSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
  }

  try {
    const res = await fetch(`/api/admin/withdrawals/${id}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ action, notes })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      closeAdminModals();
      loadAdminWithdrawals();
    } else {
      showToast(data.error || 'Action failed', 'error');
    }
  } catch (err) {
    showToast('Network error processing payout action', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// On load
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
});
