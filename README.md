# Stock Pulse — Autonomous Stock Intelligence Assistant

> A conversational AI agent that delivers real-time Indian stock analysis, price alerts, and portfolio tracking — directly in Telegram.

---

## What It Does

| Command | Description |
|---|---|
| `/analyze RELIANCE` | Technical analysis (MA20, MA50, RSI) + AI/Rule-based insight |
| `/buyalert TCS 3500` | Get notified when TCS drops below ₹3500 |
| `/sellalert TCS 3500` | Get notified when TCS rises above ₹3500 |
| `/updatealert <alert_no> 3500` | Update the target price of an existing alert while retaining its original trigger condition |
| `/cancelalert <alert_no>` | Remove an active stock alert |
| `/alerts` | View all your active alerts |
| `/buy TCS 10 3500` | Add a stock purchase entry to your portfolio |
| `/sell TCS 5` | Partial or full sell |
| `/portfolio` | View holdings with total invested value |

The bot runs 24/7 with a background heartbeat that monitors price alerts every 2 minutes.

---

## Architecture

```
     Telegram User
         │
         ▼
┌─────────────────────┐
│  Node.js Bot        │  bot.js — Telegram polling, SQLite alerts & portfolio
└────────┬────────────┘
         │ HTTP (axios)
         ▼
┌─────────────────────┐
│  Python FastAPI     │  api/ — Alpha Vantage, yfinance data, technical indicators
│  localhost:8000     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  AI Explanation     │  Claude Haiku (primary)
│  Layer              │  Local Ollama (optional)
│                     │  Rule-based fallback
└─────────────────────┘
```

**Agent configuration files:**
- `SOUL.md` — Agent personality & behavioral boundaries
- `HEARTBEAT.md` — Background daemon task configuration
- `Skill.md` — Skill definitions for each capability

---

## Setup (Windows)

### Prerequisites
- Node.js ≥ 22 — [nodejs.org](https://nodejs.org)
- Python ≥ 3.11 — [python.org](https://python.org)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- (Optional) An Anthropic API key for AI explanations — [console.anthropic.com](https://console.anthropic.com)
- (Optional) An Alpha Vantage API key — [alphavantage.co](https://www.alphavantage.co)

### 1. Clone the repo

```powershell
git clone https://github.com/maurya-doshi/Autonomous-Stock-Intelligence-Assistant.git
cd Autonomous-Stock-Intelligence-Assistant
```

### 2. Set up the Python API

```powershell
# Create virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Set up the Node.js bot

```powershell
cd backend
npm install
cd ..
```

### 4. Configure environment variables

Create `backend/.env`:

```env
TOKEN=your_telegram_bot_token_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

---

## Running the Project

You need **two terminals** running simultaneously.

### Terminal 1 — Python FastAPI backend

```powershell
# From project root, with venv activated
venv\Scripts\activate
uvicorn api.main:app --reload --port 8000
```

Verify it's running: open [http://localhost:8000/health](http://localhost:8000/health) in your browser.

### Terminal 2 — Telegram bot

```powershell
cd backend
node bot.js
```

Open Telegram, find your bot, and send `/start`.

---

## Usage Examples

```
/analyze RELIANCE
/analyze TCS.NS
/buyalert INFY 1800
/alerts
/cancelalert 1
/buy WIPRO 20 450
/sell WIPRO 10
/portfolio
```

---

## Project Structure

```
Autonomous-Stock-Intelligence-Assistant/
├── api/
│   ├── analysis.py       # Technical indicators (MA, RSI, signal)
│   ├── explain.py        # LLM + rule-based explanation engine
│   ├── main.py           # FastAPI routes
│   └── __init__.py
├── backend/
│   ├── bot.js            # Telegram bot, alert daemon, portfolio logic
│   ├── package.json
│   └── package-lock.json
├── HEARTBEAT.md          # Background daemon documentation
├── LICENSE
├── README.md
├── requirements.txt
├── Skill.md              # Agent skill definitions
└── SOUL.md               # Agent personality & boundaries
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Telegram interface | Node.js + `node-telegram-bot-api` |
| Backend API | Python + FastAPI |
| Stock data | yfinance, Alpha Vantage |
| Technical analysis | pandas, numpy (MA, RSI) |
| AI explanations | Anthropic Claude Haiku / Local Ollama |
| Storage | SQLite (per-user, isolated) |
| Background tasks | `node-cron` (every 2 minutes) |

---

## License

See [LICENSE](./LICENSE) for details.
