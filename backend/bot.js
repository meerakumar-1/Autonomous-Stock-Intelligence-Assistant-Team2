const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });


const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const { createClient } = require('redis');

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN = process.env.TOKEN;
const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

if (!TOKEN) {
  console.error('❌ FATAL: Telegram Bot TOKEN is not provided in environment variables.');
  console.error('Check your .env file in the backend directory.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });


// ── Database Setup ────────────────────────────────────────────────────────────
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) return console.error('DB error:', err.message);
  console.log('Connected to SQLite database.');
});

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.connect().then(() => console.log('Connected to Redis database.'));


db.run(`
  CREATE TABLE IF NOT EXISTS portfolio (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER NOT NULL,
    ticker     TEXT    NOT NULL COLLATE NOCASE,
    quantity   REAL    NOT NULL,
    buy_price  REAL    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch analysis from Python FastAPI service */
async function fetchAnalysis(ticker) {
  const res = await axios.get(`${PYTHON_API}/analysis`, {
    params: { ticker },
    timeout: 15000,
  });
  return res.data; // { ticker, price, ma20, ma50, rsi, signal }
}

/** Fetch LLM explanation from Python/Ollama service */
async function fetchExplanation(analysisData) {
  const res = await axios.post(`${PYTHON_API}/explain`, analysisData, {
    timeout: 60000,
  });
  return res.data.explanation;
}

/** Format analysis result into a readable message */
function formatAnalysis(data, explanation) {
  const signal = {
    buy:  '🟢 BUY',
    sell: '🔴 SELL',
    hold: '🟡 HOLD',
  }[data.signal?.toLowerCase()] ?? '⚪ UNKNOWN';

  return (
    `📊 *${data.ticker.toUpperCase()} Analysis*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 Price:  ₹${data.price}\n` +
    `📈 MA20:   ₹${data.ma20}\n` +
    `📉 MA50:   ₹${data.ma50}\n` +
    `⚡ RSI:    ${data.rsi}\n` +
    `📌 Signal: ${signal}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *AI Insight:*\n${explanation ?? '_Not available_'}`
  );
}

// ── Commands ──────────────────────────────────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 *Stock Pulse Bot* is live!\n\n` +
    `Available commands:\n` +
    `• /analyze <ticker> – Full stock analysis with AI insight\n` +
    `• /sellalert <ticker> <price> – Set a sell price alert\n` +
    `• /buyalert <ticker> <price> – Set a buy price alert\n` +
    `• /alerts – List your active alerts\n` +
    `• /cancelalert <id> – Remove an alert\n` +
    `• /updatealert <id> <price> – Update an alert's target price\n` +
    `• /buy <ticker> <qty> <price> – Add stock to portfolio\n` +
    `• /sell <ticker> [qty] – Sell from portfolio\n` +
    `• /portfolio – View your portfolio\n` +
    `• /help – Show this message`,
    { parse_mode: 'Markdown' }
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `*Stock Pulse — Commands*\n\n` +
    `📊 *Analysis*\n` +
    `/analyze RELIANCE – Full technical analysis + AI insight\n\n` +
    `🔔 *Alerts*\n` +
    `/sellalert TCS 3500 – Alert when TCS goes above ₹3500\n` +
    `/buyalert TCS 3000 – Alert when TCS dips below ₹3000\n` +
    `/alerts – View all your active alerts\n` +
    `/cancelalert 3 – Cancel alert #3\n` +
    `/updatealert 3 3600 – Update alert #3 to ₹3600\n\n` +
    `💼 *Portfolio*\n` +
    `/buy TCS 10 3500 – Buy 10 shares of TCS at ₹3500\n` +
    `/sell TCS 5 – Sell 5 shares of TCS\n` +
    `/sell TCS – Sell entire TCS holding\n` +
    `/portfolio – View your holdings`,
    { parse_mode: 'Markdown' }
  );
});

