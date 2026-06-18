// Side Panel logic
// Responsibilities:
//   1. Load saved settings from chrome.storage.sync and update the UI
//   2. When the user changes any setting, save it and notify content/index.js via background

// ── Default settings (must match DEFAULT_SETTINGS in content/index.js) ─

const DEFAULT_SETTINGS = {
  typographyEnabled:     false,
  readingAidsEnabled:    false,
  boldBeginning:         false,
  emotionColor:          false,
  emotionMode:           'local',
  gradientRows:          false,
  rowShadingColor:       '#bfb3d0',
  transitionAnimation:   false,
  sentenceLabels:        false,
  sentenceLabelsMode:    'local',
  labelEvidenceColor:    '#16a34a',
  labelArgumentColor:    '#0d9488',
  labelExplanationColor: '#9333ea',
  topicFocusMode:        'local',
  fontSize:             18,
  lineHeight:           1.8,
  fontFamily:           '',
  wordSpacing:          0,
  letterSpacing:        0,
  fontColor:            '#2c2c2c',
  bgColor:              '#ffffff',
  emotionPositiveColor: '#27ae60',
  emotionNegativeColor: '#e74c3c',
  emotionComplexColor: '#8e44ad',
  rulerActive:          false,
  rulerWindowLines:     1.5,
};

let settings = { ...DEFAULT_SETTINGS };

// ── Send updated settings to background (which relays to content script) ─

function broadcast(changed) {
  settings = { ...settings, ...changed };
  chrome.storage.sync.set({ draSettings: settings });
  chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', payload: changed });
}

// ── Sync all UI controls to match current settings ─────────────────────

