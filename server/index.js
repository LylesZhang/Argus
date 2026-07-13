import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── Per-chunk retry config ─────────────────────────────────────────────
const CHUNK_TIMEOUT_MS  = 20_000; // single Gemini call timeout
const CHUNK_MAX_RETRIES = 3;
const FAIL_THRESHOLD    = 0.5;    // >50% chunks failed → overall failure

// Retry any error (not just 503); caller passes AbortController signal per attempt
async function runChunkWithRetry(fn, label) {
  for (let attempt = 1; attempt <= CHUNK_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), CHUNK_TIMEOUT_MS);
    try {
      const result = await fn(ctrl.signal);
      clearTimeout(tid);
      return result;
    } catch (err) {
      clearTimeout(tid);
      console.warn(`[${label}] attempt ${attempt}/${CHUNK_MAX_RETRIES} failed: ${err.message.slice(0, 60)}`);
      if (attempt < CHUNK_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return null;
}

// ── Prompts ────────────────────────────────────────────────────────────

const PROMPT = (text, budget) => `
<article>
${text}
</article>

Analyze the article above. Identify emotionally significant words.

Return ONLY this JSON:
{
  "highlights": [
    { "word": "<lowercase_word>", "context": "<verbatim_5-8_chars_from_article>", "category": "<category>" }
  ]
}

Step 1 — Classify the article as "narrative", "analytical", or "mixed":
  narrative  → more emotion highlights
  analytical → fewer emotion highlights
  mixed      → balanced
  Total: ${budget} highlights.

Step 2 — Select highlights (only from the article above, never from these instructions):
  - Each entry is ONE specific occurrence; same word may appear multiple times if each is independently significant.
  - Proper nouns and title-case words: skip unless clearly emotional.
  - "word": a single word or short phrase (2–4 words), lowercase, verbatim from article.
  - "context": copy 5–8 verbatim characters surrounding this occurrence from the article.
  - "category":
      "emotion-positive" — words expressing or evoking joy, trust, or anticipation
      "emotion-negative" — words expressing or evoking sadness, anger, fear, or disgust
      "emotion-complex"  — words expressing mixed, ambivalent, or surprising emotions

Return only the JSON object.
`.trim();

function chunkByParagraphs(text, parasPerChunk = 8) {
  const paras = text.split(/\n+/).filter(p => p.trim().length > 20);
  if (paras.length <= parasPerChunk) return [text];
  const chunks = [];
  for (let i = 0; i < paras.length; i += parasPerChunk) {
    chunks.push(paras.slice(i, i + parasPerChunk).join('\n\n'));
  }
  return chunks;
}

// ── Gemini caller (no built-in retry — handled by runChunkWithRetry) ──

async function callGemini(apiKey, prompt, signal) {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}: ${body.slice(0, 100)}`);
  }

  const data = await response.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Empty Gemini response');

  console.log('Raw Gemini response (first 200):', raw.slice(0, 200));

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── /api/analyze ───────────────────────────────────────────────────────

app.post('/api/analyze', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const clipped     = text.slice(0, 60000);
    const wordCount   = clipped.split(/\s+/).length;
    const totalBudget = Math.floor(wordCount / 100) * 6;
    const chunks      = chunkByParagraphs(clipped);
    const chunkBudget = Math.max(4, Math.floor(totalBudget / chunks.length));

    console.log(`[analyze] wordCount=${wordCount} totalBudget=${totalBudget} chunks=${chunks.length} chunkBudget=${chunkBudget}`);

    const highlights = [];
    let failCount    = 0;

    for (let i = 0; i < chunks.length; i++) {
      const result = await runChunkWithRetry(
        signal => callGemini(apiKey, PROMPT(chunks[i], chunkBudget), signal),
        `analyze-chunk-${i}`
      );
      if (result?.highlights?.length > 0) {
        highlights.push(...result.highlights);
        console.log(`[chunk ${i}] highlights=${result.highlights.length}`);
      } else {
        failCount++;
        console.warn(`[analyze] chunk ${i} produced no results after all retries`);
      }
    }

    const success = chunks.length === 0 || failCount / chunks.length <= FAIL_THRESHOLD;
    res.json({ highlights, success });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/focus ─────────────────────────────────────────────────────────

const FOCUS_PROMPT = (text, topic) => `
Article:
<article>
${text}
</article>

Topic: "${topic}"

Return ONLY this JSON:
{ "relevant": ["<first 30 chars of sentence>", ...] }

List the first 30 characters of each sentence in the article that is
semantically relevant to the topic "${topic}", even if it does not use the
exact words. Include sentences that discuss related concepts, implications,
or consequences of the topic.
`.trim();

app.post('/api/focus', async (req, res) => {
  const { text, topic } = req.body;
  if (!text || !topic) {
    return res.status(400).json({ error: 'text and topic are required' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const clipped = text.slice(0, 60000);
    const result  = await runChunkWithRetry(
      signal => callGemini(apiKey, FOCUS_PROMPT(clipped, topic), signal),
      'focus'
    );
    if (!result) return res.status(503).json({ error: 'Gemini unavailable' });
    res.json(result);
  } catch (err) {
    console.error('Focus error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/label ─────────────────────────────────────────────────────────

// Lenses are keyed by READING PURPOSE (not article genre). Each highlights the
// sentence roles most useful for that purpose, regardless of the text's genre.
const LENS_SCORING_GUIDE = `
Score importance independently of any display density or cutoff. Consider:
- contribution to the passage's main point
- whether another sentence already supplies the same information
- contribution to understanding the facts, logic, or argument
- how much removing the sentence would damage the reader's understanding

Calibration anchors:
- 100 — indispensable; without it the passage cannot be understood or summarized correctly
- 80  — clearly needed to understand a major fact, logical step, or argument
- 60  — helpful but optional supporting information
- 40  — background or minor detail
- 20  — repetitive, decorative, or peripheral

Merely matching one of the label definitions does NOT justify a high score.
Return only candidates scoring 50 or higher. It is valid to return an empty array.
`.trim();

const LENS_PROMPTS = {
  inform: (sentences) => `
The reader wants to GET INFORMATION quickly from this text. Score sentences by how important they are to that purpose.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "key-point" | "core-detail", "importance": <1-100> }] }

