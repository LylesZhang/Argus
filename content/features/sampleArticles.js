// Static sample articles for the preset editor preview pane.
// Each article is designed to trigger visible highlights for emotion words,
// transition words, and lens-specific sentence label patterns.

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
  },

  humanities: {
    title: 'The Role of Silence in Modernist Literature',
    imagePlaceholders: [{ caption: 'Annotated Manuscript Scan', position: 1 }],
    blocks: [
      'This paper argues that modernist writers strategically deployed silence as a rhetorical device to challenge the expressive limits of language itself. Rather than treating silence as absence, authors such as Woolf and Beckett reimagined it as a form of meaning-making.',
      'Historical records show that the modernist movement emerged in direct response to the trauma of World War I, as cited in several contemporary literary journals. The unprecedented scale of destruction left writers searching for new forms of expression.',
      'This means that the fragmented syntax characteristic of modernist prose is not merely an aesthetic choice but a deliberate enactment of linguistic crisis. In other words, the breakdown of narrative coherence mirrors the breakdown of social and moral certainty.',
      'The evidence gathered from close readings of three canonical texts suggests a consistent pattern of strategic omission. In sum, silence in modernist literature functions as a powerful counter-discourse, resisting the totalizing claims of both realism and romanticism.',
    ],
  },

  fiction: {
    title: 'The Last Garden',
    imagePlaceholders: [{ caption: 'Garden Illustration', position: 1 }],
    blocks: [
      '"You shouldn\'t have come back," she said quietly, her voice barely audible above the rain. He stood in the doorway, water dripping from his coat, saying nothing for a long moment.',
      'The room smelled of old books and dried lavender. A single candle flickered on the windowsill, casting long shadows across the faded wallpaper. Outside, the storm had settled into a steady, mournful rhythm.',
      'Suddenly he realized she was trembling — not from cold, but from something deeper, something he had carried into the room with him like a ghost. "I\'m sorry," he said at last. "I didn\'t know where else to go."',
      'She turned slowly toward the window. The garden beyond was dark and overgrown, but she could still see the outline of the old oak tree where they had carved their names as children. It felt like another life, another world entirely.',
    ],
  },
};
