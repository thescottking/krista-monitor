#!/usr/bin/env node
// krista-monitor.mjs
// Pulls X posts matching Krista's monitoring keywords over a lookback window,
// scores each for reply-worthiness against the ICP, tags competitors,
// writes a markdown digest. Prints the digest's absolute path on stdout.
//
// Uses xAI's Responses API + x_search tool. (Old Live Search API was deprecated.)
//
// Usage:
//   XAI_API_KEY=xai-... node krista-monitor.mjs --lookback-hours=24
//
// Optional flags:
//   --lookback-hours=N      (default 24)
//   --max-per-keyword=N     (default 10)
//   --model=grok-4.3        (default; any xAI model that supports x_search)
//   --out-dir=/some/path    (default = script directory)
//
// Optional fallback for the key when XAI_API_KEY is not in the environment:
//   ~/.krista-monitor.env   — single line: XAI_API_KEY=xai-...

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// -------- CLI args --------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const lookbackHours = Number(args['lookback-hours'] || 24);
const maxPerKeyword = Number(args['max-per-keyword'] || 10);
const model = String(args['model'] || 'grok-4.3');
const outDir = resolve(String(args['out-dir'] || __dirname));

// -------- API key (env or ~/.krista-monitor.env) --------
let XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  const envFile = join(homedir(), '.krista-monitor.env');
  if (existsSync(envFile)) {
    try {
      const txt = await readFile(envFile, 'utf-8');
      const m = txt.match(/^\s*XAI_API_KEY\s*=\s*(.+?)\s*$/m);
      if (m) XAI_API_KEY = m[1].replace(/^['"]|['"]$/g, '');
    } catch { /* fall through */ }
  }
}
if (!XAI_API_KEY) {
  console.error(
    'ERROR: XAI_API_KEY is not set in the environment, and ~/.krista-monitor.env is missing or empty.',
  );
  process.exit(2);
}

// -------- Config --------
const keywordsCfg = JSON.parse(
  await readFile(join(__dirname, 'keywords.json'), 'utf-8'),
);
const icp = await readFile(join(__dirname, 'icp.md'), 'utf-8');
const searchTerms = keywordsCfg.search_terms || [];
if (searchTerms.length === 0) {
  console.error('ERROR: keywords.json has no search_terms.');
  process.exit(2);
}

// -------- Time window --------
const now = new Date();
const from = new Date(now.getTime() - lookbackHours * 3600 * 1000);
const fmtDate = (d) => d.toISOString().slice(0, 10);
const fromDate = fmtDate(from);
const toDate = fmtDate(now);

console.error(
  `Krista X Monitor — lookback ${lookbackHours}h (${fromDate} → ${toDate})`,
);
console.error(`Model: ${model} | Keywords: ${searchTerms.length}`);

// -------- Prompt --------
const instructions = `You are a B2B marketing analyst for Krista Software, an enterprise agentic AI platform.

TASK: For the given search term, find recent X (Twitter) posts and score each for "reply-worthiness" — how valuable it would be for Krista's team to reply with Krista's perspective.

ICP & COMPETITOR LIST:
${icp}

SCORING RUBRIC (0–100):
- 90–100: ICP buyer asking a direct question Krista answers (e.g., "How do you give an LLM enterprise context?")
- 70–89:  ICP buyer thinking out loud about agentic AI, context, orchestration, or governance
- 50–69:  ICP-adjacent voice (analyst, consultant, journalist) shaping the conversation
- 30–49:  Vendor / competitor post worth tracking but low reply value
- 0–29:   Noise, not ICP, no useful angle, or pure self-promo

RULES:
- Skip retweets and quote-tweets of older content.
- Skip pure ads / unrelated self-promotion.
- Skip posts from accounts with 300 or fewer followers. Check the author's follower count and include it as "follower_count".
- If the author is a known Krista competitor (see list above), set "is_competitor": true and still include the post (the team wants competitive intel).
- "angle" must be ONE sentence with Krista's concrete reply angle — not generic ("we should engage"), but specific ("contrast Krista's reasoning loop with their pipeline metaphor").

OUTPUT FORMAT: STRICT JSON only — no markdown fences, no prose around the JSON.
Shape:
{
  "posts": [
    {
      "handle": "string (no @)",
      "author_bio": "string",
      "follower_count": 1234,
      "post_url": "https://x.com/...",
      "posted_at": "ISO 8601 string or empty",
      "text": "post text, trimmed",
      "score": 0-100,
      "reason": "one sentence",
      "angle": "one sentence",
      "is_competitor": true|false
    }
  ]
}`;

// -------- Tolerant JSON extractor --------
function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

// -------- xAI call with one retry on 429/5xx/network --------
async function searchKeyword(keyword, attempt = 1) {
  const body = {
    model,
    instructions,
    input: [
      {
        role: 'user',
        content:
          `Search X for posts in the last ${lookbackHours} hours matching: ${keyword}.\n\n` +
          `Return up to ${maxPerKeyword} of the most reply-worthy posts for Krista, ` +
          `scored against the ICP above. Strict JSON only.`,
      },
    ],
    tools: [
      {
        type: 'x_search',
        from_date: fromDate,
        to_date: toDate,
      },
    ],
  };

  let res;
  try {
    res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (attempt === 1) {
      console.error(`[${keyword}] network error: ${e.message} — retry in 30s`);
      await new Promise((r) => setTimeout(r, 30000));
      return searchKeyword(keyword, 2);
    }
    console.error(`[${keyword}] FAILED after retry: ${e.message}`);
    return [];
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt === 1) {
      console.error(`[${keyword}] xAI ${res.status} — retry in 30s`);
      await new Promise((r) => setTimeout(r, 30000));
      return searchKeyword(keyword, 2);
    }
    const txt = await res.text().catch(() => '');
    console.error(`[${keyword}] FAILED xAI ${res.status}: ${txt.slice(0, 400)}`);
    return [];
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error(`[${keyword}] xAI ${res.status}: ${txt.slice(0, 400)}`);
    return [];
  }

  const data = await res.json();
  if (data.error) {
    console.error(`[${keyword}] xAI returned error: ${JSON.stringify(data.error).slice(0, 400)}`);
    return [];
  }

  // Find the assistant message in output[]
  const messageItem = (data.output || []).find((o) => o.type === 'message');
  const content = messageItem?.content?.find((c) => c.type === 'output_text')?.text || '';

  const parsed = extractJson(content);
  if (!parsed || !Array.isArray(parsed.posts)) {
    console.error(`[${keyword}] unparseable response — skipping`);
    return [];
  }
  const posts = parsed.posts
    .filter((p) => p && p.post_url && p.text && !(Number.isFinite(+p.follower_count) && +p.follower_count <= 300))
    .map((p) => ({
      handle: String(p.handle || '').replace(/^@/, ''),
      author_bio: String(p.author_bio || ''),
      follower_count: Number.isFinite(+p.follower_count) ? +p.follower_count : null,
      post_url: String(p.post_url),
      posted_at: String(p.posted_at || ''),
      text: String(p.text).trim(),
      score: Number.isFinite(+p.score) ? Math.max(0, Math.min(100, +p.score)) : 0,
      reason: String(p.reason || '').trim(),
      angle: String(p.angle || '').trim(),
      is_competitor: Boolean(p.is_competitor),
      keyword,
    }));
  console.error(`[${keyword}] ${posts.length} posts`);
  return posts;
}

