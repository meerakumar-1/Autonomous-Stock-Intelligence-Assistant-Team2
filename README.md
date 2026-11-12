
# Stock Pulse — Autonomous Stock Intelligence Assistant

> A conversational AI agent that delivers Indian stock analysis, price alerts, and portfolio tracking directly through Telegram.

---

## What It Does

| Command | Description |
|---|---|
| `/analyze RELIANCE` | Technical analysis (MA20, MA50, RSI) with AI insight |
| `/buyalert TCS 3500` | Get notified when TCS drops below ₹3500 |
| `/sellalert TCS 3500` | Get notified when TCS rises above ₹3500 |
| `/updatealert <alert_no> 3500` | Update an existing alert's target price |
| `/cancelalert <alert_no>` | Remove an active stock alert |
| `/alerts` | View your active alerts |
| `/buy TCS 10 3500` | Add a stock purchase to your portfolio |
| `/sell TCS 5` | Sell some or all of a stock holding |
| `/portfolio` | View holdings and total invested value |

The bot checks active price alerts every two minutes while it is running.

---

## Architecture

```text
     Telegram User
          |
          v
+---------------------------+
| Node.js Telegram Bot      |
| backend/bot.js            |
| Commands and bot logic    |
+-------------+-------------+
              |
       +------+------+
       |             |
       v             v
+-------------+  +------------------+
| Redis       |  | Python FastAPI    |
|             |  | localhost:8000   |
| Portfolio   |  | Stock analysis   |
| Alerts      |  | AI explanations   |
| Cache       |  | IPO information  |
+-------------+  +------------------+
                       |
                       v
              +------------------+
              | Stock Data and   |
              | AI Services      |
              | yfinance, APIs,  |
              | Claude / Ollama  |
              +------------------+
```

### Redis Integration

Redis is used for portfolio storage, alert storage, and stock analysis caching.

#### 1. Portfolio Storage

Portfolio information is stored using Redis Hashes and Sets.

| Redis Key | Data Structure | Purpose |
|---|---|---|
| `portfolio:{chat_id}:{ticker}` | Hash | Stores a user's stock holding |
| `user_portfolio:{chat_id}` | Set | Stores the ticker symbols belonging to a user |

Each portfolio Hash stores:
- Ticker symbol
- Quantity of shares
- Average purchase price

**Portfolio operations:**

- `/buy`: Creates or updates a Redis Hash and adds the ticker to the user's Redis Set.
- `/sell`: Updates the quantity for a partial sale. For a full sale, it deletes the Hash and removes the ticker from the Set.
- `/portfolio`: Reads the user's Set, retrieves each holding Hash, and calculates the total invested value.

When the same stock is purchased multiple times, the average purchase price is recalculated using a weighted average.

#### 2. Stock Analysis Caching

Redis is also used to cache stock analysis results.

| Property | Implementation |
|---|---|
| Cache key | `cache:analysis:{ticker}` |
| Data structure | Redis String |
| Expiration time | 60 seconds |
| Cache miss | Calls the Python FastAPI `/analysis` endpoint |

**Caching workflow:**

1. The user requests stock analysis.
2. The bot checks Redis for the ticker's cached analysis.
3. If the cached result exists, it is returned without another analysis API request.
4. If no cached result exists, the bot calls the Python FastAPI service.
5. The response is stored in Redis with a 60-second expiration time.
6. After expiration, the next request fetches fresh analysis data.

This reduces repeated API calls and improves response efficiency.

#### 3. Alert Storage

Redis also stores price alerts using Hashes and Sets.

- `alert:{alert_id}` stores individual alert details.
- `user_alerts:{chat_id}` stores alert IDs belonging to a user.
- `active_alerts` stores IDs of alerts that are still being monitored.
- `alert_id_seq` generates unique alert IDs.

---

## Setup (Windows)

### Prerequisites

- Node.js 22 or later
- Python 3.11 or later
- Redis server
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Optional: Anthropic API key for AI explanations
- Optional: Alpha Vantage API key

### 1. Clone the Repository

```powershell
git clone https://github.com/meerakumar-1/Autonomous-Stock-Intelligence-Assistant-Team2.git
cd Autonomous-Stock-Intelligence-Assistant-Team2
```

### 2. Set Up the Python API

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Set Up Redis

Install and start a Redis-compatible server on your machine.

The default local Redis connection URL is:

```env
REDIS_URL=redis://localhost:6379
```

Make sure the Redis server is running before starting the Telegram bot.

### 4. Set Up the Node.js Bot

```powershell
cd backend
npm install
cd ..
```

### 5. Configure Environment Variables

Create a file named `.env` inside the `backend` directory.

Add the following configuration:

```env
TOKEN=your_telegram_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
PYTHON_API_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379
```

Replace the placeholder values with your own credentials.

Do not commit your actual `.env` file or expose API keys publicly.

---

## Running the Project

The project requires the Redis server, Python API, and Telegram bot to be running.

### Terminal 1 — Redis

Start your Redis server using the appropriate command for your Redis installation.

### Terminal 2 — Python FastAPI Service

From the project root:

```powershell
venv\Scripts\activate
uvicorn api.main:app --reload --port 8000
```

Verify the API using:

http://localhost:8000/health

### Terminal 3 — Telegram Bot

```powershell
cd backend
node bot.js
```

Open Telegram, find your bot, and send `/start`.

---

## Usage Examples

```text
/analyze RELIANCE
/analyze TCS.NS
/buyalert INFY 1800
/sellalert TCS 3500
/alerts
/cancelalert 1
/buy WIPRO 20 450
/sell WIPRO 10
/portfolio
```

---

## Project Structure

```text
Autonomous-Stock-Intelligence-Assistant/
├── api/
│   ├── analysis.py
│   ├── explain.py
│   ├── main.py
│   └── __init__.py
├── backend/
│   ├── bot.js
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── HEARTBEAT.md
├── LICENSE
├── README.md
├── requirements.txt
├── Skill.md
└── SOUL.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Telegram interface | Node.js and node-telegram-bot-api |
| Backend API | Python and FastAPI |
| Stock data | yfinance and Alpha Vantage |
| Technical analysis | pandas and numpy |
| AI explanations | Anthropic Claude Haiku / Local Ollama |
| Portfolio storage | Redis Hashes and Sets |
| Stock analysis cache | Redis String with 60-second TTL |
| Alert storage | Redis Hashes and Sets |
| Background tasks | node-cron |

---

## Testing and Verification

The backend package test script currently performs a JavaScript syntax check:

```powershell
cd backend
npm test
```

This check does not replace functional integration testing. Redis operations, API connectivity, and Telegram commands should also be tested in an environment with the required services and credentials.

---

## License

See [LICENSE](./LICENSE) for details.