// Check python service status
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get(`${PYTHON_API}/`);
        bot.sendMessage(chatId, `🐍 Python Service Status: ${response.data.status} at ${response.data.time}`);
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error connecting to Python Service: ${error.message}`);
    }
});

// Get info for a ticker
bot.onText(/\/info (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const ticker = match[1].toUpperCase();
    
    try {
        const response = await axios.get(`${PYTHON_API}/info`, { params: { ticker } });
        const data = response.data;
        bot.sendMessage(chatId, `📈 **${data.ticker} Info**\nUnits: ${data.units}\nCap: $${data.cap}\nCurrent Value: $${data.current_value}`, { parse_mode: 'Markdown' });
    } catch (error) {
        if (error.response && error.response.status === 400) {
            bot.sendMessage(chatId, `⚠️ ${error.response.data.detail}`);
        } else {
            bot.sendMessage(chatId, `❌ Error fetching info: ${error.message}`);
        }
    }
});

// Echo any message (for testing)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore commands
    if (text.startsWith('/')) return;

    console.log("Received:", text);
    bot.sendMessage(chatId, `You said: ${text}`);
});

// /analyze <ticker>
bot.onText(/\/analyze(?:\s+(.*))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const ticker = match[1]?.trim()?.toUpperCase();

  if (!ticker) {
    return bot.sendMessage(chatId, '❓ Usage: `/analyze RELIANCE`', { parse_mode: 'Markdown' });
  }

  const waiting = await bot.sendMessage(chatId, `🔍 Fetching analysis for *${ticker}*…`, {
    parse_mode: 'Markdown',
  });

  try {
    const data = await fetchAnalysis(ticker);

    // Try to get LLM explanation (non-blocking – won't fail if unavailable)
    let explanation = null;
    try {
      explanation = await fetchExplanation(data);
    } catch {
      explanation = '_AI explanation service unavailable._';
    }

    await bot.editMessageText(formatAnalysis(data, explanation), {
      chat_id: chatId,
      message_id: waiting.message_id,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('/analyze error:', err.message);
    const detail = err.response?.data?.detail ?? err.message;
    bot.editMessageText(
      `❌ Error for *${ticker}*: ${detail}\n\nMake sure the ticker is correct (e.g., RELIANCE or WIPRO).`,
      { chat_id: chatId, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  }
});


// /ipo – list recent IPO debut stocks with live prices
bot.onText(/\/ipo$/, async (msg) => {
  const chatId = msg.chat.id;

  const loading = await bot.sendMessage(chatId, '🔍 Fetching recent IPO listings…');

  try {
    const res = await axios.get(`${PYTHON_API}/ipos`, { params: { limit: 8 }, timeout: 30000 });
    const ipos = res.data.ipos;

    if (!ipos || ipos.length === 0) {
      return bot.editMessageText('ℹ️ No IPO data available right now.', {
        chat_id: chatId, message_id: loading.message_id,
      });
    }

    const lines = ipos.map((ipo) => {
      const price  = ipo.current_price != null ? `₹${ipo.current_price}` : 'N/A';
      const change = ipo.change_pct != null
        ? (ipo.change_pct >= 0 ? `📈 +${ipo.change_pct}%` : `📉 ${ipo.change_pct}%`)
        : '';
      return `• *${ipo.name}* (${ipo.ticker.replace('.NS', '')})\n  Listed: ${ipo.ipo_date}  |  ${price}  ${change}`;
    });

    await bot.editMessageText(
      `🚀 *Recent IPO Listings*\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n\n')}`,
      { chat_id: chatId, message_id: loading.message_id, parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('/ipo error:', err.message);
    bot.editMessageText('❌ Could not fetch IPO data. Is the Python service running?', {
      chat_id: chatId, message_id: loading.message_id,
    });
  }
});

