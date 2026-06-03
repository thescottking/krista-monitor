# Krista ICP — Reply-Worthiness Reference

Used by `krista-monitor.mjs` to score X posts. Pasted verbatim into the system prompt.

## Who Krista sells to

**Title / role:** Director, Sr. Director, VP, or C-level. Individual contributors and analysts are NOT the buyer (but analysts shaping the conversation can still be reply-worthy at score 50–69).

**Function:**

- IT / Engineering / Platform / Architecture
- Operations / COO org
- Customer Experience / Contact Center / Support
- HR / People Ops / Talent
- Finance / FP&A / Shared Services

**Company size:** Mid-market through enterprise. Roughly 500 to 10,000+ employees. North America primary, EU secondary.

**Industries (high signal):** Insurance, banking, healthcare, manufacturing, retail, staffing, public sector. Not consumer apps, not crypto, not solo-founder SaaS.

**Buying triggers Krista solves:**

- "How do we put real business context around an LLM?"
- "Our RPA bots break every time a process changes."
- "We have 12 AI pilots and nothing in production."
- "Agents look great in demos but can't get into our systems."
- "Who owns the AI agent when it makes a mistake?"

## What makes a post reply-worthy

Reply-worthiness ≠ engagement bait. A post is reply-worthy when **both** are true:

1. The author is in (or directly speaks to) the ICP above.
2. Krista has a credible, specific, non-generic angle to add — one that sounds like Scott, not like every other agentic AI vendor in the replies.

Specifically reply-worthy:

- ICP buyer asking a direct architecture or governance question Krista actually answers
- ICP buyer venting about a real failure mode (broken RPA, hallucinating agent, governance void)
- Analyst / journalist framing the agentic AI debate in a way Krista can usefully sharpen
- Posts contrasting "AI as feature" vs. "AI as platform" — Krista lives in the second category

NOT reply-worthy:

- Hype threads ("AI agents are the future 🚀")
- Generic prompt-engineering tips
- Coding agent demos (Cursor/Devin/etc.) — wrong audience
- Crypto, consumer chatbots, image-gen
- Anonymous accounts with no clear role / company

## Competitor list (tag with `is_competitor: true`)

These are vendors Krista positions against. If the post author's handle, bio, or company name maps to one of these, set `is_competitor: true`. Surface them anyway — they're useful as competitive intel.

- UiPath
- Automation Anywhere
- Blue Prism / SS&C Blue Prism
- Microsoft Power Automate / Copilot Studio
- Salesforce Agentforce
- ServiceNow (AI Agents, Now Assist)
- Moveworks
- Cresta
- Decagon
- Sierra (sierra.ai)
- Glean
- Writer.com
- Adept
- Cognition (Devin)
- LangChain / LangGraph (as agent platform, not as library)
- CrewAI
- AutoGen / Microsoft Research agent frameworks
- Sema4.ai
- Kore.ai
- Cognigy
- Ada
- Boost.ai

If a post is from a Krista customer, partner, or Krista's own team (@KristaSoftware, Scott King, John Michelsen, Chris Kraus, etc.), set `is_competitor: false` regardless.
