# Charon Strategy Summary (for AI Analysis)

## Current Active Strategy

| Field | Value |
|-------|-------|
| Strategy ID | `smart_money` |
| Strategy Name | `Smart Money` |
| Mode | `immediate` (entry when signal qualifies) |

## Entry Criteria

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `min_source_count` | 2 | Requires at least 2 signal sources |
| `require_fee_claim` | false | Fee-claim signal not required |
| `token_age_max_ms` | 86400000 (24h) | Token must be ≤24 hours old |
| `min_mcap_usd` | 5000 | Minimum market cap: $5,000 |
| `max_mcap_usd` | 1,000,000 | Maximum market cap: $1M |
| `min_holders` | 95 | Minimum token holders: 95 |
| `max_top20_holder_percent` | 50 | Top 20 holders ≤50% |
| `trending_min_volume_usd` | 5,000 | 24h volume ≥$5,000 |
| `trending_min_swaps` | 100 | 24h swaps ≥100 |
| `trending_max_rug_ratio` | 0.2 | Rug ratio ≤20% |
| `trending_max_bundler_rate` | 0.45 | Bundler rate ≤45% |

## Risk Management

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `position_size_sol` | 0.025 SOL | Per-trade size |
| `max_open_positions` | 10 | Max concurrent positions |
| `tp_percent` | 50% | Take profit at +50% |
| `sl_percent` | -25% | Stop loss at -25% |
| `trailing_enabled` | false | Trailing not active |
| `partial_tp` | true | Partial take profit enabled |
| `partial_tp_at_percent` | 35% | Sell 50% at +35% |
| `partial_tp_sell_percent` | 50% | Half position at partial TP |

## LLM Integration

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `use_llm` | true | LLM decision enabled |
| `llm_min_confidence` | 70% | Minimum confidence threshold |

## Current Stats (Dry-Run)

| Metric | Value |
|--------|-------|
| Total trades | 12 |
| Open positions | 4 |
| Closed positions | 8 |
| Wins | 3 |
| Losses | 5 |
| Win rate | 37.5% |
| Avg PnL | +8.16% |
| Total PnL | +0.0163 SOL |
| Best trade | +132.73% (Buck) |
| Worst trade | -64.13% (ASHLEY) |
| Exit reasons | TP: 3, SL: 5 |

## Recent Closed Trades (Last 8)

1. **Buck** — +132.73% (TP) — entry MCAP $10.5K → exit MCAP $24.4K
2. **ARSEnal** — -37.70% (SL) — entry MCAP $17.8K → exit MCAP $11.1K
3. **SCOUT** — -20.99% (SL) — entry MCAP $23.5K → exit MCAP $18.6K
4. **Embrace** — -19.89% (SL) — entry MCAP $333.6K → exit MCAP $267.2K
5. **PSOL** — +37.25% (TP) — entry MCAP $115.8K → exit MCAP $159.0K
6. **PSOL** — +57.04% (TP) — entry MCAP $73.9K → exit MCAP $116.1K
7. **ASHLEY** — -64.13% (SL) — entry MCAP $19.9K → exit MCAP $7.2K
8. **thesis** — -19.06% (SL) — entry MCAP $124.8K → exit MCAP $101.0K

## Observations

- **High volatility**: Best trade +132% vs worst -64% shows potential but also risk.
- **SL hits dominate**: 5 of 8 exits are stop-loss, suggesting price often reverses before TP.
- **MCAP range**: Trades span $10K–$333K market cap; no clear sweet spot yet.
- **Partial TP active**: 3 of 8 used partial TP (35% target), helping lock some gains.
- **No trailing yet**: Trailing is disabled in current config.

---

## AI Analysis Prompt

```
You are a Solana sniper bot strategy analyst. Review the following Charon strategy configuration and recent dry-run performance.

Active Strategy: Smart Money (immediate entry mode)

Entry Criteria:
- min_source_count: 2
- token_age_max_ms: 86400000 (24h)
- min_mcap_usd: 5000, max_mcap_usd: 1,000,000
- min_holders: 95, max_top20_holder_percent: 50
- trending_min_volume_usd: 5000, trending_min_swaps: 100
- trending_max_rug_ratio: 0.2, trending_max_bundler_rate: 0.45

Risk Management:
- position_size_sol: 0.025
- max_open_positions: 10
- tp_percent: 50%, sl_percent: -25%
- partial_tp: true (35% at 50% sell)

LLM: enabled, min_confidence: 70%

Performance (8 closed trades):
- Win rate: 37.5%
- Avg PnL: +8.16%
- Best: +132.73%, Worst: -64.13%
- Exit reasons: TP=3, SL=5

Questions:
1. Is the win rate sustainable? What's the breakeven win rate for this TP/SL ratio?
2. Which filters are too strict or too loose? Suggest adjustments.
3. Should partial TP be increased/decreased? At what %?
4. Is the MCAP range optimal? Suggest tighter range if possible.
5. Should trailing be enabled? What trailing % would help?
6. Is LLM confidence threshold appropriate? Suggest tuning.
7. What's the expected value (EV) per trade with current settings?
8. Recommend 3 concrete changes to improve win rate and EV.
```

---

## How to Use This Summary

1. **For AI agents**: Paste the "AI Analysis Prompt" section to get strategy suggestions.
2. **For manual tuning**: Use the "Observations" section to identify weak spots.
3. **For comparison**: Keep this file in your repo to track strategy evolution over time.
