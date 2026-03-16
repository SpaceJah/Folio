# ◈ Folio — Personal Portfolio Tracker

A Google Finance-inspired investment portfolio tracker built with React. Tracks stocks and crypto with live prices, unrealized gain/loss, market data, charts, news, and more — all powered by the Claude AI API with web search.

---

## Features

- **Live prices** for stocks and crypto via Claude AI web search (no third-party API key needed)
- **Market indices** — S&P 500, NASDAQ, DOW, Bitcoin updated on every refresh
- **Portfolio value chart** — 30-day area chart with range selector
- **Holdings table** — buy price, % of portfolio, unrealized gain/loss ($  and %)
- **Gain/Loss charts** — bar charts by asset and return %
- **Allocation donut** — portfolio breakdown by holding
- **Sector breakdown** — Technology, Healthcare, Consumer Staples, Crypto
- **Per-asset detail panel** — 52-week high/low range bar, P/E, beta, market cap, volume
- **Market news feed** — live headlines relevant to your holdings
- **Transaction log** — full buy/sell history with weighted avg cost calculation
- **Three-dot menu** per holding for clean UX
- **Add/remove holdings** and log transactions at any time

---

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 18 |
| Charts | Recharts |
| Build Tool | Vite |
| Prices / Market Data | Claude AI API (claude-sonnet-4-6) with web search |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/folio.git
cd folio
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your API key

This app uses the **Anthropic Claude API** to fetch live prices via web search.

1. Get a free API key at [console.anthropic.com](https://console.anthropic.com)
2. Create a `.env` file in the project root:

```bash
VITE_ANTHROPIC_API_KEY=your_api_key_here
```

3. Update `src/App.jsx` — find the `fetchMarketData` function and replace the hardcoded headers with:

```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-iframes": "true",
},
```

> ⚠️ **Important:** Never commit your `.env` file or hardcode your API key. The `.gitignore` already excludes `.env` files.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deploying

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Set `VITE_ANTHROPIC_API_KEY` as an environment variable in the Vercel dashboard.

### Netlify

```bash
npm run build
# drag the dist/ folder into netlify.com/drop
```

---

## Customizing Your Holdings

Edit the `SEED` array in `src/App.jsx` to pre-load your own holdings and transactions:

```js
const SEED = [
  {
    id: 1,
    ticker: "AAPL",
    type: "stock",      // "stock" or "crypto"
    transactions: [
      { id: 101, txType: "buy", date: "2024-07-16", shares: 2, price: 235.00 }
    ]
  },
  // add more...
];
```

Also update the `SECTORS` map if you add new tickers:

```js
const SECTORS = {
  AAPL: "Technology",
  MSFT: "Technology",
  TSLA: "Automotive",  // add yours here
  // ...
};
```

---

## Project Structure

```
folio/
├── index.html          # HTML entry point
├── vite.config.js      # Vite config
├── package.json
├── .gitignore
└── src/
    ├── main.jsx        # React root
    └── App.jsx         # Main app (all components)
```

---

## Notes

- **Price data** is fetched via the Claude API with live web search. It is AI-sourced and may occasionally be slightly delayed or estimated — always verify with your brokerage for financial decisions.
- The portfolio value chart shows a **simulated** 30-day history based on your current gain/loss trajectory. Historical per-day data would require a paid market data API.
- This app is for **personal use and informational purposes only**. It is not financial advice.

---

## License

MIT — do whatever you want with it.
