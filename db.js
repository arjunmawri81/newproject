const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data', 'database.json');

// Ensure data directory exists
const dataDir = path.dirname(DB_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initial structure
const defaultData = {
  users: [],
  markets: [
    {
      id: 'DB',
      name: 'Delhi Bazaar',
      code: 'DB',
      openTime: '06:00',
      closeTime: '15:00',
      resultTime: '15:15',
      jodiRate: 90,
      harufRate: 9,
      active: true
    },
    {
      id: 'SG',
      name: 'Shri Ganesh',
      code: 'SG',
      openTime: '06:00',
      closeTime: '16:15',
      resultTime: '16:30',
      jodiRate: 90,
      harufRate: 9,
      active: true
    },
    {
      id: 'FB',
      name: 'Faridabad',
      code: 'FB',
      openTime: '06:00',
      closeTime: '17:45',
      resultTime: '18:00',
      jodiRate: 90,
      harufRate: 9,
      active: true
    },
    {
      id: 'GB',
      name: 'Ghaziabad',
      code: 'GB',
      openTime: '06:00',
      closeTime: '20:00',
      resultTime: '20:15',
      jodiRate: 90,
      harufRate: 9,
      active: true
    },
    {
      id: 'GALI',
      name: 'Gali',
      code: 'GALI',
      openTime: '06:00',
      closeTime: '23:00',
      resultTime: '23:30',
      jodiRate: 90,
      harufRate: 9,
      active: true
    },
    {
      id: 'DS',
      name: 'Desawar',
      code: 'DS',
      openTime: '06:00',
      closeTime: '04:30',
      resultTime: '05:00',
      jodiRate: 90,
      harufRate: 9,
      active: true
    }
  ],
  bets: [],
  results: [],
  transactions: [],
  withdrawals: []
};

let db = null;
let lastBackupTime = 0;

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
    } catch (err) {
      console.error('Error reading database, restoring defaults:', err);
      db = JSON.parse(JSON.stringify(defaultData));
      saveDb();
    }
  } else {
    db = JSON.parse(JSON.stringify(defaultData));
    saveDb();
  }

  // Ensure all collections exist
  for (const key of Object.keys(defaultData)) {
    if (!db[key]) {
      db[key] = defaultData[key];
    }
  }

  // Ensure default demo admin and player accounts always exist with guaranteed passwords
  const adminUser = db.users.find(u => u.username === 'admin');
  const adminPass = bcrypt.hashSync('admin123', 10);
  if (!adminUser) {
    db.users.push({
      id: 'user_admin',
      username: 'admin',
      phone: '9999999999',
      password: adminPass,
      role: 'admin',
      balance: 500000,
      createdAt: new Date().toISOString()
    });
  } else {
    adminUser.password = adminPass;
    adminUser.role = 'admin';
  }

  const demoUser = db.users.find(u => u.username === 'demo_user');
  const demoPass = bcrypt.hashSync('demo123', 10);
  if (!demoUser) {
    db.users.push({
      id: 'user_demo',
      username: 'demo_user',
      phone: '9888888888',
      password: demoPass,
      role: 'user',
      balance: 25000,
      createdAt: new Date().toISOString()
    });
  } else {
    demoUser.password = demoPass;
  }

  const player1User = db.users.find(u => u.username === 'player1');
  const playerPass = bcrypt.hashSync('player123', 10);
  if (!player1User) {
    db.users.push({
      id: 'user_player1',
      username: 'player1',
      phone: '9876543210',
      password: playerPass,
      role: 'user',
      balance: 25000,
      createdAt: new Date().toISOString()
    });
  } else {
    player1User.password = playerPass;
  }

  saveDb();
}

function saveDb() {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    const jsonStr = JSON.stringify(db, null, 2);
    fs.writeFileSync(tempFile, jsonStr, 'utf8');
    fs.renameSync(tempFile, DB_FILE);

    // Create a rotating backup every 5 minutes on state-changing saves
    const now = Date.now();
    if (now - lastBackupTime > 5 * 60 * 1000) {
      const backupFile = path.join(dataDir, 'database.backup.json');
      fs.writeFileSync(backupFile, jsonStr, 'utf8');
      lastBackupTime = now;
    }
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// Initialize on module load
loadDb();

module.exports = {
  get: () => db,
  save: saveDb,
  reload: loadDb
};
