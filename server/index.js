import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

async function callGemini(apiKey, prompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
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
    });

    if (response.status === 503 && attempt < retries - 1) {
      const delay = 1500 * (attempt + 1);
      console.log(`[Gemini] 503 overloaded, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Empty Gemini response');

    console.log('Raw Gemini response (first 200):', raw.slice(0, 200));

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
  }
  throw new Error('Gemini unavailable after retries');
}

app.post('/api/analyze', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  try {
    const clipped      = text.slice(0, 60000);
    const wordCount    = clipped.split(/\s+/).length;
    const totalBudget  = Math.floor(wordCount / 100) * 6;
    const chunks       = chunkByParagraphs(clipped);
    const chunkBudget  = Math.max(4, Math.floor(totalBudget / chunks.length));

    console.log(`[analyze] wordCount=${wordCount} totalBudget=${totalBudget} chunks=${chunks.length} chunkBudget=${chunkBudget}`);

    const results    = await Promise.all(chunks.map(c => callGemini(apiKey, PROMPT(c, chunkBudget))));

    results.forEach((r, i) =>
      console.log(`[chunk ${i}] highlights=${r.highlights?.length ?? 'ERROR'}`)
    );

    const highlights = results.flatMap(r => r.highlights || []);

    res.json({ highlights });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const result  = await callGemini(apiKey, FOCUS_PROMPT(clipped, topic));
    res.json(result);
  } catch (err) {
    console.error('Focus error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const LENS_PROMPTS = {
  news: (sentences) => `
Classify sentences from this NEWS ARTICLE. Only include sentences you are confident about.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "core-fact" | "context" | "quote" }] }

Definitions:
- "core-fact" — the 5W1H lead: who did what, when, where (the core breaking news)
- "context"   — historical background or framing that explains why the event matters
- "quote"     — a direct or reported statement from a named official, witness, or expert
`.trim(),

  stem: (sentences) => `
Classify sentences from this STEM/ACADEMIC text. Only include sentences you are confident about.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "concept" | "mechanism" | "constraint" }] }

Definitions:
- "concept"    — defines or introduces a key term, phenomenon, or scientific principle
- "mechanism"  — describes a causal chain or sequential process (how something works step by step)
- "constraint" — states a limitation, exception, boundary condition, or caveat
`.trim(),

  humanities: (sentences) => `
Classify sentences from this HUMANITIES/SOCIAL SCIENCE text. Only include sentences you are confident about.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "thesis" | "evidence" | "explanation" }] }

Definitions:
- "thesis"      — the author's central claim, argument, or critical position
- "evidence"    — cited sources, archival data, statistics, or quoted scholarly works
- "explanation" — how the author connects evidence to thesis, or rebuts counter-arguments
`.trim(),

  fiction: (sentences) => `
Classify sentences from this FICTION/NARRATIVE text. Only include sentences you are confident about.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{ "labels": [{ "index": <n>, "type": "dialogue" | "plot-turn" | "setting" }] }

Definitions:
- "dialogue"   — a character speaks or a line of dialogue is reported
- "plot-turn"  — a key event, revelation, or dramatic turning point that advances the story
- "setting"    — describes environment, atmosphere, or interior monologue that does not advance plot
`.trim(),
};

async function fetchSentenceLabelsFromGemini(sentences, articleLens) {
  const apiKey   = process.env.GEMINI_API_KEY;
  const promptFn = LENS_PROMPTS[articleLens] ?? LENS_PROMPTS['news'];
  const CHUNK    = 40;
  let allLabels  = [];

  const runChunk = async (chunk, offset) => {
    try {
      const result = await callGemini(apiKey, promptFn(chunk));
      return (result?.labels ?? []).map(l => ({ ...l, index: l.index + offset }));
    } catch (err) {
      console.error(`[label] chunk offset=${offset} failed, skipping:`, err.message.slice(0, 80));
      return [];
    }
  };

  if (sentences.length <= CHUNK) {
    allLabels = await runChunk(sentences, 0);
  } else {
    for (let i = 0; i < sentences.length; i += CHUNK) {
      allLabels = allLabels.concat(await runChunk(sentences.slice(i, i + CHUNK), i));
    }
  }
  return allLabels;
}

app.post('/api/label', async (req, res) => {
  const { sentences, articleLens } = req.body;
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ error: 'sentences array required' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const labels = await fetchSentenceLabelsFromGemini(sentences, articleLens ?? 'news');
    res.json({ labels });
  } catch (err) {
    console.error('Label error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Argus server running on http://localhost:${PORT}`);
});