// -------- Fan out (parallel) --------
const results = await Promise.all(searchTerms.map((kw) => searchKeyword(kw)));
const all = results.flat();

// -------- Dedupe by post_url, sort by score desc --------
const seen = new Set();
const deduped = all.filter((p) => {
  const k = p.post_url.replace(/[?#].*$/, '');
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
deduped.sort((a, b) => b.score - a.score);

// -------- Render markdown --------
function renderPost(p) {
  const tag = p.is_competitor ? ' [competitor]' : '';
  const bio = p.author_bio ? `_${p.author_bio}_\n\n` : '';
  const posted = p.posted_at ? p.posted_at : 'unknown';
  const quoted = p.text.replace(/\n/g, '\n> ');
  return [
    `### @${p.handle} — score ${p.score}${tag}${p.follower_count ? ` — ${p.follower_count.toLocaleString()} followers` : ''}`,
    '',
    `${bio}Keyword: \`${p.keyword}\`  |  Posted: ${posted}`,
    '',
    `> ${quoted}`,
    '',
    `**Why it matters:** ${p.reason || '_n/a_'}`,
    '',
    `**Reply angle:** ${p.angle || '_n/a_'}`,
    '',
    `[View on X](${p.post_url})`,
    '',
    '---',
    '',
  ].join('\n');
}

const dateStr = fmtDate(now);
const lines = [];
lines.push(`# Krista X Monitor — ${dateStr}`);
lines.push('');
lines.push(`Lookback: ${lookbackHours}h (${fromDate} → ${toDate})`);
lines.push(`Keywords searched: ${searchTerms.length}`);
lines.push(`Posts surfaced (deduped): ${deduped.length}`);
lines.push('');

if (deduped.length === 0) {
  lines.push('_No reply targets surfaced today._');
  lines.push('');
} else {
  const replyWorthy = deduped.filter((p) => !p.is_competitor && p.score >= 50);
  const competitors = deduped.filter((p) => p.is_competitor);
  const lowScore = deduped.filter((p) => !p.is_competitor && p.score < 50);

  if (replyWorthy.length) {
    lines.push(`## Reply-worthy (${replyWorthy.length})`);
    lines.push('');
    for (const p of replyWorthy) lines.push(renderPost(p));
  }
  if (competitors.length) {
    lines.push(`## Competitors — track, do not reply (${competitors.length})`);
    lines.push('');
    for (const p of competitors) lines.push(renderPost(p));
  }
  if (lowScore.length) {
    lines.push(`## Low score — skim only (${lowScore.length})`);
    lines.push('');
    for (const p of lowScore) {
      lines.push(
        `- @${p.handle} — score ${p.score} — \`${p.keyword}\` — ${p.text.slice(0, 120)}${p.text.length > 120 ? '…' : ''} — [view](${p.post_url})`,
      );
    }
    lines.push('');
  }
}

const outPath = join(outDir, `krista-monitor-${dateStr}.md`);
await writeFile(outPath, lines.join('\n'), 'utf-8');
console.log(outPath);