// /sellalert <ticker> <price>
bot.onText(/\/sellalert(?:\s+(.*))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1]?.trim().split(/\s+/);

  if (!args || args.length < 2) {
    return bot.sendMessage(chatId, '❓ Usage: `/sellalert TCS 3500`', { parse_mode: 'Markdown' });
  }

  const ticker = args[0].toUpperCase();
  const target = parseFloat(args[1]);

  if (isNaN(target) || target <= 0) {
    return bot.sendMessage(chatId, '❌ Invalid price. Usage: `/sellalert TCS 3500`', { parse_mode: 'Markdown' });
  }

  const waiting = await bot.sendMessage(chatId, `⏳ Verifying *${ticker}*…`, { parse_mode: 'Markdown' });

  // Validate ticker before saving
  try {
    await fetchAnalysis(ticker);
  } catch (err) {
    const detail = err.response?.data?.detail ?? 'Stock not found.';
    return bot.editMessageText(`❌ *${ticker}*: ${detail}`, {
      chat_id: chatId,
      message_id: waiting.message_id,
      parse_mode: 'Markdown',
    });
  }

  try {
    const alertId = await redisClient.incr('alert_id_seq');
    await redisClient.hSet(`alert:${alertId}`, {
      id: alertId.toString(),
      chat_id: chatId.toString(),
      ticker: ticker,
      target: target.toString(),
      direction: 'above',
      triggered: '0',
      created_at: new Date().toISOString()
    });
    await redisClient.sAdd(`user_alerts:${chatId}`, alertId.toString());
    await redisClient.sAdd(`active_alerts`, alertId.toString());

    bot.editMessageText(
      `✅ Sell Alert set!\n📌 *${ticker}* @ ₹${target}\nID: \`${alertId}\`\n\nYou'll be notified when the price goes above this level.`,
      { chat_id: chatId, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  } catch (err) {
    bot.editMessageText('❌ Failed to save alert.', { chat_id: chatId, message_id: waiting.message_id });
  }
});

// /buyalert <ticker> <price>
bot.onText(/\/buyalert(?:\s+(.*))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1]?.trim().split(/\s+/);

  if (!args || args.length < 2) {
    return bot.sendMessage(chatId, '❓ Usage: `/buyalert TCS 3000`', { parse_mode: 'Markdown' });
  }

  const ticker = args[0].toUpperCase();
  const target = parseFloat(args[1]);

  if (isNaN(target) || target <= 0) {
    return bot.sendMessage(chatId, '❌ Invalid price. Usage: `/buyalert TCS 3000`', { parse_mode: 'Markdown' });
  }

  const waiting = await bot.sendMessage(chatId, `⏳ Verifying *${ticker}*…`, { parse_mode: 'Markdown' });

  // Validate ticker before saving
  try {
    await fetchAnalysis(ticker);
  } catch (err) {
    const detail = err.response?.data?.detail ?? 'Stock not found.';
    return bot.editMessageText(`❌ *${ticker}*: ${detail}`, {
      chat_id: chatId,
      message_id: waiting.message_id,
      parse_mode: 'Markdown',
    });
  }

  try {
    const alertId = await redisClient.incr('alert_id_seq');
    await redisClient.hSet(`alert:${alertId}`, {
      id: alertId.toString(),
      chat_id: chatId.toString(),
      ticker: ticker,
      target: target.toString(),
      direction: 'below',
      triggered: '0',
      created_at: new Date().toISOString()
    });
    await redisClient.sAdd(`user_alerts:${chatId}`, alertId.toString());
    await redisClient.sAdd(`active_alerts`, alertId.toString());

    bot.editMessageText(
      `✅ Buy Alert set!\n📌 *${ticker}* @ ₹${target}\nID: \`${alertId}\`\n\nYou'll be notified when the price dips below this level.`,
      { chat_id: chatId, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  } catch (err) {
    bot.editMessageText('❌ Failed to save alert.', { chat_id: chatId, message_id: waiting.message_id });
  }
});


