// Static sample articles for the preset editor preview pane.
// AI analysis results (emotion highlights + sentence labels) are pre-computed
// once during development and stored here to avoid live API calls at preview time.

export const SAMPLE_ARTICLES = {
  news: {
    title: 'City Council Approves New Climate Action Plan',
    imagePlaceholders: [{ caption: 'City Council Meeting', position: 1 }],
    blocks: [
      'The city council unanimously approved a landmark climate action plan on Tuesday, declaring a full transition to renewable energy by 2035. Officials confirmed the measure passed after months of tense deliberation, marking a triumph for environmental advocates who celebrated the victory outside city hall.',
      'However, critics argue the timeline is too ambitious and may devastate local industries. "This decision will destroy thousands of jobs," warned opposition leader Sarah Kim. "We admire the hope behind it, but fear the grief it could bring to working families."',
      'In contrast, supporters expressed joy and optimism. The mayor announced that federal funding will help ease the transition, and community leaders praised the plan as a brilliant breakthrough for a more sustainable future.',
      'Nevertheless, the road ahead remains uncertain. Analysts confirmed that similar policies in other cities have faced fierce resistance. Despite this, advocates remain confident and united in their pursuit of progress.',
    ],
    aiEmotionHighlights: [
      // paragraphs 1–2
      { word: 'tense',                context: ' of tense ',        category: 'emotion-negative' },
      { word: 'triumph',              context: 'g a triumph',        category: 'emotion-positive' },
      { word: 'celebrated',           context: 'ebrated the',        category: 'emotion-positive' },
      { word: 'ambitious',            context: 'is too ambi',        category: 'emotion-complex'  },
      { word: 'devastate',            context: 'y devastate',        category: 'emotion-negative' },
      { word: 'destroy',              context: 'will destroy',       category: 'emotion-negative' },
      // paragraphs 3–4 (API results from per-paragraph calls)
      { word: 'joy',                  context: 'essed joy',          category: 'emotion-positive' },
      { word: 'optimism',             context: 'and optim',          category: 'emotion-positive' },
      { word: 'praised',              context: 'rs praised',         category: 'emotion-positive' },
      { word: 'brilliant breakthrough', context: 'a brilliant breakth', category: 'emotion-positive' },
      { word: 'uncertain',            context: 'remains un',         category: 'emotion-negative' },
      { word: 'fierce',               context: 'faced fier',         category: 'emotion-negative' },
      { word: 'resistance',           context: 'ce resistance',      category: 'emotion-negative' },
      { word: 'confident',            context: 'remain con',         category: 'emotion-positive' },
    ],
    aiSentenceLabels: [
      { index: 0, type: 'core-fact' },
      { index: 1, type: 'context' },
      { index: 2, type: 'impact' },
      { index: 3, type: 'impact' },
      { index: 4, type: 'impact' },
      { index: 5, type: 'impact' },
      { index: 6, type: 'impact' },
      { index: 7, type: 'context' },
      { index: 8, type: 'context' },
      { index: 9, type: 'impact' },
    ],
    aiSentenceLabelRanking: ['core-fact', 'impact', 'context'],
  },

  stem: {
    title: 'Neural Networks Learn to Predict Protein Folding',
    imagePlaceholders: [{ caption: 'Protein Structure Diagram', position: 1 }],
    blocks: [
      'Protein folding is defined as the process by which a polypeptide chain assumes its functional three-dimensional structure. Understanding this mechanism has been a central challenge in structural biology for decades.',
      'The algorithm then applies a multi-layer attention mechanism to iteratively refine spatial coordinates. Subsequently, predicted distances between amino acid residues are used to constrain the final structure. This mechanism explains why the model outperforms classical approaches.',
      'However, the model struggles with intrinsically disordered proteins, which lack a stable fold. Unless the training dataset is expanded, performance on novel protein families may remain limited. Despite this constraint, the results represent a significant breakthrough.',
      'In conclusion, neural network-based protein structure prediction is defined as a transformative approach that subsequently enables rapid drug discovery pipelines. This concept opens new avenues for treating diseases that were previously considered untreatable.',
    ],
    aiEmotionHighlights: [
      { word: 'challenge',     context: 'ral challenge', category: 'emotion-negative' },
      { word: 'struggles',     context: 'model struggles', category: 'emotion-negative' },
      { word: 'limited',       context: 'may remain limited', category: 'emotion-negative' },
      { word: 'breakthrough',  context: 'nt breakthrough', category: 'emotion-positive' },
      { word: 'transformative', context: 'a transformative', category: 'emotion-positive' },
      { word: 'untreatable',   context: 'sidered untreatable', category: 'emotion-negative' },
    ],
    aiSentenceLabels: [
      { index: 0, type: 'concept' },
      { index: 1, type: 'concept' },
      { index: 2, type: 'mechanism' },
      { index: 3, type: 'mechanism' },
      { index: 4, type: 'mechanism' },
      { index: 5, type: 'finding' },
      { index: 6, type: 'finding' },
      { index: 7, type: 'finding' },
      { index: 8, type: 'concept' },
      { index: 9, type: 'finding' },
    ],
    aiSentenceLabelRanking: ['mechanism', 'concept', 'finding'],
  },

  humanities: {
    title: 'The Role of Silence in Modernist Literature',
    imagePlaceholders: [{ caption: 'Virginia Woolf, 1902', position: 0 }],
    blocks: [
      'This paper argues that modernist writers strategically deployed silence as a rhetorical device to challenge the expressive limits of language itself. Rather than treating silence as absence, authors such as Woolf and Beckett reimagined it as a form of meaning-making.',
      'Historical records show that the modernist movement emerged in direct response to the trauma of World War I, as cited in several contemporary literary journals. The unprecedented scale of destruction left writers searching for new forms of expression.',
      'This means that the fragmented syntax characteristic of modernist prose is not merely an aesthetic choice but a deliberate enactment of linguistic crisis. In other words, the breakdown of narrative coherence mirrors the breakdown of social and moral certainty.',
      'The evidence gathered from close readings of three canonical texts suggests a consistent pattern of strategic omission. In sum, silence in modernist literature functions as a powerful counter-discourse, resisting the totalizing claims of both realism and romanticism.',
    ],
    aiEmotionHighlights: [
      { word: 'trauma',       context: 'of World ', category: 'emotion-negative' },
      { word: 'unprecedented', context: 'The unpre', category: 'emotion-complex' },
      { word: 'destruction',  context: 'e of dest', category: 'emotion-negative' },
      { word: 'crisis',       context: 'linguisti', category: 'emotion-negative' },
      { word: 'breakdown',    context: 's, the bre', category: 'emotion-negative' },
      { word: 'resisting',    context: 'course, r', category: 'emotion-complex' },
    ],
    aiSentenceLabels: [
      { index: 0, type: 'thesis' },
      { index: 1, type: 'explanation' },
      { index: 2, type: 'evidence' },
      { index: 3, type: 'explanation' },
      { index: 4, type: 'explanation' },
      { index: 5, type: 'explanation' },
      { index: 6, type: 'evidence' },
      { index: 7, type: 'thesis' },
    ],
    aiSentenceLabelRanking: ['thesis', 'evidence', 'explanation'],
  },

  fiction: {
    title: 'The Last Garden',
    imagePlaceholders: [{ caption: 'The overgrown garden at dusk', position: 2 }],
    blocks: [
      '"You shouldn\'t have come back," she said quietly, her voice barely audible above the rain. He stood in the doorway, water dripping from his coat, saying nothing for a long moment.',
      'The room smelled of old books and dried lavender. A single candle flickered on the windowsill, casting long shadows across the faded wallpaper. Outside, the storm had settled into a steady, mournful rhythm.',
      'Suddenly he realized she was trembling — not from cold, but from something deeper, something he had carried into the room with him like a ghost. "I\'m sorry," he said at last. "I didn\'t know where else to go."',
      'She turned slowly toward the window. The garden beyond was dark and overgrown, but she could still see the outline of the old oak tree where they had carved their names as children. It felt like another life, another world entirely.',
    ],
    aiEmotionHighlights: [
      { word: 'quietly',       context: 'said quie', category: 'emotion-negative' },
      { word: 'barely audible', context: 'e barely ', category: 'emotion-negative' },
      { word: 'mournful',      context: 'a mournfu', category: 'emotion-negative' },
      { word: 'trembling',     context: 'was trem', category: 'emotion-negative' },
      { word: 'ghost',         context: 'like a g', category: 'emotion-complex' },
      { word: 'sorry',         context: "I'm sorr", category: 'emotion-negative' },
    ],
    aiSentenceLabels: [
      { index: 1,  type: 'setting' },
      { index: 2,  type: 'setting' },
      { index: 3,  type: 'setting' },
      { index: 4,  type: 'setting' },
      { index: 5,  type: 'plot-turn' },
      { index: 8,  type: 'setting' },
      { index: 9,  type: 'setting' },
      { index: 10, type: 'setting' },
    ],
    aiSentenceLabelRanking: ['plot-turn', 'setting'],
  },
};
