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

async function callGemini(apiKey, prompt) {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    }),
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Empty Gemini response');

  console.log('Raw Gemini response (first 200):', raw.slice(0, 200));

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
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

const LABEL_PROMPT = (sentences) => `
Classify each sentence by its rhetorical role. Only include sentences you are
confident about — omit neutral or transitional ones.

Sentences:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}

Return ONLY this JSON:
{
  "labels": [
    { "index": <number>, "type": "argument" | "evidence" | "explanation" }
  ]
}

Definitions:
- "argument"    — a claim, thesis, or opinion the author asserts
- "evidence"    — specific facts, statistics, data, citations, or examples
- "explanation" — explains a cause, mechanism, or meaning (why/how something works)
`.trim();

app.post('/api/label', async (req, res) => {
  const { sentences } = req.body;
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ error: 'sentences array required' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const result = await callGemini(apiKey, LABEL_PROMPT(sentences));
    res.json(result);
  } catch (err) {
    console.error('Label error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Argus server running on http://localhost:${PORT}`);
});
