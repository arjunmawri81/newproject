const { v4: uuidv4 } = require('uuid');
const db = require('./db');

/**
 * Declares result and automatically settles all pending bets for the market and date.
 * @param {string} marketId 
 * @param {string} date YYYY-MM-DD
 * @param {string} resultNumber 2-digit string e.g. "47"
 * @param {string} declaredBy Admin username
 */
function declareAndSettleResult(marketId, date, resultNumber, declaredBy = 'admin') {
  const data = db.get();
  
  // Format resultNumber to ensure 2-digit format e.g. "07"
  const formattedResult = String(resultNumber).padStart(2, '0');
  if (!/^\d{2}$/.test(formattedResult)) {
    throw new Error('Invalid result number. Must be a 2-digit number (00-99).');
  }

  const andar = formattedResult[0];
  const bahar = formattedResult[1];

  const market = data.markets.find(m => m.id === marketId);
  if (!market) {
    throw new Error(`Market '${marketId}' not found.`);
  }

  const jodiRate = market.jodiRate || 90;
  const harufRate = market.harufRate || 9;

  // Check if result already declared for today
  let resultRecord = data.results.find(r => r.marketId === marketId && r.date === date);
  if (resultRecord) {
    resultRecord.resultNumber = formattedResult;
    resultRecord.andar = andar;
    resultRecord.bahar = bahar;
    resultRecord.declaredAt = new Date().toISOString();
    resultRecord.declaredBy = declaredBy;
  } else {
    resultRecord = {
      id: uuidv4(),
      marketId,
      date,
      resultNumber: formattedResult,
      andar,
      bahar,
      declaredAt: new Date().toISOString(),
      declaredBy
    };
    data.results.push(resultRecord);
  }

  // Find all bets for this market and date
  const pendingBets = data.bets.filter(b => b.marketId === marketId && b.date === date && b.status === 'pending');
  
  let totalWinners = 0;
  let totalPayout = 0;
  let totalLosers = 0;
  const winnerDetails = [];

  for (const bet of pendingBets) {
    let isWon = false;
    let winMultiplier = 0;

    if (bet.betType === 'jodi') {
      const betNum = String(bet.number).padStart(2, '0');
      if (betNum === formattedResult) {
        isWon = true;
        winMultiplier = jodiRate;
      }
    } else if (bet.betType === 'haruf_andar') {
      if (String(bet.number) === andar) {
        isWon = true;
        winMultiplier = harufRate;
      }
    } else if (bet.betType === 'haruf_bahar') {
      if (String(bet.number) === bahar) {
        isWon = true;
        winMultiplier = harufRate;
      }
    }

    if (isWon) {
      const winAmount = Math.round(bet.amount * winMultiplier);
      bet.status = 'won';
      bet.winAmount = winAmount;
      bet.settledAt = new Date().toISOString();

      // Find user and credit balance
      const user = data.users.find(u => u.id === bet.userId);
      if (user) {
        user.balance = (user.balance || 0) + winAmount;

        // Record transaction
        data.transactions.push({
          id: uuidv4(),
          userId: user.id,
          username: user.username,
          type: 'bet_won',
          amount: winAmount,
          balanceAfter: user.balance,
          description: `Won ₹${winAmount} in ${market.name} [${bet.betType.toUpperCase()}: ${bet.number}]`,
          referenceId: bet.id,
          createdAt: new Date().toISOString()
        });

        winnerDetails.push({
          username: user.username,
          betType: bet.betType,
          number: bet.number,
          betAmount: bet.amount,
          winAmount,
          newBalance: user.balance
        });
      }

      totalWinners++;
      totalPayout += winAmount;
    } else {
      bet.status = 'lost';
      bet.winAmount = 0;
      bet.settledAt = new Date().toISOString();
      totalLosers++;
    }
  }

  // Save changes
  db.save();

  return {
    success: true,
    market: market.name,
    marketId,
    date,
    resultNumber: formattedResult,
    andar,
    bahar,
    totalBetsEvaluated: pendingBets.length,
    totalWinners,
    totalLosers,
    totalPayout,
    winnerDetails
  };
}

/**
 * Calculates current bet exposure / liability for a market and date.
 * Shows admin how much is bet on each number and total liability per number.
 */
function getMarketExposure(marketId, date) {
  const data = db.get();
  const market = data.markets.find(m => m.id === marketId);
  if (!market) return null;

  const jodiRate = market.jodiRate || 90;
  const harufRate = market.harufRate || 9;

  const bets = data.bets.filter(b => b.marketId === marketId && b.date === date && b.status === 'pending');

  let totalCollection = 0;
  const jodiBets = {}; // '00' to '99' -> amount
  const harufAndarBets = {}; // '0' to '9' -> amount
  const harufBaharBets = {}; // '0' to '9' -> amount

  // Initialize
  for (let i = 0; i < 100; i++) {
    const key = String(i).padStart(2, '0');
    jodiBets[key] = 0;
  }
  for (let i = 0; i < 10; i++) {
    const key = String(i);
    harufAndarBets[key] = 0;
    harufBaharBets[key] = 0;
  }

  for (const bet of bets) {
    totalCollection += bet.amount;
    if (bet.betType === 'jodi') {
      const num = String(bet.number).padStart(2, '0');
      jodiBets[num] = (jodiBets[num] || 0) + bet.amount;
    } else if (bet.betType === 'haruf_andar') {
      const num = String(bet.number);
      harufAndarBets[num] = (harufAndarBets[num] || 0) + bet.amount;
    } else if (bet.betType === 'haruf_bahar') {
      const num = String(bet.number);
      harufBaharBets[num] = (harufBaharBets[num] || 0) + bet.amount;
    }
  }

  // Calculate potential net payout for each 2-digit number (00 to 99)
  const numbersReport = [];
  for (let i = 0; i < 100; i++) {
    const numStr = String(i).padStart(2, '0');
    const a = numStr[0];
    const b = numStr[1];

    const jodiAmt = jodiBets[numStr] || 0;
    const andarAmt = harufAndarBets[a] || 0;
    const baharAmt = harufBaharBets[b] || 0;

    const jodiPayout = jodiAmt * jodiRate;
    const harufPayout = (andarAmt + baharAmt) * harufRate;
    const totalPayout = jodiPayout + harufPayout;
    const netProfitOrLoss = totalCollection - totalPayout; // positive = admin profit, negative = admin loss

    numbersReport.push({
      number: numStr,
      jodiBet: jodiAmt,
      totalPayout,
      netProfitOrLoss
    });
  }

  return {
    marketId,
    marketName: market.name,
    date,
    totalBetsCount: bets.length,
    totalCollection,
    harufAndarBets,
    harufBaharBets,
    numbersReport: numbersReport.sort((a, b) => b.totalPayout - a.totalPayout) // highest liability first
  };
}

module.exports = {
  declareAndSettleResult,
  getMarketExposure
};