// /alerts – list active alerts for this user
bot.onText(/\/alerts$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const alertIds = await redisClient.sMembers(`user_alerts:${chatId}`);
    if (!alertIds.length) {
      return bot.sendMessage(chatId, 'ℹ️ You have no active alerts.\n\nUse /sellalert or /buyalert <ticker> <price> to set one.');
    }
    
    const alerts = [];
    for (const id of alertIds) {
      const data = await redisClient.hGetAll(`alert:${id}`);
      if (data && data.triggered === '0') {
         alerts.push(data);
      }
    }
    
    alerts.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    if (!alerts.length) {
       return bot.sendMessage(chatId, 'ℹ️ You have no active alerts.\n\nUse /sellalert or /buyalert <ticker> <price> to set one.');
    }

    const lines = alerts.map((r) => `• #${r.id}  *${r.ticker}*  @ ₹${r.target}`);
    bot.sendMessage(chatId, `🔔 *Your Active Alerts*\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('/alerts Redis error:', err.message);
    bot.sendMessage(chatId, '❌ Could not retrieve alerts. Please try again.');
  }
});

// /cancelalert <id>
bot.onText(/\/cancelalert\s+(\d+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = parseInt(match[1]);

  try {
    const data = await redisClient.hGetAll(`alert:${id}`);
    if (!data || data.chat_id !== chatId.toString()) {
      return bot.sendMessage(chatId, `❌ Alert #${id} not found.`);
    }
    await redisClient.sRem(`user_alerts:${chatId}`, id.toString());
    await redisClient.sRem(`active_alerts`, id.toString());
    await redisClient.del(`alert:${id}`);
    bot.sendMessage(chatId, `🗑️ Alert #${id} cancelled.`);
  } catch (err) {
    bot.sendMessage(chatId, `❌ Failed to cancel alert.`);
  }
});

// /updatealert <id> <new_price>
bot.onText(/\/updatealert(?:\s+(.*))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1]?.trim().split(/\s+/);

  if (!args || args.length < 2) {
    return bot.sendMessage(chatId, '❓ Usage: `/updatealert <id> <new_price>` (e.g., `/updatealert 3 3600`)', { parse_mode: 'Markdown' });
  }

  const id = parseInt(args[0]);
  const newTarget = parseFloat(args[1]);

  if (isNaN(id) || isNaN(newTarget) || newTarget <= 0) {
    return bot.sendMessage(chatId, '❌ Invalid ID or price. Usage: `/updatealert 3 3600`', { parse_mode: 'Markdown' });
  }

  // Update in Redis
  try {
    const data = await redisClient.hGetAll(`alert:${id}`);
    if (!data || data.chat_id !== chatId.toString()) {
      return bot.sendMessage(chatId, `❌ Alert #${id} not found or could not be updated.`);
    }
    await redisClient.hSet(`alert:${id}`, 'target', newTarget.toString());
    bot.sendMessage(chatId, `✅ Alert #${id} updated to new target: ₹${newTarget}`);
  } catch (err) {
    bot.sendMessage(chatId, `❌ Alert #${id} not found or could not be updated.`);
  }
});

// ── Alert Scheduler (every 2 minutes) ─────────────────────────────────────────
cron.schedule('*/2 * * * *', async () => {
  console.log('[cron] Checking alerts…');

  try {
    const activeIds = await redisClient.sMembers('active_alerts');
    if (!activeIds.length) return;

    const alerts = [];
    for (const id of activeIds) {
      const data = await redisClient.hGetAll(`alert:${id}`);
      if (data && data.id) {
        data.target = parseFloat(data.target);
        data.chat_id = parseInt(data.chat_id);
        alerts.push(data);
      }
    }

    // Group by ticker to minimise API calls
    const byTicker = alerts.reduce((acc, a) => {
      (acc[a.ticker] = acc[a.ticker] || []).push(a);
      return acc;
    }, {});

    for (const [ticker, group] of Object.entries(byTicker)) {
      let currentPrice;
      try {
        const data = await fetchAnalysis(ticker);
        currentPrice = data.price;
      } catch {
        console.warn(`[cron] Could not fetch price for ${ticker}`);
        continue;
      }

      for (const alert of group) {
        const hit =
          (alert.direction === 'above' && currentPrice >= alert.target) ||
          (alert.direction === 'below' && currentPrice <= alert.target) ||
          (alert.direction === 'any');    // first check sets direction

        if (alert.direction === 'any') {
          // Lock in direction based on current vs target
          const dir = currentPrice >= alert.target ? 'above' : 'below';
          await redisClient.hSet(`alert:${alert.id}`, 'direction', dir);
          continue; // evaluate on next tick
        }

        if (hit) {
          await redisClient.hSet(`alert:${alert.id}`, 'triggered', '1');
          await redisClient.sRem('active_alerts', alert.id.toString());
          bot.sendMessage(
            alert.chat_id,
            `🚨 *Price Alert Triggered!*\n\n` +
            `📌 *${ticker}* has reached ₹${currentPrice}\n` +
            `🎯 Your target: ₹${alert.target}`,
            { parse_mode: 'Markdown' }
          );
        }
      }
    }
  } catch (err) {
    console.error('[cron] Redis error:', err);
  }
});

