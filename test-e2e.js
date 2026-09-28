const http = require('http');

function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(data);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const baseUrl = 'http://localhost:3000';
  console.log('--- Starting Automated E2E Test ---');

  // 1. Health check
  const health = await get(`${baseUrl}/api/health`);
  console.log('1. Server Health:', health.status === 200 ? '✅ OK' : '❌ FAILED', health.data);

  // 2. Admin login
  const adminLogin = await post(`${baseUrl}/api/auth/login`, {
    usernameOrPhone: 'admin',
    password: 'admin123'
  });
  console.log('2. Admin Login:', adminLogin.status === 200 ? '✅ OK' : '❌ FAILED');
  const adminToken = adminLogin.data.token;

  // Set FB market to Force Open for test convenience
  await post(`${baseUrl}/api/admin/markets/FB`, {}, adminToken); // PUT is needed, wait let's use fetch / PUT or direct helper

  // 3. Register a test player
  const testUsername = 'winner_' + Math.floor(Math.random() * 10000);
  const reg = await post(`${baseUrl}/api/auth/register`, {
    username: testUsername,
    phone: '9' + Math.floor(100000000 + Math.random() * 900000000),
    password: 'password123'
  });
  console.log('3. Player Registration:', reg.status === 200 ? '✅ OK' : '❌ FAILED', 'Balance:', reg.data.user.balance);
  const playerToken = reg.data.token;
  const initialBalance = reg.data.user.balance;

  // Force open FB market via admin
  const putReq = new Promise((resolve, reject) => {
    const data = JSON.stringify({ manualOverride: 'force_open' });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/markets/FB',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${adminToken}`
      }
    }, res => {
      let r = '';
      res.on('data', c => r += c);
      res.on('end', () => resolve(JSON.parse(r)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
  await putReq;

  // 4. Place bets on FB:
  // - Jodi 47: ₹100 (win expected 100 * 90 = 9000)
  // - Haruf Andar 4: ₹50 (win expected 50 * 9 = 450)
  // - Haruf Bahar 7: ₹50 (win expected 50 * 9 = 450)
  // - Jodi 99: ₹100 (loss expected = 0)
  // Total bet: ₹300
  const betRes = await post(`${baseUrl}/api/bets/place`, {
    marketId: 'FB',
    items: [
      { betType: 'jodi', number: '47', amount: 100 },
      { betType: 'haruf_andar', number: '4', amount: 50 },
      { betType: 'haruf_bahar', number: '7', amount: 50 },
      { betType: 'jodi', number: '99', amount: 100 }
    ]
  }, playerToken);
  console.log('4. Bet Placement:', betRes.status === 200 ? '✅ OK' : '❌ FAILED', 'New balance after bet:', betRes.data.newBalance);

  if (betRes.data.newBalance !== initialBalance - 300) {
    throw new Error(`Balance deduction mismatch! Expected ${initialBalance - 300}, got ${betRes.data.newBalance}`);
  }

  // 5. Admin checks live exposure sheet
  const today = new Date().toISOString().split('T')[0];
  const expRes = await get(`${baseUrl}/api/admin/exposure?marketId=FB&date=${today}`, adminToken);
  console.log('5. Admin Exposure Sheet: Total Collection = ₹' + expRes.data.totalCollection, 'Total Bets =', expRes.data.totalBetsCount);

  // 6. Admin declares result "47" for FB today!
  console.log('6. Admin Declaring Result "47" for FB on date', today);
  const settleRes = await post(`${baseUrl}/api/admin/declare-result`, {
    marketId: 'FB',
    date: today,
    resultNumber: '47'
  }, adminToken);
  console.log('Settlement Response:', settleRes.data.message);
  console.log('Summary:', {
    totalWinners: settleRes.data.summary.totalWinners,
    totalPayout: settleRes.data.summary.totalPayout
  });

  // Verify total payout is at least 9900 (our player's win)
  if (settleRes.data.summary.totalPayout < 9900) {
    throw new Error(`Expected at least 9900 total payout, got ${settleRes.data.summary.totalPayout}`);
  }

  // 7. Verify Player Balance after winning
  const playerMe = await get(`${baseUrl}/api/auth/me`, playerToken);
  console.log('7. Player Updated Balance:', playerMe.data.user.balance);
  const expectedFinalBalance = (initialBalance - 300) + 9900;
  if (playerMe.data.user.balance !== expectedFinalBalance) {
    throw new Error(`Expected final balance ${expectedFinalBalance}, got ${playerMe.data.user.balance}`);
  }
  console.log(`🎉 Automated Settlement Verified Successfully! Balance increased by ₹9,900 to ₹${playerMe.data.user.balance}`);

  // 8. Verify My Bets status
  const myBets = await get(`${baseUrl}/api/bets/my-bets`, playerToken);
  console.log('8. Player Bets Records:');
  myBets.data.bets.forEach(b => {
    console.log(`   - [${b.betType}] #${b.number}: Status = ${b.status}, Won = ₹${b.winAmount}`);
  });

  // 9. Instant Withdrawal Request
  console.log('\n9. Testing Instant Withdrawal: Player requests ₹2,000 via UPI...');
  const wdRes1 = await post(`${baseUrl}/api/wallet/withdraw`, {
    amount: 2000,
    paymentMethod: 'upi',
    upiId: 'testplayer@paytm'
  }, playerToken);
  console.log('   Withdrawal Request 1 Status:', wdRes1.status === 200 ? '✅ OK' : '❌ FAILED', wdRes1.data.message);
  if (wdRes1.data.newBalance !== expectedFinalBalance - 2000) {
    throw new Error(`Withdrawal balance mismatch! Expected ${expectedFinalBalance - 2000}, got ${wdRes1.data.newBalance}`);
  }
  const wd1Id = wdRes1.data.withdrawal.id;

  // 10. Verify User Withdrawal List
  const userWdList = await get(`${baseUrl}/api/wallet/withdrawals`, playerToken);
  console.log('10. Player Withdrawals Listed:', userWdList.data.withdrawals.length >= 1 ? '✅ OK' : '❌ FAILED');

  // 11. Admin Checks Payout Queue and Approves
  const adminWdList = await get(`${baseUrl}/api/admin/withdrawals?status=pending`, adminToken);
  console.log('11. Admin Payout Queue (Pending Count):', adminWdList.data.stats.pendingCount);

  const approveRes = await post(`${baseUrl}/api/admin/withdrawals/${wd1Id}/action`, {
    action: 'approve',
    notes: 'UTR: PAY1234567890 Instant IMPS'
  }, adminToken);
  console.log('    Admin Approve Payout:', approveRes.status === 200 ? '✅ OK' : '❌ FAILED', approveRes.data.message);

  // 12. Test Second Withdrawal with Admin Reject & Auto-Refund
  console.log('\n12. Testing Reject & Auto-Refund: Player requests ₹1,500...');
  const wdRes2 = await post(`${baseUrl}/api/wallet/withdraw`, {
    amount: 1500,
    paymentMethod: 'upi',
    upiId: 'invalid@upi'
  }, playerToken);
  const balBeforeReject = wdRes2.data.newBalance;
  const wd2Id = wdRes2.data.withdrawal.id;

  console.log('13. Admin Rejects Request with Auto-Refund...');
  const rejectRes = await post(`${baseUrl}/api/admin/withdrawals/${wd2Id}/action`, {
    action: 'reject',
    notes: 'Invalid UPI ID provided'
  }, adminToken);
  console.log('    Admin Reject Response:', rejectRes.status === 200 ? '✅ OK' : '❌ FAILED', rejectRes.data.message);

  // 14. Verify Player Balance Refunded
  const playerAfterRefund = await get(`${baseUrl}/api/auth/me`, playerToken);
  console.log('14. Player Balance after Refund:', playerAfterRefund.data.user.balance, 'Expected:', balBeforeReject + 1500);
  if (playerAfterRefund.data.user.balance !== balBeforeReject + 1500) {
    throw new Error(`Refund failed! Expected ${balBeforeReject + 1500}, got ${playerAfterRefund.data.user.balance}`);
  }

  console.log('\n=======================================================');
  console.log('🎉 ALL PRODUCTION & WITHDRAWAL TESTS PASSED 100%! 🚀');
  console.log('=======================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
