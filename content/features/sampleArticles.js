// Static sample articles for the preset editor preview pane.
// AI analysis results (emotion highlights + sentence labels) are pre-computed
// once during development and stored here to avoid live API calls at preview time.

export const SAMPLE_ARTICLES = {
  inform: {
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
      { index: 0, type: 'key-point' },
      { index: 1, type: 'core-detail' },
      { index: 2, type: 'key-point' },
      { index: 3, type: 'core-detail' },
      { index: 6, type: 'core-detail' },
      { index: 8, type: 'core-detail' },
    ],
  },

  understand: {
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
      { index: 2, type: 'reasoning' },
      { index: 3, type: 'reasoning' },
      { index: 4, type: 'reasoning' },
      { index: 6, type: 'reasoning' },
      { index: 7, type: 'takeaway' },
      { index: 8, type: 'takeaway' },
      { index: 9, type: 'takeaway' },
    ],
  },

  evaluate: {
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
      { index: 0, type: 'claim' },
      { index: 1, type: 'evidence' },
      { index: 2, type: 'evidence' },
      { index: 4, type: 'claim' },
      { index: 5, type: 'claim' },
      { index: 6, type: 'evidence' },
      { index: 7, type: 'claim' },
    ],
  },

};