function syncUI() {
  document.getElementById('toggle-typography').checked   = settings.typographyEnabled;
  document.getElementById('toggle-reading-aids').checked = settings.readingAidsEnabled;
  document.getElementById('toggle-bold').checked      = settings.boldBeginning;
  document.getElementById('toggle-emotion').checked   = settings.emotionColor;
  document.getElementById('toggle-gradient').checked  = settings.gradientRows;
  document.getElementById('toggle-transition').checked = settings.transitionAnimation;
  document.getElementById('toggle-ruler').checked     = settings.rulerActive;

  document.getElementById('font-family').value        = settings.fontFamily ?? '';
  document.getElementById('font-size-slider').value   = settings.fontSize ?? 18;
  document.getElementById('font-size-value').textContent = settings.fontSize ?? 18;
  document.getElementById('line-height-slider').value = settings.lineHeight ?? 1.8;
  document.getElementById('line-height-value').textContent = (settings.lineHeight ?? 1.8).toFixed(1);
  document.getElementById('word-spacing-slider').value   = settings.wordSpacing;
  document.getElementById('word-spacing-value').textContent = settings.wordSpacing.toFixed(1);
  document.getElementById('letter-spacing-slider').value = settings.letterSpacing;
  document.getElementById('letter-spacing-value').textContent = settings.letterSpacing.toFixed(2);

  document.getElementById('font-color').value         = settings.fontColor;
  document.getElementById('bg-color').value           = settings.bgColor;
  document.getElementById('row-shading-color').value  = settings.rowShadingColor;
  document.getElementById('row-shading-color').classList.toggle('active', settings.gradientRows);
  document.getElementById('emotion-positive-color').value = settings.emotionPositiveColor;
  document.getElementById('emotion-negative-color').value = settings.emotionNegativeColor;
  document.getElementById('emotion-complex-color').value = settings.emotionComplexColor;
  document.getElementById('label-evidence-color').value = settings.labelEvidenceColor;
  document.getElementById('label-argument-color').value = settings.labelArgumentColor;
  document.getElementById('label-explanation-color').value = settings.labelExplanationColor;
  document.getElementById('ruler-size-slider').value  = settings.rulerWindowLines;
  document.getElementById('ruler-size-value').textContent = settings.rulerWindowLines.toFixed(1) + ' lines';

  document.getElementById('emotion-colors').classList.toggle('active', settings.emotionColor);
  document.getElementById('sentence-label-colors').classList.toggle('active', settings.sentenceLabels);
  document.getElementById('toggle-labels').checked = settings.sentenceLabels;

  // Sync mode pills to stored settings
  [['emotion', settings.emotionMode], ['sentenceLabels', settings.sentenceLabelsMode], ['topicFocus', settings.topicFocusMode]].forEach(([feature, mode]) => {
    document.querySelectorAll(`[data-feature="${feature}"]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  });
}

// ── Wire up all controls ───────────────────────────────────────────────

function init() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + target).classList.add('active');
      chrome.storage.local.set({ activeTab: target });
    });
  });

  // Section switches
  document.getElementById('toggle-typography').addEventListener('change', e => {
    const enabled = e.target.checked;
    if (!enabled) {
      document.getElementById('font-family').value                  = '';
      document.getElementById('font-size-slider').value             = 18;
      document.getElementById('font-size-value').textContent        = '18';
      document.getElementById('line-height-slider').value           = 1.8;
      document.getElementById('line-height-value').textContent      = '1.8';
      document.getElementById('word-spacing-slider').value          = 0;
      document.getElementById('word-spacing-value').textContent     = '0.0';
      document.getElementById('letter-spacing-slider').value        = 0;
      document.getElementById('letter-spacing-value').textContent   = '0.00';
      document.getElementById('font-color').value                   = '#2c2c2c';
      document.getElementById('bg-color').value                     = '#ffffff';
      document.getElementById('toggle-bold').checked                = false;
      broadcast({
        typographyEnabled: false,
        boldBeginning: false,
        fontSize: null, lineHeight: null, fontFamily: null,
        wordSpacing: 0, letterSpacing: 0,
        fontColor: '#2c2c2c', bgColor: '#ffffff',
      });
    } else {
      broadcast({ typographyEnabled: true });
    }
  });

  document.getElementById('toggle-reading-aids').addEventListener('change', e => {
    const enabled = e.target.checked;
    if (!enabled) {
      document.getElementById('toggle-emotion').checked    = false;
      document.getElementById('toggle-gradient').checked   = false;
      document.getElementById('toggle-transition').checked = false;
      document.getElementById('toggle-labels').checked     = false;
      document.getElementById('toggle-ruler').checked      = false;
      document.getElementById('emotion-colors').classList.remove('active');
      document.getElementById('sentence-label-colors').classList.remove('active');
      document.getElementById('row-shading-color').classList.remove('active');
      broadcast({
        readingAidsEnabled: false,
        emotionColor: false,
        gradientRows: false,  transitionAnimation: false,
        sentenceLabels: false, rulerActive: false,
      });
    } else {
      broadcast({ readingAidsEnabled: true });
    }
  });

  // Reading aid toggles — auto-enable parent if child is turned on while parent is off
  function enableReadingAidIfNeeded(on) {
    if (on && !settings.readingAidsEnabled) {
      document.getElementById('toggle-reading-aids').checked = true;
      broadcast({ readingAidsEnabled: true });
    }
  }

  document.getElementById('toggle-bold').addEventListener('change', e => {
    enableTypographyIfNeeded();
    broadcast({ boldBeginning: e.target.checked });
  });

  document.getElementById('toggle-emotion').addEventListener('change', e => {
    enableReadingAidIfNeeded(e.target.checked);
    broadcast({ emotionColor: e.target.checked });
    document.getElementById('emotion-colors').classList.toggle('active', e.target.checked);
  });

  document.getElementById('toggle-gradient').addEventListener('change', e => {
    enableReadingAidIfNeeded(e.target.checked);
    document.getElementById('row-shading-color').classList.toggle('active', e.target.checked);
    broadcast({ gradientRows: e.target.checked });
  });

  document.getElementById('toggle-transition').addEventListener('change', e => {
    enableReadingAidIfNeeded(e.target.checked);
    broadcast({ transitionAnimation: e.target.checked });
  });

  document.getElementById('toggle-labels').addEventListener('change', e => {
    enableReadingAidIfNeeded(e.target.checked);
    broadcast({ sentenceLabels: e.target.checked });
    document.getElementById('sentence-label-colors').classList.toggle('active', e.target.checked);
  });

  document.getElementById('toggle-ruler').addEventListener('change', e => {
    enableReadingAidIfNeeded(e.target.checked);
    broadcast({ rulerActive: e.target.checked });
    document.getElementById('ruler-size-control').classList.toggle('active', e.target.checked);
  });

  document.getElementById('ruler-size-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('ruler-size-value').textContent = v.toFixed(1) + ' lines';
    broadcast({ rulerWindowLines: v });
  });

  // Typography controls — auto-enable parent if any control is adjusted while parent is off
  function enableTypographyIfNeeded() {
    if (!settings.typographyEnabled) {
      document.getElementById('toggle-typography').checked = true;
      broadcast({ typographyEnabled: true });
    }
  }

  // Font family
  document.getElementById('font-family').addEventListener('change', e => {
    enableTypographyIfNeeded();
    broadcast({ fontFamily: e.target.value });
  });

  // Font size — stepper
  document.getElementById('font-size-dec').addEventListener('click', () => {
    if (settings.fontSize <= 14) return;
    enableTypographyIfNeeded();
    const v = settings.fontSize - 1;
    document.getElementById('font-size-slider').value = v;
    document.getElementById('font-size-value').textContent = v;
    broadcast({ fontSize: v });
  });
  document.getElementById('font-size-inc').addEventListener('click', () => {
    if (settings.fontSize >= 28) return;
    enableTypographyIfNeeded();
    const v = settings.fontSize + 1;
    document.getElementById('font-size-slider').value = v;
    document.getElementById('font-size-value').textContent = v;
    broadcast({ fontSize: v });
  });
  document.getElementById('font-size-slider').addEventListener('input', e => {
    enableTypographyIfNeeded();
    const v = parseInt(e.target.value);
    document.getElementById('font-size-value').textContent = v;
    broadcast({ fontSize: v });
  });

  // Line height — stepper
  document.getElementById('line-height-dec').addEventListener('click', () => {
    if (settings.lineHeight <= 1.4) return;
    enableTypographyIfNeeded();
    const v = Math.round((settings.lineHeight - 0.1) * 10) / 10;
    document.getElementById('line-height-slider').value = v;
    document.getElementById('line-height-value').textContent = v.toFixed(1);
    broadcast({ lineHeight: v });
  });
  document.getElementById('line-height-inc').addEventListener('click', () => {
    if (settings.lineHeight >= 2.4) return;
    enableTypographyIfNeeded();
    const v = Math.round((settings.lineHeight + 0.1) * 10) / 10;
    document.getElementById('line-height-slider').value = v;
    document.getElementById('line-height-value').textContent = v.toFixed(1);
    broadcast({ lineHeight: v });
  });
  document.getElementById('line-height-slider').addEventListener('input', e => {
    enableTypographyIfNeeded();
    const v = Math.round(parseFloat(e.target.value) * 10) / 10;
    document.getElementById('line-height-value').textContent = v.toFixed(1);
    broadcast({ lineHeight: v });
  });

  // Word spacing — stepper + slider
  document.getElementById('word-spacing-dec').addEventListener('click', () => {
    if (settings.wordSpacing <= 0) return;
    enableTypographyIfNeeded();
    const v = Math.max(0, Math.round((settings.wordSpacing - 0.05) * 100) / 100);
    document.getElementById('word-spacing-slider').value = v;
    document.getElementById('word-spacing-value').textContent = v.toFixed(1);
    broadcast({ wordSpacing: v });
  });
  document.getElementById('word-spacing-inc').addEventListener('click', () => {
    if (settings.wordSpacing >= 0.5) return;
    enableTypographyIfNeeded();
    const v = Math.min(0.5, Math.round((settings.wordSpacing + 0.05) * 100) / 100);
    document.getElementById('word-spacing-slider').value = v;
    document.getElementById('word-spacing-value').textContent = v.toFixed(1);
    broadcast({ wordSpacing: v });
  });
  document.getElementById('word-spacing-slider').addEventListener('input', e => {
    enableTypographyIfNeeded();
    const v = parseFloat(e.target.value);
    document.getElementById('word-spacing-value').textContent = v.toFixed(1);
    broadcast({ wordSpacing: v });
  });

  // Letter spacing — stepper + slider
  document.getElementById('letter-spacing-dec').addEventListener('click', () => {
    if (settings.letterSpacing <= 0) return;
    enableTypographyIfNeeded();
    const v = Math.max(0, Math.round((settings.letterSpacing - 0.01) * 1000) / 1000);
    document.getElementById('letter-spacing-slider').value = v;
    document.getElementById('letter-spacing-value').textContent = v.toFixed(2);
    broadcast({ letterSpacing: v });
  });
  document.getElementById('letter-spacing-inc').addEventListener('click', () => {
    if (settings.letterSpacing >= 0.1) return;
    enableTypographyIfNeeded();
    const v = Math.min(0.1, Math.round((settings.letterSpacing + 0.01) * 1000) / 1000);
    document.getElementById('letter-spacing-slider').value = v;
    document.getElementById('letter-spacing-value').textContent = v.toFixed(2);
    broadcast({ letterSpacing: v });
  });
  document.getElementById('letter-spacing-slider').addEventListener('input', e => {
    enableTypographyIfNeeded();
    const v = parseFloat(e.target.value);
    document.getElementById('letter-spacing-value').textContent = v.toFixed(2);
    broadcast({ letterSpacing: v });
  });

  // Colors
  document.getElementById('font-color').addEventListener('input', e => {
    enableTypographyIfNeeded();
    broadcast({ fontColor: e.target.value });
  });
  document.getElementById('bg-color').addEventListener('input', e => {
    enableTypographyIfNeeded();
    broadcast({ bgColor: e.target.value });
  });
  document.getElementById('row-shading-color').addEventListener('input', e => {
    enableReadingAidIfNeeded(true);
    document.getElementById('toggle-gradient').checked = true;
    document.getElementById('row-shading-color').classList.add('active');
    broadcast({ gradientRows: true, rowShadingColor: e.target.value });
  });
  document.getElementById('emotion-positive-color').addEventListener('input', e => {
    broadcast({ emotionPositiveColor: e.target.value });
  });
  document.getElementById('emotion-negative-color').addEventListener('input', e => {
    broadcast({ emotionNegativeColor: e.target.value });
  });
  document.getElementById('emotion-complex-color').addEventListener('input', e => {
    broadcast({ emotionComplexColor: e.target.value });
  });
  document.getElementById('label-evidence-color').addEventListener('input', e => {
    broadcast({ labelEvidenceColor: e.target.value });
  });
  document.getElementById('label-argument-color').addEventListener('input', e => {
    broadcast({ labelArgumentColor: e.target.value });
  });
  document.getElementById('label-explanation-color').addEventListener('input', e => {
    broadcast({ labelExplanationColor: e.target.value });
  });

  // Mode pills (AI / Local) for emotion and sentenceLabels
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const feature = btn.dataset.feature;  // 'emotion' | 'sentenceLabels'
      const mode    = btn.dataset.mode;     // 'ai' | 'local'
      const modeKey = feature + 'Mode';    // 'emotionMode' | 'sentenceLabelsMode'
      btn.closest('.mode-pill').querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      broadcast({ [modeKey]: mode });
    });
  });

  // Topic Focus
  document.getElementById('topic-apply').addEventListener('click', () => {
    const raw = document.getElementById('topic-input').value.trim();
    if (!raw) return;
    if (settings.topicFocusMode === 'ai') {
      chrome.runtime.sendMessage({ type: 'FOCUS_AI_REQUEST', topic: raw });
    } else {
      const keywords = raw.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      chrome.runtime.sendMessage({ type: 'FOCUS_APPLY', keywords });
    }
  });

  document.getElementById('topic-clear').addEventListener('click', () => {
    document.getElementById('topic-input').value = '';
    chrome.runtime.sendMessage({ type: 'FOCUS_CLEAR' });
  });
}

// ── Boot ───────────────────────────────────────────────────────────────

chrome.storage.sync.get('draSettings', (data) => {
  if (data.draSettings) settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
  syncUI();
  init();
});

chrome.storage.local.get('activeTab', (data) => {
  const tab = data.activeTab || 'effects';
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + tab)
  );
});