// ── Portfolio Commands ────────────────────────────────────────────────────────

// /buy <ticker> <quantity> <price>
bot.onText(/^\/buy(?:@\S+)?(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1]?.trim().split(/\s+/);

  if (!args || args.length < 3) {
    return bot.sendMessage(chatId, '❓ Usage: `/buy TCS 10 3500` (ticker, quantity, price)', { parse_mode: 'Markdown' });
  }

  const ticker   = args[0].toUpperCase();
  const quantity = parseFloat(args[1]);
  const buyPrice = parseFloat(args[2]);

  if (isNaN(quantity) || quantity <= 0 || isNaN(buyPrice) || buyPrice <= 0) {
    return bot.sendMessage(chatId, '❌ Invalid quantity or price. Usage: `/buy TCS 10 3500`', { parse_mode: 'Markdown' });
  }

  const waiting = await bot.sendMessage(chatId, `⏳ Verifying *${ticker}*…`, { parse_mode: 'Markdown' });

  // Validate ticker before saving to portfolio
  try {
    await fetchAnalysis(ticker);
  } catch (err) {
    const detail = err.response?.data?.detail ?? 'Stock not found.';
    return bot.editMessageText(`❌ *${ticker}*: ${detail}`, {
      chat_id: chatId,
      message_id: waiting.message_id,
      parse_mode: 'Markdown',
    });
  }

  // If ticker already exists for this user, add to the holding (average down/up)
  db.get(
    `SELECT * FROM portfolio WHERE chat_id = ? AND ticker = ?`,
    [chatId, ticker],
    (err, row) => {
      if (row) {
        const newQty   = row.quantity + quantity;
        const avgPrice = ((row.quantity * row.buy_price) + (quantity * buyPrice)) / newQty;
        db.run(
          `UPDATE portfolio SET quantity = ?, buy_price = ? WHERE id = ?`,
          [newQty, avgPrice, row.id],
          (err) => {
            if (err) return bot.editMessageText('❌ Failed to update holding.', { chat_id: chatId, message_id: waiting.message_id });
            bot.editMessageText(
              `✅ *${ticker}* holding updated!\n` +
              `📦 Total qty: ${newQty}\n` +
              `💰 Avg buy price: ₹${avgPrice.toFixed(2)}`,
              { chat_id: chatId, message_id: waiting.message_id, parse_mode: 'Markdown' }
            );
          }
        );
      } else {
        db.run(
          `INSERT INTO portfolio (chat_id, ticker, quantity, buy_price) VALUES (?, ?, ?, ?)`,
          [chatId, ticker, quantity, buyPrice],
          (err) => {
            if (err) return bot.editMessageText('❌ Failed to save holding.', { chat_id: chatId, message_id: waiting.message_id });
            bot.editMessageText(
              `✅ Added to portfolio!\n` +
              `📌 *${ticker}*  ×${quantity}  @ ₹${buyPrice}`,
              { chat_id: chatId, message_id: waiting.message_id, parse_mode: 'Markdown' }
            );
          }
        );
      }
    }
  );
});


