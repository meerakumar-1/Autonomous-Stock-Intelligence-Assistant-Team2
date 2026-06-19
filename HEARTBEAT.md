# HEARTBEAT.md — Stock Pulse Background Daemon Configuration

## What is the Heartbeat?

The heartbeat is the background pulse of Stock Pulse — autonomous actions the agent takes
without being explicitly prompted. It runs as a cron daemon every 2 minutes inside `bot.js`.

---

## Current Heartbeat Tasks

### 1. Price Alert Monitor (every 2 minutes)
- **Trigger:** `cron.schedule('*/2 * * * *', ...)`
- **Action:** Reads all untriggered alerts from SQLite. Groups by ticker to minimise API calls.
  For each ticker, fetches live price via `/analysis`. If the price crosses the user's target
  in the alert's locked direction, sends a Telegram notification and marks the alert as triggered.
- **Why:** Users set alerts and forget — the bot watches so they don't have to.

---

## Planned Heartbeat Tasks

### 2. Daily Market Digest (08:00 IST)
- **Trigger:** `cron.schedule('30 2 * * *', ...)` (08:00 IST = 02:30 UTC)
- **Action:** Fetch top movers and notable stock events. Send a morning digest to subscribed users.
- **Status:** Planned — users will opt-in via `/subscribe digest`

### 3. Weekly Portfolio Summary (Monday 09:00 IST)
- **Action:** For each user with portfolio holdings, fetch current prices and compute
  unrealized P&L. Send a weekly summary card.
- **Status:** Planned

---

## Heartbeat Philosophy

The heartbeat should be **non-intrusive** — only send a message when there is something
actionable to say. No spam, no noise. Every proactive message must pass the test:
*"Would the user thank me for sending this right now?"*

---

## Extending the Heartbeat

To add a new background task:
1. Add a `cron.schedule(...)` block in `backend/bot.js`
2. Document the trigger and action here in `HEARTBEAT.md`
3. Ensure the task is idempotent (safe to run multiple times without side effects)
4. Log every run with `console.log('[cron] <task-name>…')`
