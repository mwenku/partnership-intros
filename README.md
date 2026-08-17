# Souk partner-outreach prototype

Single-page prototype: a partner search and vendor brief go into **Exa Websets**, which finds 3–5 people, verifies them, researches signals, and writes a four-email sequence. Souk would send these on the vendor's behalf. **The prototype does not send any real emails.** It stops at reviewed sequences ready for potential use.

## Setup

```bash
cp .env.example .env.local
```

Put your Exa key in `.env.local`:

```
EXA_API_KEY=
```

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). A Webset run usually takes several minutes. Leave the tab open.

## How it works

1. Your search and vendor brief are sent as the Webset query. The vendor website URL is included so Exa can crawl it.
2. Discovery uses Websets with `entity: { type: "person" }`, count 5, and `maxPeoplePerCompany: 1`.
3. Three criteria check organisation, role, and partnership context.
4. Enrichments research company fit, person fit, 2–3 signals, a selected signal, and a work email if public.
5. After that completes, a first four-email enrichment runs, then a stricter rewrite enrichment. Both are Websets, not a separate LLM.

This does **not** use Exa People Search (`category: "people"`) for discovery.

## Models and providers

- **Exa Websets** for people discovery, criteria, research, and both email drafts.
- No OpenAI, Anthropic, or other writing model.

## Code layout

Matches the `cc-be-wallet` style: Zod schemas, named handler exports, early returns, logger on every branch, and handler unit tests with `given*` helpers.

```
src/handlers/startOutreach.ts
src/handlers/getOutreachStatus.ts
src/clients/exa.ts
src/zod-schemas.ts
src/logger.ts
src/utils/
test/unit/src/handlers/
```

```bash
pnpm test:unit
```

## Saved example

After a successful run, use **Download run JSON** and save it as `examples/run.json`. Copy one prospect's first vs final emails into `examples/refinement.md` and note what changed.

## Submission notes

- Profiles come from Websets items (`properties.person`).
- Sources are Webset evaluation and enrichment references.
- Sequences are reviewed drafts ready for potential use. No mail is sent.