Definitions:
- "key-point"   — the main fact, answer, or bottom-line takeaway of the passage
- "core-detail" — a specific supporting fact worth noting: a number, date, name, place, or amount

${LENS_SCORING_GUIDE}
`.trim(),

  understand: (sentences) => `
The reader wants to UNDERSTAND THE CONCEPTS AND LOGIC of this text — to build a mental model of the ideas and how they connect. Score sentences by how important they are to that purpose.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "concept" | "reasoning" | "takeaway", "importance": <1-100> }] }

Definitions:
- "concept"   — defines or introduces a key term or idea (a "X is ..." definition; what something IS)
- "reasoning" — the causal or logical connective tissue (how/why: because, therefore, leads to, this causes)
- "takeaway"  — the author's central conclusion or main insight (a "so ... / this means ..." statement; NOT a definition)

${LENS_SCORING_GUIDE}
`.trim(),

  evaluate: (sentences) => `
The reader wants to EVALUATE THE ARGUMENT of this text — to judge whether the case holds up. Score sentences by how important they are to that purpose.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "claim" | "evidence" | "counterpoint", "importance": <1-100> }] }

Definitions:
- "claim"        — an assertion or position the author is arguing for
- "evidence"     — data, citations, examples, or facts offered to support a claim
- "counterpoint" — a concession, limitation, caveat, or opposing view the author acknowledges

${LENS_SCORING_GUIDE}
`.trim(),

};

const LENS_TYPES = {
  inform: new Set(['key-point', 'core-detail']),
  understand: new Set(['concept', 'reasoning', 'takeaway']),
  evaluate: new Set(['claim', 'evidence', 'counterpoint']),
};

function clampMinImportance(value) {
  if (value === null || value === '' || typeof value === 'boolean') return 75;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 75;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function normalizeSentenceLabels(labels, sentenceCount, lensPurpose) {
  if (!Array.isArray(labels)) return null;
  const validTypes = LENS_TYPES[lensPurpose] ?? LENS_TYPES.inform;
  const bestByIndex = new Map();

  for (const label of labels) {
    if (label?.index === null || label?.index === '' || label?.importance === null || label?.importance === '') continue;
    const index = Number(label?.index);
    const importance = Number(label?.importance);
    if (!Number.isInteger(index) || index < 0 || index >= sentenceCount) continue;
    if (!validTypes.has(label?.type)) continue;
    if (!Number.isFinite(importance) || importance < 50 || importance > 100) continue;

    const normalized = { index, type: label.type, importance: Math.round(importance) };
    const existing = bestByIndex.get(index);
    if (!existing || normalized.importance > existing.importance) {
      bestByIndex.set(index, normalized);
    }
  }

  return [...bestByIndex.values()].sort((a, b) => a.index - b.index);
}

async function fetchSentenceLabelsFromGemini(sentences, lensPurpose) {
  const apiKey   = process.env.GEMINI_API_KEY;
  const promptFn = LENS_PROMPTS[lensPurpose] ?? LENS_PROMPTS['inform'];
  const CHUNK    = 40;

  const processChunk = async (chunk, offset) => {
    const result = await runChunkWithRetry(
      signal => callGemini(apiKey, promptFn(chunk), signal),
      `label-chunk-offset-${offset}`
    );
    const labels = normalizeSentenceLabels(result?.labels, chunk.length, lensPurpose);
    if (labels === null) return null;
    return labels.map(l => ({ ...l, index: l.index + offset }));
  };

  const allLabels = [];
  let failCount   = 0;
  let totalChunks = 0;

  if (sentences.length <= CHUNK) {
    totalChunks = 1;
    const labels = await processChunk(sentences, 0);
    if (labels) allLabels.push(...labels);
    else failCount++;
  } else {
    for (let i = 0; i < sentences.length; i += CHUNK) {
      totalChunks++;
      const labels = await processChunk(sentences.slice(i, i + CHUNK), i);
      if (labels) allLabels.push(...labels);
      else failCount++;
    }
  }

  const success = totalChunks === 0 || failCount / totalChunks <= FAIL_THRESHOLD;
  return { labels: allLabels, success };
}

app.post('/api/label', async (req, res) => {
  const { sentences, lensPurpose, articleLens, minImportance } = req.body;
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ error: 'sentences array required' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    // Accept `lensPurpose` (new) with `articleLens` fallback for older clients.
    const purpose = lensPurpose ?? articleLens ?? 'inform';
    const threshold = clampMinImportance(minImportance);
    const { labels: scoredLabels, success } = await fetchSentenceLabelsFromGemini(sentences, purpose);
    const labels = scoredLabels.filter(label => label.importance >= threshold);
    res.json({ labels, scoredLabels, success });
  } catch (err) {
    console.error('Label error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Argus server running on http://localhost:${PORT}`);
});
