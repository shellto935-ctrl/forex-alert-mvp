# EURUSD–GBPUSD ICT Reversal Alert System

Railway backend that polls Twelve Data 5-minute EUR/USD and GBP/USD candles, derives clock-aligned 15-minute candles, evaluates a conservative Head-and-Shoulders + ICT-style structure-shift model, and delivers Bengali Telegram alerts.

This is an alert-only research system. It never places trades and does not guarantee profitable signals.

## Strategy v0.2

The engine now requires:

- Fully closed, ascending, UTC-aligned 5M candles with duplicate/gap checks.
- Complete 15M candles built from exact `:00/:05/:10`, `:15/:20/:25`, etc. groups.
- A confirmed chronological `H-L-H-L-H` or `L-H-L-H-L` pivot sequence.
- Shoulder similarity, minimum head prominence, time symmetry and formation-duration limits.
- The video-style neckline slope filter.
- A qualifying liquidity sweep and reclaim around the head.
- A 15M candle-body close through the projected neckline.
- Qualified displacement: expanded true range, large body and close near the directional extreme.
- A later 5M retest of the broken neckline plus engulfing or pin-bar rejection.
- Invalidation and expiry checks before any alert.

WATCH and ENTRY_READY share one deterministic setup ID derived from confirmed pivot timestamps. Terminal setups cannot re-alert.

## Session windows

All session calculations use `America/New_York` with automatic daylight-saving handling:

- London: 02:00–05:00 ET
- NY PM: 13:00–15:00 ET

The session is classified from the confirming candle timestamp, not server wall-clock time.

## Reliability changes

- Polls at absolute UTC five-minute boundaries plus a 10-second provider settlement delay.
- Ignores unfinished or stale candles.
- Uses 250 bars of warmup instead of 80.
- Does not calculate across provider outages or weekend gaps.
- Persists setup state and the last processed candle to PostgreSQL across redeploys.
- Uses PostgreSQL as a durable signal outbox when available.
- Keeps revised logic in `DRY_RUN=true` shadow mode until validation is approved.

## Validation

Local release gate:

```bash
cd backend
npm ci
npm run check
npm test
npm run build
```

The deterministic replay harness is in `backend/src/backtest/replay.ts`. Tests cover provider ordering, forming candles, quarter-hour aggregation, missing child bars, DST/session boundaries, chronological pattern geometry and replay determinism.

A full historical backfill and untouched out-of-sample evaluation are still required before live promotion. Accuracy must be reported with sample size, precision/recall, false-signal rate, missed-setup rate, expectancy after modeled spread, and drawdown—not only win rate.

## Deployment

Railway root directory: `/backend`

Health endpoints:

- `/health` — process liveness
- `/readyz` — store readiness

Required environment variables:

- `DATABASE_URL`
- `TWELVEDATA_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WEBHOOK_SECRET`
- `DRY_RUN=true` during validation

Never commit keys or tokens. Rotate any credential that has been exposed in chat, screenshots, logs or Git history.

## Research basis

- User-provided H&S video: https://youtu.be/JA4N8nlycXY
- Traditional H&S confirmation: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top
- ICT 2022 Mentorship Episode 4: https://www.youtube.com/watch?v=L-ReMHiavPM
- FX intraday seasonality: https://doi.org/10.3386/w12413
- Computer-detected H&S evidence: https://doi.org/10.1093/rof/rfr037

Practitioner labels such as CHoCH, MSS, liquidity sweep and displacement are implemented as explicit OHLC rules. Marketing income claims from videos are not treated as evidence.
