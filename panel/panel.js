// Side Panel logic
// Responsibilities:
//   1. Load saved settings from chrome.storage.sync and update the UI
//   2. When the user changes any setting, save it and notify content/index.js via background

// ── Default settings (must match DEFAULT_SETTINGS in content/index.js) ─

const DEFAULT_SETTINGS = {
  typographyEnabled:    false,
  readingAidsEnabled:   false,
  boldBeginning:        false,
  emotionColor:         false,
  gradientRows:         false,
  logicAnimation:       false,
  fontSize:             18,
  lineHeight:           1.8,
  fontFamily:           '',
  wordSpacing:          0,
  letterSpacing:        0,
  fontColor:            '#2c2c2c',
  bgColor:              '#ffffff',
  emotionPositiveColor: '#27ae60',
  emotionNegativeColor: '#e74c3c',
  emotionSurpriseColor: '#8e44ad',
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
  document.getElementById('toggle-logic').checked     = settings.logicAnimation;
  document.getElementById('toggle-ruler').checked     = settings.rulerActive;

  document.getElementById('font-family').value        = settings.fontFamily ?? '';
  document.getElementById('font-size-slider').value   = settings.fontSize ?? 18;
  document.getElementById('font-size-value').textContent = (settings.fontSize ?? 18) + 'px';
  document.getElementById('line-height-slider').value = settings.lineHeight ?? 1.8;
  document.getElementById('line-height-value').textContent = (settings.lineHeight ?? 1.8).toFixed(1);
  document.getElementById('word-spacing-slider').value   = settings.wordSpacing;
  document.getElementById('word-spacing-value').textContent = settings.wordSpacing.toFixed(2) + 'em';
  document.getElementById('letter-spacing-slider').value = settings.letterSpacing;
  document.getElementById('letter-spacing-value').textContent = settings.letterSpacing.toFixed(2) + 'em';

  document.getElementById('font-color').value         = settings.fontColor;
  document.getElementById('bg-color').value           = settings.bgColor;
  document.getElementById('emotion-positive-color').value = settings.emotionPositiveColor;
  document.getElementById('emotion-negative-color').value = settings.emotionNegativeColor;
  document.getElementById('emotion-surprise-color').value = settings.emotionSurpriseColor;
  document.getElementById('ruler-size-slider').value  = settings.rulerWindowLines;
  document.getElementById('ruler-size-value').textContent = settings.rulerWindowLines.toFixed(1) + ' lines';

  document.getElementById('emotion-colors').classList.toggle('active', settings.emotionColor);
  document.getElementById('ruler-size-control').classList.toggle('active', settings.rulerActive);
}

// ── Wire up all controls ───────────────────────────────────────────────

function init() {
  // Section switches
  document.getElementById('toggle-typography').addEventListener('change', e => {
    broadcast({ typographyEnabled: e.target.checked });
  });

  document.getElementById('toggle-reading-aids').addEventListener('change', e => {
    broadcast({ readingAidsEnabled: e.target.checked });
  });

  // Reading aid toggles
  document.getElementById('toggle-bold').addEventListener('change', e => {
    broadcast({ boldBeginning: e.target.checked });
  });

  document.getElementById('toggle-emotion').addEventListener('change', e => {
    broadcast({ emotionColor: e.target.checked });
    document.getElementById('emotion-colors').classList.toggle('active', e.target.checked);
  });

  document.getElementById('toggle-gradient').addEventListener('change', e => {
    broadcast({ gradientRows: e.target.checked });
  });

  document.getElementById('toggle-logic').addEventListener('change', e => {
    broadcast({ logicAnimation: e.target.checked });
  });

  document.getElementById('toggle-ruler').addEventListener('change', e => {
    broadcast({ rulerActive: e.target.checked });
    document.getElementById('ruler-size-control').classList.toggle('active', e.target.checked);
  });

  document.getElementById('ruler-size-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('ruler-size-value').textContent = v.toFixed(1) + ' lines';
    broadcast({ rulerWindowLines: v });
  });

  // Font family
  document.getElementById('font-family').addEventListener('change', e => {
    broadcast({ fontFamily: e.target.value });
  });

  // Font size — stepper
  document.getElementById('font-size-dec').addEventListener('click', () => {
    if (settings.fontSize <= 14) return;
    const v = settings.fontSize - 1;
    document.getElementById('font-size-slider').value = v;
    document.getElementById('font-size-value').textContent = v + 'px';
    broadcast({ fontSize: v });
  });
  document.getElementById('font-size-inc').addEventListener('click', () => {
    if (settings.fontSize >= 28) return;
    const v = settings.fontSize + 1;
    document.getElementById('font-size-slider').value = v;
    document.getElementById('font-size-value').textContent = v + 'px';
    broadcast({ fontSize: v });
  });
  document.getElementById('font-size-slider').addEventListener('input', e => {
    const v = parseInt(e.target.value);
    document.getElementById('font-size-value').textContent = v + 'px';
    broadcast({ fontSize: v });
  });

  // Line height — stepper
  document.getElementById('line-height-dec').addEventListener('click', () => {
    if (settings.lineHeight <= 1.4) return;
    const v = Math.round((settings.lineHeight - 0.1) * 10) / 10;
    document.getElementById('line-height-slider').value = v;
    document.getElementById('line-height-value').textContent = v.toFixed(1);
    broadcast({ lineHeight: v });
  });
  document.getElementById('line-height-inc').addEventListener('click', () => {
    if (settings.lineHeight >= 2.4) return;
    const v = Math.round((settings.lineHeight + 0.1) * 10) / 10;
    document.getElementById('line-height-slider').value = v;
    document.getElementById('line-height-value').textContent = v.toFixed(1);
    broadcast({ lineHeight: v });
  });
  document.getElementById('line-height-slider').addEventListener('input', e => {
    const v = Math.round(parseFloat(e.target.value) * 10) / 10;
    document.getElementById('line-height-value').textContent = v.toFixed(1);
    broadcast({ lineHeight: v });
  });

  // Word spacing
  document.getElementById('word-spacing-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('word-spacing-value').textContent = v.toFixed(2) + 'em';
    broadcast({ wordSpacing: v });
  });

  // Letter spacing
  document.getElementById('letter-spacing-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('letter-spacing-value').textContent = v.toFixed(2) + 'em';
    broadcast({ letterSpacing: v });
  });

  // Colors
  document.getElementById('font-color').addEventListener('input', e => {
    broadcast({ fontColor: e.target.value });
  });
  document.getElementById('bg-color').addEventListener('input', e => {
    broadcast({ bgColor: e.target.value });
  });
  document.getElementById('emotion-positive-color').addEventListener('input', e => {
    broadcast({ emotionPositiveColor: e.target.value });
  });
  document.getElementById('emotion-negative-color').addEventListener('input', e => {
    broadcast({ emotionNegativeColor: e.target.value });
  });
  document.getElementById('emotion-surprise-color').addEventListener('input', e => {
    broadcast({ emotionSurpriseColor: e.target.value });
  });
}

// ── Boot ───────────────────────────────────────────────────────────────

chrome.storage.sync.get('draSettings', (data) => {
  if (data.draSettings) settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
  syncUI();
  init();
});
