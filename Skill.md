# Skill.md — Stock Pulse Skill Definitions

Skills are discrete capabilities the agent can invoke. Each skill maps to a specific
API endpoint or bot command.

---

## Skill: stock-analysis

**Command:** `/analyze <ticker>`
**API:** `GET /analysis?ticker=<ticker>`
**Description:** Fetches 3 months of historical price data for a given ticker via yfinance.
Computes 20-day MA, 50-day MA, and 14-period RSI. Derives a BUY/SELL/HOLD signal from
the relationship between price, moving averages, and RSI thresholds.
**Output:** Formatted Telegram message with price, indicators, signal, and AI explanation.
**Fallback:** If the LLM API is unavailable, uses a rule-based explanation.

---

## Skill: price-alert

**Commands:** `/buyalert <ticker> <price>`, `/sellalert <ticker> <price>`
**Storage:** SQLite `alerts` table
**Description:** Persists a directional price alert for the user. The heartbeat daemon checks
every 2 minutes and sends a Telegram notification when the price crosses the target level.
- `/buyalert` fires when price drops *below* the target (buy opportunity signal)
- `/sellalert` fires when price rises *above* the target (sell opportunity signal)

**Direction logic:** Alert direction is set at creation time and locked. Alert fires exactly
once when the price crosses the target in the defined direction.

---

## Skill: alert-management

**Commands:** `/alerts`, `/updatealert <alert_no> <price>`, `/cancelalert <alert_no>`
**Storage:** SQLite `alerts` table
**Description:** Allows users to view, modify, and remove active alerts.
- `/alerts` — Lists all untriggered alerts with index, ticker, direction, and target price
- `/updatealert` — Updates the target price of an existing alert, preserving its direction
- `/cancelalert` — Permanently removes an alert by its index number

---

## Skill: portfolio-tracker

**Commands:** `/buy`, `/sell`, `/portfolio`
**Storage:** SQLite `portfolio` table
**Description:** Tracks user stock holdings with quantity and average cost basis.
Handles partial sells and averaging down/up on repeat buys.
**Output:** Formatted portfolio view with total invested value.

---

## Skill: ai-explain

**API:** `POST /explain`
**Description:** Sends structured analysis data to Claude (claude-haiku-4-5) for
a 2–3 sentence plain-English explanation aimed at retail investors. Gracefully falls back
to a rule-based explanation if the Anthropic API key is not configured.
**Model:** claude-haiku-4-5 (fast, cost-effective for real-time responses)
