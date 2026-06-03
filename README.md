# krista-monitor

Daily X (Twitter) monitor for Krista Software. Pulls posts matching Krista's monitoring keywords over a lookback window, scores each for reply-worthiness against Krista's ICP, tags competitors, and writes a markdown digest.

Driven by the Cowork scheduled task `krista-x-monitor-daily`.

## Files

- `krista-monitor.mjs` — the script (Node 20+, no install required, uses `fetch`)
- `keywords.json` — search terms
- `icp.md` — ICP + competitor list (pasted into the scoring prompt)

## Run

```
XAI_API_KEY=xai-... node krista-monitor.mjs --lookback-hours=24
```

Stdout: the absolute path of the written digest, e.g. `./krista-monitor-2026-06-03.md`. Stderr: per-keyword progress and errors.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--lookback-hours=N` | `24` | Time window for the X search. |
| `--max-per-keyword=N` | `10` | Cap on posts the model returns per keyword. |
| `--model=NAME` | `grok-4` | Any xAI model that supports Live Search. |
| `--out-dir=PATH` | script dir | Where to write the digest. |

## How scoring works

Each keyword triggers one call to `grok-4` via xAI Live Search (X source, date-bounded). The model returns strict JSON with handle, post URL, score (0–100), reason, reply angle, and a competitor flag. The script dedupes by post URL and groups the digest into:

1. **Reply-worthy** — non-competitor, score ≥ 50
2. **Competitors** — `is_competitor: true` (track, don't reply)
3. **Low score** — non-competitor, score < 50, one-line skim list

Rubric lives in `icp.md` and in the script's `systemPrompt`.

## Failure modes

- `XAI_API_KEY` missing → exits 2 with a clear error.
- 429 / 5xx / network error on a keyword → retries once after 30s, surfaces error on stderr, continues with remaining keywords.
- Zero posts across all keywords → still writes the digest with `_No reply targets surfaced today._`
