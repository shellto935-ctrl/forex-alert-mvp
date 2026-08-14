# EURUSD–GBPUSD ICT Reversal Alert MVP

TradingView Pine Script → Railway webhook/API → PostgreSQL dedup/state → WhatsApp message → phone call.

This is an alert-only prototype. It never places a trade.

## What is included

- `pine/ict_reversal_alerts_v0_1.pine`
  - Runs on a 5-minute chart.
  - Reads confirmed 15-minute pivots without future lookahead.
  - Detects provisional normal/inverse Head-and-Shoulders geometry.
  - Requires a 15M candle-body neckline break for `WATCH`.
  - Requires a 5M retest plus engulfing/pin-bar rejection for `ENTRY_READY`.
  - Uses `America/New_York` session time with London 02:00–05:00 and NY PM 13:00–15:00 defaults.
  - Emits JSON through Pine `alert()` calls.
- `backend/`
  - Railway-ready TypeScript/Express web service.
  - `POST /webhook/tradingview` accepts TradingView JSON and a revocable webhook token in the body.
  - Zod validation, PostgreSQL uniqueness on `(setup_id, stage)`, per-channel delivery jobs, lease recovery, capped retries, structured logs, `GET /health` and database-backed `GET /readyz`.
  - Official WhatsApp Cloud API template adapter.
  - Twilio regular phone-call adapter for `ENTRY_READY` only.
  - `DRY_RUN=true` by default for safe testing.

## Important limitation

Head-and-Shoulders and ICT market structure are partly subjective. The ATR tolerances in v0.1 are starting assumptions, not a validated trading edge. Review historical chart labels and tune parameters before enabling live notifications.

## 1. Local backend test

```bash
cd backend
cp .env.example .env
# Set WEBHOOK_SECRET to a random value with at least 16 characters.
npm install
npm run check
npm test
npm run build
WEBHOOK_SECRET='replace-with-a-long-random-value' DRY_RUN=true npm start
```

Liveness and readiness checks:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/readyz
```

Dry-run signal:

```bash
curl -X POST http://localhost:3000/webhook/tradingview \
  -H 'content-type: application/json' \
  -d '{
    "token":"replace-with-a-long-random-value",
    "version":"1",
    "setup_id":"EURUSD.BUY.1723615200000",
    "stage":"WATCH",
    "symbol":"EURUSD",
    "direction":"BUY",
    "session":"LONDON",
    "pattern_tf":"15",
    "entry_tf":"5",
    "event_time":"REPLACE_WITH_CURRENT_ISO_UTC_TIME",
    "price":1.1012,
    "break_level":1.1000,
    "zone_low":1.0998,
    "zone_high":1.1002,
    "invalidation":1.0950,
    "reason":["INVERSE_HS","BULLISH_CHOCH"]
  }'
```

## 2. Railway deployment

1. Create a Railway project from this repository with `backend` as the root directory.
2. Add a Railway PostgreSQL service.
3. Reference its `DATABASE_URL` in the web service.
4. Set these service variables first:
   - `WEBHOOK_SECRET`: a long random token; use the same token in the Pine indicator input.
   - `DRY_RUN=true`
   - `NODE_ENV=production`
5. Generate a public Railway domain.
6. Confirm `https://YOUR-DOMAIN/health` and `https://YOUR-DOMAIN/readyz` return HTTP 200.
7. Keep the Railway deployment healthcheck path as `/readyz`.
8. Add a separate external uptime monitor; Railway deployment healthchecks are not continuous monitoring.

Do not use Railway Cron for the webhook API. It must be a persistent service.

## 3. TradingView setup

Repeat for EURUSD and GBPUSD:

1. Open the pair on a 5-minute chart.
2. Paste and save `pine/ict_reversal_alerts_v0_1.pine` in Pine Editor.
3. Add the indicator to the chart.
4. Set `Railway webhook token` to the exact Railway `WEBHOOK_SECRET` value.
5. Visually review historical WATCH and ENTRY labels before creating a live alert.
6. Create one TradingView alert:
   - Condition: `ICT H&S Two-Stage Alerts v0.1` → `Any alert() function call`
   - Webhook URL: `https://YOUR-DOMAIN/webhook/tradingview`
   - Alert frequency is controlled by the script at bar close.
7. TradingView requires 2FA for webhook alerts. Do not put broker credentials or WhatsApp/Twilio secrets in Pine.

## 4. WhatsApp activation

Keep `DRY_RUN=true` until template approval and end-to-end tests are complete.

The backend expects official WhatsApp Business Platform template messages. Configure:

- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_TO`
- `WHATSAPP_WATCH_TEMPLATE`
- `WHATSAPP_ENTRY_TEMPLATE`
- `WHATSAPP_TEMPLATE_LANGUAGE`

The two approved templates must each expose eight body variables in this order:

1. stage
2. symbol
3. direction
4. session
5. reason
6. price
7. zone
8. event time

After a successful dry-run and template test, set `DRY_RUN=false`.

## 5. Phone-call activation

The practical v0.1 fallback is a regular programmable phone call for `ENTRY_READY` only. Configure:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM`
- `TWILIO_TO`

WhatsApp Business Calling can replace this later, but it has additional business onboarding, permission and eligibility requirements.

## Safe rollout order

1. Pine labels only.
2. Railway dry-run webhook.
3. PostgreSQL dedup verification.
4. WhatsApp test recipient/template.
5. Phone call test.
6. Demo monitoring for several weeks.
7. Live alert-only use after manual review of false positives and missed setups.