// /sell <ticker> [quantity]  — omit quantity to sell entire holding
bot.onText(/\/sell\s+(\S+)(?:\s+([\d.]+))?/i, (msg, match) => {
  const chatId  = msg.chat.id;
  const ticker  = match[1].toUpperCase();
  const sellQty = match[2] ? parseFloat(match[2]) : null;

  if (sellQty !== null && (isNaN(sellQty) || sellQty <= 0)) {
    return bot.sendMessage(chatId, '❌ Invalid quantity. Usage: /sell TCS 5  or  /sell TCS');
  }

  db.get(
    `SELECT * FROM portfolio WHERE chat_id = ? AND ticker = ?`,
    [chatId, ticker],
    (err, row) => {
      if (err || !row) {
        return bot.sendMessage(chatId, `❌ *${ticker}* not found in your portfolio.`, { parse_mode: 'Markdown' });
      }

      // Sell all if no quantity specified
      const qty = sellQty ?? row.quantity;

      if (qty > row.quantity) {
        return bot.sendMessage(
          chatId,
          `❌ You only have *${row.quantity}* shares of *${ticker}*.`,
          { parse_mode: 'Markdown' }
        );
      }

      if (qty === row.quantity) {
        // Remove the holding entirely
        db.run(`DELETE FROM portfolio WHERE id = ?`, [row.id], (err) => {
          if (err) return bot.sendMessage(chatId, '❌ Failed to update portfolio.');
          bot.sendMessage(chatId, `🗑️ Sold all *${qty}* shares of *${ticker}*.`, { parse_mode: 'Markdown' });
        });
      } else {
        // Reduce quantity — buy_price (avg) stays the same
        const remaining = row.quantity - qty;
        db.run(`UPDATE portfolio SET quantity = ? WHERE id = ?`, [remaining, row.id], (err) => {
          if (err) return bot.sendMessage(chatId, '❌ Failed to update portfolio.');
          bot.sendMessage(
            chatId,
            `✅ Sold *${qty}* shares of *${ticker}*.\n📦 Remaining: *${remaining}* shares @ ₹${row.buy_price.toFixed(2)}`,
            { parse_mode: 'Markdown' }
          );
        });
      }
    }
  );
});

// /portfolio
bot.onText(/\/portfolio$/, (msg) => {
  const chatId = msg.chat.id;

  db.all(
    `SELECT * FROM portfolio WHERE chat_id = ? ORDER BY ticker`,
    [chatId],
    (err, rows) => {
      if (err || !rows.length) {
        return bot.sendMessage(chatId, 'ℹ️ Your portfolio is empty. Use /buy to add stocks.');
      }

      const lines = rows.map((r) => {
        const invested = (r.quantity * r.buy_price).toFixed(2);
        return `• *${r.ticker}*  ×${r.quantity}  @ ₹${r.buy_price.toFixed(2)}  (₹${invested} invested)`;
      });

      const totalInvested = rows.reduce((sum, r) => sum + r.quantity * r.buy_price, 0);

      bot.sendMessage(
        chatId,
        `💼 *Your Portfolio*\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━\n💰 Total invested: ₹${totalInvested.toFixed(2)}`,
        { parse_mode: 'Markdown' }
      );
    }
  );
});

// ── Fallback for unknown commands ─────────────────────────────────────────────
// Known command prefixes — update this if you add new commands
const KNOWN_COMMANDS = [
  '/start', '/help',
  '/analyze', '/ipo',
  '/sellalert', '/buyalert', '/alerts', '/cancelalert', '/updatealert',
  '/buy', '/sell', '/portfolio',
  '/status', '/info',
];

bot.on('message', (msg) => {
  if (!msg.text || !msg.text.startsWith('/')) return;
  const cmd = msg.text.split(' ')[0].split('@')[0].toLowerCase(); // handle /cmd@botname
  if (!KNOWN_COMMANDS.includes(cmd)) {
    bot.sendMessage(msg.chat.id, `❓ Unknown command. Type /help to see what I can do.`);
  }
});

console.log('🤖 Stock Intelligence Bot started.');
