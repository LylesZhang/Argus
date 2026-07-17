// Side Panel logic
// Responsibilities:
//   1. Load saved settings from chrome.storage.sync and update the UI
//   2. When the user changes any setting, save it and notify content/index.js via background

function updateSliderFill(el) {
  const pct = (el.value - el.min) / (el.max - el.min) * 100;
  el.style.setProperty('--pct', pct + '%');
}

const STEPPER_BOUNDS = [
  { dec: 'font-size-dec',      inc: 'font-size-inc',      val: 'font-size-value',      hint: 'font-size-hint',      min: 14,  max: 28,  unit: 'px', precision: 0 },
  { dec: 'line-height-dec',    inc: 'line-height-inc',    val: 'line-height-value',    hint: 'line-height-hint',    min: 1.4, max: 2.4, unit: '',   precision: 1 },
  { dec: 'word-spacing-dec',   inc: 'word-spacing-inc',   val: 'word-spacing-value',   hint: 'word-spacing-hint',   min: 0,   max: 0.5, unit: 'em', precision: 2 },
  { dec: 'letter-spacing-dec', inc: 'letter-spacing-inc', val: 'letter-spacing-value', hint: 'letter-spacing-hint', min: 0,   max: 0.1, unit: 'em', precision: 2 },
];
function syncStepperBounds() {
  for (const { dec, inc, val, hint, min, max, unit, precision } of STEPPER_BOUNDS) {
    const v = parseFloat(document.getElementById(val)?.value ?? min);
    const atMin = v <= min, atMax = v >= max;
    document.getElementById(dec).disabled = atMin;
    document.getElementById(inc).disabled = atMax;
    const hintEl = document.getElementById(hint);
    if (hintEl) {
      const fmt = n => Number(n).toFixed(precision);
      const msg = atMax ? `Maximum ${fmt(max)}${unit} reached`
                : atMin ? `Minimum ${fmt(min)}${unit} reached` : '';
      hintEl.textContent = msg;
      hintEl.classList.toggle('hidden', !msg);
    }
  }
}

/* ── Hover tooltips ─────────────────────────────────────────────────────── */
(function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'argus-tooltip';
  document.body.appendChild(tip);

  let timer = null;

  function show(text, anchor) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      tip.textContent = text;
      const r = anchor.getBoundingClientRect();
      const panelW = document.documentElement.offsetWidth;
      let left = r.left + 2;
      if (left + 214 > panelW - 8) left = panelW - 8 - 214;
      tip.style.top  = (r.bottom + 5) + 'px';
      tip.style.left = left + 'px';
      tip.classList.add('visible');
    }, 700);
  }

  function hide() {
    clearTimeout(timer);
    tip.classList.remove('visible');
  }

  document.addEventListener('mouseenter', e => {
    const el = e.target.closest('[data-tooltip]');
    if (el) show(el.dataset.tooltip, el);
  }, true);

  document.addEventListener('mouseleave', e => {
    if (e.target.closest('[data-tooltip]')) hide();
  }, true);

  document.addEventListener('mousedown', () => hide());
})();

// ── Default settings (must match DEFAULT_SETTINGS in content/index.js) ─

const DEFAULT_SETTINGS = {
  panelSize:             'comfortable',
  masterEnabled:         true,
  boldBeginning:         false,
  emotionColor:          false,
  emotionMode:           'local',
  gradientRows:          false,
  rowShadingColor:       '#bfb3d0',
  transitionAnimation:   false,
  sentenceSimplify:      false,
  sentenceLabels:        false,
  sentenceLabelsLens:    'inform',
  sentenceLabelsDensity: 'medium',
  labelKeyPointColor:     '#eab308',
  labelCoreDetailColor:   '#3b82f6',
  labelConceptColor:      '#9333ea',
  labelReasoningColor:    '#f97316',
  labelTakeawayColor:     '#0d9488',
  labelClaimColor:        '#ca8a04',
  labelEvidenceColor:     '#22c55e',
  labelCounterpointColor: '#e11d48',
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
  emotionComplexColor:  '#8e44ad',
  rulerActive:          false,
  rulerWindowLines:     1.5,
  autoScrollActive:     false,
  autoScrollSpeed:      2,
  typewriterActive:     false,
  typewriterSpeed:      5,
};

const PRESET_SETTING_KEYS = [
  'masterEnabled', 'fontFamily', 'boldBeginning', 'fontSize', 'lineHeight',
  'wordSpacing', 'letterSpacing', 'fontColor', 'bgColor',
  'typewriterSpeed',
  'gradientRows', 'rowShadingColor', 'transitionAnimation', 'sentenceSimplify',
  'rulerActive', 'rulerWindowLines', 'autoScrollSpeed',
  'emotionColor', 'emotionMode', 'emotionPositiveColor', 'emotionNegativeColor', 'emotionComplexColor',
  'sentenceLabels', 'sentenceLabelsLens', 'sentenceLabelsDensity',
  'labelKeyPointColor', 'labelCoreDetailColor',
  'labelConceptColor', 'labelReasoningColor', 'labelTakeawayColor',
  'labelClaimColor', 'labelEvidenceColor', 'labelCounterpointColor',
  'panelSize',
];
const PRESET_SETTING_KEY_SET = new Set(PRESET_SETTING_KEYS);

let settings = { ...DEFAULT_SETTINGS };
let settingsRevision = Date.now();
let effectsWarningDisabled = false;

const EFFECT_WARNING_THRESHOLD = 7;
const EFFECT_WARNING_KEYS = new Set([
  'boldBeginning',
  'gradientRows',
  'transitionAnimation',
  'emotionColor',
  'emotionMode',
  'sentenceLabels',
  'rulerActive',
  'autoScrollActive',
]);

function clampAutoScrollSpeed(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_SETTINGS.autoScrollSpeed;
  if (raw > 10) return Math.min(10, Math.max(1, Math.round(1 + ((raw - 15) * 9 / 165))));
  return Math.min(10, Math.max(1, Math.round(raw)));
}

function formatAutoScrollSpeed(value) {
  return 'Speed ' + String(value).padStart(2, '0');
}

function clampTypewriterSpeed(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_SETTINGS.typewriterSpeed;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

function formatTypewriterSpeed(value) {
  return 'Speed ' + String(value).padStart(2, '0');
}

function numericSetting(key, fallback) {
  const raw = settings[key];
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function applyPanelSize(size) {
  const nextSize = ['compact', 'comfortable', 'large'].includes(size) ? size : DEFAULT_SETTINGS.panelSize;
  document.body.dataset.panelSize = nextSize;
  document.querySelectorAll('.panel-size-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panelSize === nextSize);
  });
}

function savePanelSize(size) {
  const nextSize = ['compact', 'comfortable', 'large'].includes(size) ? size : DEFAULT_SETTINGS.panelSize;
  settings = { ...settings, panelSize: nextSize };
  applyPanelSize(nextSize);
  chrome.storage.sync.set({ draSettings: settings });
  clearActivePresetForSettings({ panelSize: nextSize });
}

function calculateActiveEffectScore(nextSettings = settings) {
  let score = 0;
  if (nextSettings.boldBeginning) score += 1;
  if (nextSettings.gradientRows) score += 2;
  if (nextSettings.transitionAnimation) score += 1;
  if (nextSettings.emotionColor) score += 3;
  if (nextSettings.sentenceLabels) score += 3;
  if (nextSettings.rulerActive) score += 2;
  if (nextSettings.autoScrollActive) score += 2;
  return score;
}

function shouldCheckEffectsWarning(changed) {
  return Object.entries(changed).some(([key, value]) => {
    if (!EFFECT_WARNING_KEYS.has(key)) return false;
    if (key.endsWith('Mode')) return value === 'ai';
    return value === true;
  });
}

function showEffectsWarning() {
  document.getElementById('effects-warning-modal')?.classList.remove('hidden');
}

function hideEffectsWarning() {
  document.getElementById('effects-warning-modal')?.classList.add('hidden');
}

function maybeShowEffectsWarning(changed) {
  if (!shouldCheckEffectsWarning(changed)) return;
  if (effectsWarningDisabled) return;
  if (calculateActiveEffectScore(settings) < EFFECT_WARNING_THRESHOLD) return;
  showEffectsWarning();
}

// ── Settings section collapse (feature-group titles in Settings tab) ────

let sectionCollapseState = {};

function initSectionCollapse() {
  const groups = [...document.querySelectorAll('#tab-settings .feature-group')];
  const collapsible = groups.map(group => {
    const expandBtn = group.querySelector(':scope > .feature-group-title > .feature-group-expand');
    const content   = [...group.children].filter(el => !el.classList.contains('feature-group-title'));
    const id        = `tab-settings:${expandBtn?.textContent?.trim().toLowerCase().replace(/\s+/g, '-') || ''}`;
    return { group, expandBtn, content, id };
  }).filter(s => s.content.length > 0 && s.expandBtn);

  chrome.storage.local.get('panelSectionCollapse', data => {
    sectionCollapseState = data.panelSectionCollapse || {};
    collapsible.forEach(({ group, expandBtn, content, id }) => {
      const applyCollapse = collapsed => {
        group.classList.toggle('collapsed', collapsed);
        content.forEach(el => el.classList.toggle('section-content-collapsed', collapsed));
      };
      const toggle = () => {
        const next = !sectionCollapseState[id];
        sectionCollapseState = { ...sectionCollapseState, [id]: next };
        chrome.storage.local.set({ panelSectionCollapse: sectionCollapseState });
        applyCollapse(next);
      };
      applyCollapse(Boolean(sectionCollapseState[id]));
      expandBtn.addEventListener('click', toggle);
    });
  });
}

// ── Feature-row expand/collapse (Effects tab) ──────────────────────────

function initFeatureRows() {
  document.querySelectorAll('#tab-effects .feature-row').forEach(row => {
    const detail    = row.querySelector(':scope > .feature-detail');
    const expandBtn = row.querySelector(':scope > .feature-row-head > .feature-row-expand');
    if (detail && expandBtn) {
      expandBtn.addEventListener('click', () => row.classList.toggle('expanded'));
    }
    // Keep disclosure state in sync with the feature toggle: turning a feature
    // on reveals its settings, while turning it off closes the detail panel.
    const toggle = row.querySelector(':scope > .feature-row-head input[type="checkbox"]');
    if (detail && toggle) {
      toggle.addEventListener('change', () => {
        row.classList.toggle('expanded', toggle.checked);
      });
    }
  });

  // Nested word-list blocks collapse independently, starting collapsed.
  document.querySelectorAll('.words-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.feature-detail-words')?.classList.toggle('expanded');
    });
  });
}

// ── AI status indicator ────────────────────────────────────────────────

function updateAIStatus(feature, status) {
  const el = document.getElementById(`${feature}-ai-status`);
  if (!el) return;

  const retryBtn = el.closest('.ai-status-row')?.querySelector('.ai-retry-btn');

  if (!status) {
    el.classList.add('hidden');
    el.removeAttribute('data-state');
    el.textContent = '';
    if (retryBtn) { retryBtn.disabled = false; retryBtn.textContent = 'Analyze'; }
    return;
  }
  el.classList.remove('hidden');
  el.setAttribute('data-state', status);
  el.textContent = status === 'loading' ? ''
                 : status === 'success' ? '✓'
                 : '✕';
  if (retryBtn) {
    retryBtn.disabled = (status === 'loading');
    if (status === 'error')   retryBtn.textContent = 'Retry';
    if (status === 'success') retryBtn.textContent = 'Analyze';
  }
}

// ── Lens legend switcher ───────────────────────────────────────────────

function switchLensLegend(purpose) {
  ['inform', 'understand', 'evaluate'].forEach(p => {
    document.getElementById(`legend-${p}`).style.display = p === purpose ? '' : 'none';
  });
}

// ── Send updated settings to background (which relays to content script) ─

function broadcast(changed) {
  settings = { ...settings, ...changed };
  settingsRevision += 1;
  chrome.storage.sync.set({ draSettings: settings });
  // Send a full snapshot so the content script cannot retain stale values when
  // a previous delta message was missed during navigation or service-worker sleep.
  chrome.runtime.sendMessage({
    type: 'SETTINGS_CHANGED',
    payload: { ...settings, settingsRevision },
  });
  clearActivePresetForSettings(changed);
  maybeShowEffectsWarning(changed);
}

// PDF files cannot be sent through extension messaging. Keep each selected file
// in the extension origin's IndexedDB until the dedicated reader has consumed it.
function savePdfSession(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('argus-pdf', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const id = crypto.randomUUID();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put({ file, title: file.name, createdAt: Date.now() }, id);
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function setPdfStatus(message, state = '') {
  const status = document.getElementById('pdf-import-status');
  status.textContent = message;
  status.dataset.state = state;
}

async function openPdfUrl() {
  const input = document.getElementById('pdf-url-input');
  let url;
  try { url = new URL(input.value.trim()); } catch { setPdfStatus('Enter a valid PDF URL.', 'error'); return; }
  if (!/^https?:$/.test(url.protocol)) { setPdfStatus('Only HTTP(S) PDF links are supported.', 'error'); return; }
  setPdfStatus('Requesting access to this website…');
  const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.host}/*`] });
  if (!granted) { setPdfStatus('Website access was not granted.', 'error'); return; }
  chrome.runtime.sendMessage({ type: 'OPEN_PDF_READER', sourceUrl: url.href, title: url.pathname.split('/').pop() || 'PDF document' });
  setPdfStatus('Opening PDF Reader…');
}

// ── Sync all UI controls to match current settings ─────────────────────

function syncUI() {
  applyPanelSize(settings.panelSize);
  const masterToggle = document.getElementById('toggle-master');
  if (masterToggle) masterToggle.checked = settings.masterEnabled;
  document.querySelector('.tab-content')?.classList.toggle('master-off', !settings.masterEnabled);
  document.getElementById('toggle-bold').checked      = settings.boldBeginning;
  document.getElementById('toggle-emotion').checked   = settings.emotionColor;
  document.getElementById('toggle-gradient').checked  = settings.gradientRows;
  document.getElementById('toggle-transition').checked = settings.transitionAnimation;
  document.getElementById('toggle-simplify').checked   = settings.sentenceSimplify;
  document.getElementById('toggle-ruler').checked     = settings.rulerActive;
  document.getElementById('toggle-auto-scroll').checked = settings.autoScrollActive;

  document.getElementById('font-family').value        = settings.fontFamily ?? '';
  const fontSize = numericSetting('fontSize', 18);
  const lineHeight = numericSetting('lineHeight', 1.8);
  const wordSpacing = numericSetting('wordSpacing', 0);
  const letterSpacing = numericSetting('letterSpacing', 0);
  document.getElementById('font-size-value').value = fontSize;
  document.getElementById('line-height-value').value = lineHeight.toFixed(1);
  document.getElementById('word-spacing-value').value = wordSpacing.toFixed(2);
  document.getElementById('letter-spacing-value').value = letterSpacing.toFixed(2);
  syncStepperBounds();

  document.getElementById('font-color').value         = settings.fontColor;
  document.getElementById('bg-color').value           = settings.bgColor;
  document.getElementById('row-shading-color').value  = settings.rowShadingColor;
  document.getElementById('row-shading-color').classList.toggle('active', settings.gradientRows);
  document.getElementById('emotion-positive-color').value = settings.emotionPositiveColor;
  document.getElementById('emotion-negative-color').value = settings.emotionNegativeColor;
  document.getElementById('emotion-complex-color').value = settings.emotionComplexColor;
  document.getElementById('label-key-point-color').value    = settings.labelKeyPointColor;
  document.getElementById('label-core-detail-color').value  = settings.labelCoreDetailColor;
  document.getElementById('label-concept-color').value      = settings.labelConceptColor;
  document.getElementById('label-reasoning-color').value    = settings.labelReasoningColor;
  document.getElementById('label-takeaway-color').value     = settings.labelTakeawayColor;
  document.getElementById('label-claim-color').value        = settings.labelClaimColor;
  document.getElementById('label-evidence-color').value     = settings.labelEvidenceColor;
  document.getElementById('label-counterpoint-color').value = settings.labelCounterpointColor;
  document.getElementById('label-lens-select').value = settings.sentenceLabelsLens ?? 'inform';
  document.getElementById('label-density-select').value = settings.sentenceLabelsDensity ?? 'medium';
  switchLensLegend(settings.sentenceLabelsLens ?? 'inform');
  document.getElementById('ruler-size-slider').value  = settings.rulerWindowLines;
  document.getElementById('ruler-size-value').textContent = settings.rulerWindowLines.toFixed(1) + ' lines';
  updateSliderFill(document.getElementById('ruler-size-slider'));
  const autoScrollSpeed = clampAutoScrollSpeed(settings.autoScrollSpeed);
  document.getElementById('auto-scroll-speed-slider').value = autoScrollSpeed;
  document.getElementById('auto-scroll-speed-value').textContent = formatAutoScrollSpeed(autoScrollSpeed);
  updateSliderFill(document.getElementById('auto-scroll-speed-slider'));

  document.getElementById('toggle-typewriter').checked = settings.typewriterActive;
  const typewriterSpeed = clampTypewriterSpeed(settings.typewriterSpeed);
  document.getElementById('typewriter-speed-slider').value = typewriterSpeed;
  document.getElementById('typewriter-speed-value').textContent = formatTypewriterSpeed(typewriterSpeed);
  updateSliderFill(document.getElementById('typewriter-speed-slider'));

  document.getElementById('toggle-labels').checked = settings.sentenceLabels;

  // Sync mode pills to stored settings (emotion + topicFocus; Lens is AI-only, no pill)
  [['emotion', settings.emotionMode], ['topicFocus', settings.topicFocusMode]].forEach(([feature, mode]) => {
    document.querySelectorAll(`[data-feature="${feature}"]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  });

  document.getElementById('emotion-ai-row').classList.toggle('hidden', !settings.emotionColor || settings.emotionMode !== 'ai');
  document.getElementById('emotion-word-lists').classList.toggle('hidden', settings.emotionMode !== 'local');
  // Lens is AI-only: status/retry row shows whenever Lens is on
  document.getElementById('labels-ai-row').classList.toggle('hidden', !settings.sentenceLabels);
}

// ── Wire up all controls ───────────────────────────────────────────────

function init() {
  initSectionCollapse();
  initFeatureRows();

  document.getElementById('effects-warning-keep')?.addEventListener('click', hideEffectsWarning);
  document.getElementById('effects-warning-disable')?.addEventListener('click', () => {
    effectsWarningDisabled = true;
    chrome.storage.local.set({ effectsWarningDisabled: true });
    hideEffectsWarning();
  });

  document.getElementById('pdf-file-input').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfStatus('Please choose a PDF file.', 'error');
      return;
    }
    try {
      setPdfStatus('Preparing PDF Reader…');
      const sessionId = await savePdfSession(file);
      chrome.runtime.sendMessage({ type: 'OPEN_PDF_READER', sessionId, title: file.name });
      setPdfStatus('Opening PDF Reader…');
    } catch {
      setPdfStatus('Could not prepare this PDF.', 'error');
    } finally {
      event.target.value = '';
    }
  });
  document.getElementById('pdf-url-open').addEventListener('click', openPdfUrl);
  document.getElementById('pdf-url-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') openPdfUrl();
  });

  document.querySelectorAll('.panel-size-btn').forEach(btn => {
    btn.addEventListener('click', () => savePanelSize(btn.dataset.panelSize));
  });

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

  // Master switch
  document.getElementById('toggle-master')?.addEventListener('change', e => {
    broadcast({ masterEnabled: e.target.checked });
    document.querySelector('.tab-content')?.classList.toggle('master-off', !e.target.checked);
  });

  // Reset to defaults
  document.getElementById('btn-reset-defaults')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    settingsRevision += 1;
    chrome.storage.sync.set({ draSettings: settings });
    chrome.runtime.sendMessage({
      type: 'SETTINGS_CHANGED',
      payload: { ...settings, settingsRevision },
    });
    clearActivePreset();
    syncUI();
  });

  document.getElementById('toggle-bold').addEventListener('change', e => {
    broadcast({ boldBeginning: e.target.checked });
  });

  document.getElementById('toggle-emotion').addEventListener('change', e => {
    broadcast({ emotionColor: e.target.checked });
    document.getElementById('emotion-colors').classList.toggle('active', e.target.checked);
    document.getElementById('emotion-ai-row').classList.toggle('hidden', !e.target.checked || settings.emotionMode !== 'ai');
  });

  document.getElementById('toggle-gradient').addEventListener('change', e => {
    document.getElementById('row-shading-color').classList.toggle('active', e.target.checked);
    broadcast({ gradientRows: e.target.checked });
  });

  document.getElementById('toggle-transition').addEventListener('change', e => {
    broadcast({ transitionAnimation: e.target.checked });
  });

  document.getElementById('toggle-simplify').addEventListener('change', e => {
    broadcast({ sentenceSimplify: e.target.checked });
  });

  document.getElementById('toggle-labels').addEventListener('change', e => {
    broadcast({ sentenceLabels: e.target.checked });
    document.getElementById('sentence-label-colors').classList.toggle('active', e.target.checked);
    document.getElementById('labels-ai-row').classList.toggle('hidden', !e.target.checked);
  });

  document.getElementById('toggle-ruler').addEventListener('change', e => {
    broadcast({ rulerActive: e.target.checked });
    document.getElementById('ruler-size-control').classList.toggle('active', e.target.checked);
  });

  document.getElementById('toggle-auto-scroll').addEventListener('change', e => {
    broadcast({ autoScrollActive: e.target.checked });
  });

  document.getElementById('ruler-size-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('ruler-size-value').textContent = v.toFixed(1) + ' lines';
    updateSliderFill(e.target);
    broadcast({ rulerWindowLines: v });
  });

  document.getElementById('toggle-typewriter').addEventListener('change', e => {
    broadcast({ typewriterActive: e.target.checked });
  });

  document.getElementById('typewriter-speed-slider').addEventListener('input', e => {
    const v = clampTypewriterSpeed(e.target.value);
    document.getElementById('typewriter-speed-value').textContent = formatTypewriterSpeed(v);
    updateSliderFill(e.target);
    broadcast({ typewriterSpeed: v });
  });

  document.getElementById('auto-scroll-speed-slider').addEventListener('input', e => {
    const v = clampAutoScrollSpeed(e.target.value);
    document.getElementById('auto-scroll-speed-value').textContent = formatAutoScrollSpeed(v);
    updateSliderFill(e.target);
    broadcast({ autoScrollSpeed: v });
  });

  // Typography controls — auto-enable parent if any control is adjusted while parent is off
  // Font family
  document.getElementById('font-family').addEventListener('change', e => {
    broadcast({ fontFamily: e.target.value });
  });

  // Font size — stepper
  document.getElementById('font-size-dec').addEventListener('click', () => {
    const current = numericSetting('fontSize', 18);
    if (current <= 14) return;
    const v = current - 1;
    document.getElementById('font-size-value').value = v;
    broadcast({ fontSize: v });
  });
  document.getElementById('font-size-inc').addEventListener('click', () => {
    const current = numericSetting('fontSize', 18);
    if (current >= 28) return;
    const v = current + 1;
    document.getElementById('font-size-value').value = v;
    broadcast({ fontSize: v });
  });

  // Line height — stepper
  document.getElementById('line-height-dec').addEventListener('click', () => {
    const current = numericSetting('lineHeight', 1.8);
    if (current <= 1.4) return;
    const v = Math.round((current - 0.1) * 10) / 10;
    document.getElementById('line-height-value').value = v.toFixed(1);
    broadcast({ lineHeight: v });
  });
  document.getElementById('line-height-inc').addEventListener('click', () => {
    const current = numericSetting('lineHeight', 1.8);
    if (current >= 2.4) return;
    const v = Math.round((current + 0.1) * 10) / 10;
    document.getElementById('line-height-value').value = v.toFixed(1);
    broadcast({ lineHeight: v });
  });

  // Word spacing — stepper
  document.getElementById('word-spacing-dec').addEventListener('click', () => {
    const current = numericSetting('wordSpacing', 0);
    if (current <= 0) return;
    const v = Math.max(0, Math.round((current - 0.05) * 100) / 100);
    document.getElementById('word-spacing-value').value = v.toFixed(2);
    broadcast({ wordSpacing: v });
  });
  document.getElementById('word-spacing-inc').addEventListener('click', () => {
    const current = numericSetting('wordSpacing', 0);
    if (current >= 0.5) return;
    const v = Math.min(0.5, Math.round((current + 0.05) * 100) / 100);
    document.getElementById('word-spacing-value').value = v.toFixed(2);
    broadcast({ wordSpacing: v });
  });

  // Letter spacing — stepper
  document.getElementById('letter-spacing-dec').addEventListener('click', () => {
    const current = numericSetting('letterSpacing', 0);
    if (current <= 0) return;
    const v = Math.max(0, Math.round((current - 0.01) * 1000) / 1000);
    document.getElementById('letter-spacing-value').value = v.toFixed(2);
    broadcast({ letterSpacing: v });
  });
  document.getElementById('letter-spacing-inc').addEventListener('click', () => {
    const current = numericSetting('letterSpacing', 0);
    if (current >= 0.1) return;
    const v = Math.min(0.1, Math.round((current + 0.01) * 1000) / 1000);
    document.getElementById('letter-spacing-value').value = v.toFixed(2);
    broadcast({ letterSpacing: v });
  });

  // Direct number input handlers — validate range, clamp, apply
  document.getElementById('font-size-value').addEventListener('change', e => {
    const v = Math.min(28, Math.max(14, Math.round(parseFloat(e.target.value) || 18)));
    e.target.value = v;
    broadcast({ fontSize: v });
    syncStepperBounds();
  });
  document.getElementById('line-height-value').addEventListener('change', e => {
    const raw = parseFloat(e.target.value);
    const v = Math.min(2.4, Math.max(1.4, Number.isFinite(raw) ? Math.round(raw * 10) / 10 : 1.8));
    e.target.value = v.toFixed(1);
    broadcast({ lineHeight: v });
    syncStepperBounds();
  });
  document.getElementById('word-spacing-value').addEventListener('change', e => {
    const raw = parseFloat(e.target.value);
    const v = Math.min(0.5, Math.max(0, Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0));
    e.target.value = v.toFixed(2);
    broadcast({ wordSpacing: v });
    syncStepperBounds();
  });
  document.getElementById('letter-spacing-value').addEventListener('change', e => {
    const raw = parseFloat(e.target.value);
    const v = Math.min(0.1, Math.max(0, Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : 0));
    e.target.value = v.toFixed(2);
    broadcast({ letterSpacing: v });
    syncStepperBounds();
  });

  // Sync stepper disabled state after every stepper click
  STEPPER_BOUNDS.forEach(({ dec, inc }) => {
    document.getElementById(dec).addEventListener('click', syncStepperBounds);
    document.getElementById(inc).addEventListener('click', syncStepperBounds);
  });

  // Colors
  document.getElementById('font-color').addEventListener('input', e => {
    broadcast({ fontColor: e.target.value });
  });
  document.getElementById('bg-color').addEventListener('input', e => {
    broadcast({ bgColor: e.target.value });
  });
  document.getElementById('row-shading-color').addEventListener('input', e => {
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
  document.getElementById('label-lens-select').addEventListener('change', e => {
    switchLensLegend(e.target.value);
    broadcast({ sentenceLabelsLens: e.target.value });
  });
  document.getElementById('label-density-select').addEventListener('change', e => {
    broadcast({ sentenceLabelsDensity: e.target.value });
  });

  const labelColorMap = {
    'label-key-point-color':    'labelKeyPointColor',
    'label-core-detail-color':  'labelCoreDetailColor',
    'label-concept-color':      'labelConceptColor',
    'label-reasoning-color':    'labelReasoningColor',
    'label-takeaway-color':     'labelTakeawayColor',
    'label-claim-color':        'labelClaimColor',
    'label-evidence-color':     'labelEvidenceColor',
    'label-counterpoint-color': 'labelCounterpointColor',
  };
  Object.entries(labelColorMap).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', e => {
      broadcast({ [key]: e.target.value });
    });
  });

  // Mode pills (AI / Local) for emotion + topicFocus (Lens is AI-only, no pill)
  const STATUS_FEATURE = { emotion: 'emotion', topicFocus: 'focus' };
  const AI_ROW_ID      = { emotion: 'emotion-ai-row' };
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const feature = btn.dataset.feature;
      const mode    = btn.dataset.mode;
      const modeKey = feature + 'Mode';
      btn.closest('.mode-pill').querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const rowId = AI_ROW_ID[feature];
      if (rowId) {
        const featureOn = feature === 'emotion' ? settings.emotionColor : settings.sentenceLabels;
        document.getElementById(rowId).classList.toggle('hidden', mode !== 'ai' || !featureOn);
      }
      if (feature === 'emotion') {
        document.getElementById('emotion-word-lists').classList.toggle('hidden', mode !== 'local');
      }
      if (mode === 'local') updateAIStatus(STATUS_FEATURE[feature], null);
      broadcast({ [modeKey]: mode });
    });
  });

  document.querySelectorAll('.ai-retry-btn[data-feature]').forEach(btn => {
    btn.addEventListener('click', () => {
      const feature = btn.dataset.feature;
      updateAIStatus(feature, 'loading');
      chrome.runtime.sendMessage({ type: 'AI_RETRY', feature });
    });
  });

  // Topic Focus
  document.getElementById('topic-apply').addEventListener('click', () => {
    const raw = document.getElementById('topic-input').value.trim();
    if (!raw) return;
    if (settings.topicFocusMode === 'ai') {
      updateAIStatus('focus', 'loading');
      chrome.runtime.sendMessage({ type: 'FOCUS_AI_REQUEST', topic: raw });
    } else {
      const keywords = raw.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      chrome.runtime.sendMessage({ type: 'FOCUS_APPLY', keywords });
    }
  });

  document.getElementById('topic-clear').addEventListener('click', () => {
    document.getElementById('topic-input').value = '';
    updateAIStatus('focus', null);
    chrome.runtime.sendMessage({ type: 'FOCUS_CLEAR' });
  });

  document.getElementById('toggle-immersive-reader').addEventListener('change', e => {
    clearActivePreset();
    chrome.runtime.sendMessage({
      type: e.target.checked ? 'OPEN_IMMERSIVE_READER' : 'CLOSE_IMMERSIVE_READER',
    });
  });

  // PDF import
  document.getElementById('pdf-file-input')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfStatus('Please choose a PDF file.', 'error');
      return;
    }
    try {
      setPdfStatus('Preparing PDF Reader…');
      const sessionId = await savePdfSession(file);
      chrome.runtime.sendMessage({ type: 'OPEN_PDF_READER', sessionId, title: file.name });
      setPdfStatus('Opening PDF Reader…');
    } catch {
      setPdfStatus('Could not prepare this PDF.', 'error');
    } finally {
      event.target.value = '';
    }
  });
  document.getElementById('pdf-url-open')?.addEventListener('click', openPdfUrl);
  document.getElementById('pdf-url-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') openPdfUrl();
  });

  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_READER_STATUS' });
}

// ── PDF import helpers ──────────────────────────────────────────────────

// A File object cannot ride through extension JSON messaging, so the picked PDF
// is stored briefly in extension IndexedDB and the Reader page retrieves it.
function savePdfSession(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('argus-pdf', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const id = crypto.randomUUID();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put({ file, title: file.name, createdAt: Date.now() }, id);
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function setPdfStatus(message, state = '') {
  const status = document.getElementById('pdf-import-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

async function openPdfUrl() {
  const input = document.getElementById('pdf-url-input');
  let url;
  try { url = new URL(input.value.trim()); }
  catch { setPdfStatus('Enter a valid PDF URL.', 'error'); return; }
  if (!/^https?:$/.test(url.protocol)) {
    setPdfStatus('Only HTTP(S) PDF links are supported.', 'error');
    return;
  }
  setPdfStatus('Requesting access to this website…');
  const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.host}/*`] });
  if (!granted) {
    setPdfStatus('Website access was not granted.', 'error');
    return;
  }
  chrome.runtime.sendMessage({
    type: 'OPEN_PDF_READER',
    sourceUrl: url.href,
    title: url.pathname.split('/').pop() || 'PDF document',
  });
  setPdfStatus('Opening PDF Reader…');
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PDF_READER_OPENED') {
    setPdfStatus('PDF Reader opened.', 'success');
    return;
  }
  if (msg.type === 'PDF_READER_OPEN_FAILED') {
    setPdfStatus('Could not open PDF Reader.', 'error');
    return;
  }
  if (msg.type !== 'IMMERSIVE_READER_STATUS') return;
  const toggle = document.getElementById('toggle-immersive-reader');
  if (toggle) toggle.checked = Boolean(msg.active);
  const inReader = Boolean(msg.active);
  if (localPresets.activeId) {
    const activePreset = localPresets.byId[localPresets.activeId];
    const presetWantsReader = Boolean(activePreset?.actions?.autoOpenReaderMode);
    if (presetWantsReader !== inReader) clearActivePreset();
  }
  document.getElementById('font-color').disabled = inReader;
  document.getElementById('bg-color').disabled   = inReader;
  document.getElementById('font-color').closest('.control-block').classList.toggle('disabled', inReader);
  document.getElementById('bg-color').closest('.control-block').classList.toggle('disabled', inReader);

  const twToggle = document.getElementById('toggle-typewriter');
  const twSlider = document.getElementById('typewriter-speed-slider');
  twToggle.disabled = !inReader;
  twSlider.disabled = !inReader;
  document.getElementById('typewriter-control').classList.toggle('disabled', !inReader);
  if (!inReader && twToggle.checked) {
    twToggle.checked = false;
    broadcast({ typewriterActive: false });
  }
});

// ── Word list editor ───────────────────────────────────────────────────

const DEFAULT_WORDS = {
  emotionPositive: [
    'joy','delight','elation','bliss','euphoria','jubilation','glee','cheerful','merry','ecstatic',
    'love','adore','cherish','embrace','compassion','empathy','kindness','warmth','tender','affection',
    'hope','optimism','inspiration','aspire','dream','vision','faith','belief','confidence','promise',
    'proud','admire','celebrate','triumph','honor','remarkable','extraordinary','magnificent','outstanding','brilliant',
    'thrive','flourish','breakthrough','achieve','progress','succeed','innovate','discover','heal','unite',
    'wonderful','amazing','incredible','fantastic','excellent','beautiful','glorious','grateful','courage','strength',
  ],
  emotionNegative: [
    'fear','dread','terror','horror','panic','fright','anxiety','nightmare','terrifying','horrific',
    'grief','sorrow','mourning','heartbreak','anguish','despair','desolate','tragic','tragedy','devastate',
    'anger','rage','fury','hatred','hate','wrath','outrage','indignation','resentment','hostility',
    'suffer','agony','torment','misery','pain','trauma','brutal','cruel','ruthless','savage',
    'violence','destroy','collapse','ruin','catastrophe','disaster','crisis','devastation','atrocity','massacre',
    'abuse','betray','corrupt','injustice','oppression','discrimination','poverty','inequality','exploitation','shame',
    'loss','failure','defeat','hopeless','helpless','powerless','victim','casualty','threat','danger',
  ],
  emotionComplex: [
    'bittersweet','ambivalent','conflicted','mixed','paradox','ironic','contradictory','ambiguous',
    'uncertain','uneasy','anxious','apprehensive','troubled','unsettled','precarious','fragile','vulnerable',
    'nostalgia','wistful','longing','melancholy','wistfulness','yearning','reminisce','haunted',
    'nuanced','complicated','dilemma','tension','controversial','fraught','delicate','sensitive','paradoxical',
    'resigned','cynical','skeptical','disillusioned','weary','exhausted','sacrifice','compromise',
    'disturbing','troubling','perplexing','unsettling','disconcerting','harrowing','sobering','chilling',
  ],
  transition: [
    'however','nevertheless','nonetheless','notwithstanding','conversely',
    'on the other hand','on the contrary','in contrast','by contrast',
    'that said','even so','be that as it may','then again','rather',
    'furthermore','moreover','additionally','likewise','in addition',
    'by the same token','in like manner','in the same way','in the same fashion',
    'coupled with','not to mention',
    'therefore','thus','hence','consequently','accordingly','henceforth',
    'as a result','for this reason','thereupon','in effect','owing to',
    'as a consequence','due to','inasmuch as',
    'although','albeit','whereas','regardless','despite','in spite of',
    'even though','even if','granted that',
    'in conclusion','in summary','in short','in brief','to summarize',
    'overall','all in all','on balance','on the whole','by and large',
    'in essence','to sum up','in the final analysis','given these points',
    'all things considered','in a word','for the most part',
    'in fact','indeed','notably','in other words','that is to say',
    'to put it differently','to put it another way','namely','specifically',
    'in particular','markedly','above all','most importantly',
    'for example','for instance','to illustrate','as an illustration',
    'meanwhile','subsequently','eventually','formerly','in the meantime',
    'sooner or later','in due time',
    'provided that','given that','in the event that','as long as',
    'on the condition that',
  ],
};

let wordLists = { ...DEFAULT_WORDS };

const WL_CONFIG = [
  { key: 'emotionPositive', chipsId: 'wl-emotion-positive', inputId: 'wl-add-positive', btnId: 'wl-add-positive-btn' },
  { key: 'emotionNegative', chipsId: 'wl-emotion-negative', inputId: 'wl-add-negative', btnId: 'wl-add-negative-btn' },
  { key: 'emotionComplex',  chipsId: 'wl-emotion-complex',  inputId: 'wl-add-complex',  btnId: 'wl-add-complex-btn'  },
  { key: 'transition',      chipsId: 'wl-transition',       inputId: 'wl-add-transition',btnId: 'wl-add-transition-btn' },
];

function renderChips(key, chipsId) {
  const container = document.getElementById(chipsId);
  if (!container) return;
  container.innerHTML = '';
  const words = wordLists[key];
  words.forEach(word => {
    const chip = document.createElement('span');
    chip.className = 'wl-chip';
    chip.textContent = word;
    const btn = document.createElement('button');
    btn.className = 'wl-remove';
    btn.textContent = '✕';
    btn.title = 'Remove';
    btn.addEventListener('click', () => removeWord(key, word));
    chip.appendChild(btn);
    container.appendChild(chip);
  });
}

function saveAndBroadcast() {
  chrome.storage.sync.set({ draWordLists: wordLists });
  chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists });
}

function removeWord(key, word) {
  wordLists = { ...wordLists, [key]: wordLists[key].filter(w => w !== word) };
  renderChips(key, WL_CONFIG.find(c => c.key === key).chipsId);
  saveAndBroadcast();
}

function addWord(key, word, chipsId) {
  const trimmed = word.trim().toLowerCase();
  if (!trimmed) return;
  const current = wordLists[key];
  if (current.includes(trimmed)) return;
  wordLists = { ...wordLists, [key]: [...current, trimmed] };
  renderChips(key, chipsId);
  saveAndBroadcast();
}

function resetWordListSection(keys) {
  keys.forEach(key => {
    wordLists = { ...wordLists, [key]: [...DEFAULT_WORDS[key]] };
    const config = WL_CONFIG.find(c => c.key === key);
    if (config) renderChips(key, config.chipsId);
  });
  saveAndBroadcast();
}

function initWordListEditor() {
  chrome.storage.sync.get('draWordLists', (data) => {
    wordLists = { ...DEFAULT_WORDS, ...data.draWordLists };

    WL_CONFIG.forEach(({ key, chipsId, inputId, btnId }) => {
      renderChips(key, chipsId);

      const input = document.getElementById(inputId);
      const btn   = document.getElementById(btnId);
      if (!input || !btn) return;

      btn.addEventListener('click', () => {
        addWord(key, input.value, chipsId);
        input.value = '';
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { addWord(key, input.value, chipsId); input.value = ''; }
      });
    });

    document.getElementById('wl-reset-emotion')?.addEventListener('click', () => {
      resetWordListSection(['emotionPositive', 'emotionNegative', 'emotionComplex']);
    });

    document.getElementById('wl-reset-transition')?.addEventListener('click', () => {
      resetWordListSection(['transition']);
    });
  });
}

// ── Preset management ──────────────────────────────────────────────────

let localPresets = { byId: {}, order: [], activeId: null };

function clearActivePreset() {
  if (!localPresets.activeId) return;
  localPresets = { ...localPresets, activeId: null };
  chrome.storage.sync.set({ draPresets: localPresets });
  renderPresetList();
}

function clearActivePresetForSettings(changed) {
  if (!Object.keys(changed).some(key => PRESET_SETTING_KEY_SET.has(key))) return;
  clearActivePreset();
}

function normalizePresetName(name) {
  return name.trim().toLowerCase();
}

function hasPresetName(name, exceptId = null) {
  const normalized = normalizePresetName(name);
  return Object.values(localPresets.byId).some(p =>
    p?.id !== exceptId && normalizePresetName(p?.name ?? '') === normalized
  );
}

function renderPresetList() {
  const list = document.getElementById('preset-list');
  if (!list) return;
  const { byId, order, activeId } = localPresets;
  if (!order.length) {
    list.innerHTML = '<div class="preset-list-empty">No presets yet.</div>';
    return;
  }
  list.innerHTML = order.map(id => {
    const p = byId[id];
    if (!p) return '';
    const isActive = id === activeId;
    return `<div class="preset-row ${isActive ? 'active' : ''}" data-preset-id="${id}">
      <button class="preset-active-toggle" type="button" aria-label="Apply preset" aria-pressed="${isActive ? 'true' : 'false'}" title="Apply preset"></button>
      <span class="preset-row-name" title="${p.name}">${p.name}</span>
      <button class="preset-row-btn modify-btn">Modify</button>
      <button class="preset-row-btn delete delete-btn">Delete</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.preset-row').forEach(row => {
    const id = row.dataset.presetId;
    const togglePreset = () => {
      if (id === localPresets.activeId) {
        clearActivePreset();
        return;
      }
      applyPreset(id);
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('.preset-row-btn')) return;
      togglePreset();
    });
    row.querySelector('.modify-btn').addEventListener('click', () => {
      const preset = localPresets.byId[id];
      chrome.runtime.sendMessage({ type: 'OPEN_PRESET_EDITOR', mode: 'modify', preset });
    });
    row.querySelector('.delete-btn').addEventListener('click', () => deletePreset(id));
  });
}

function applyPreset(id) {
  const preset = localPresets.byId[id];
  if (!preset) return;
  localPresets.activeId = id;
  chrome.storage.sync.set({ draPresets: localPresets });
  renderPresetList();
  const presetSettings = Object.fromEntries(
    PRESET_SETTING_KEYS.map(key => [key, preset.settings?.[key]]).filter(([, value]) => value !== undefined)
  );
  const runtimeReset = { typewriterActive: false, autoScrollActive: false };
  settings = { ...settings, ...presetSettings, ...runtimeReset };
  syncUI();
  chrome.storage.sync.set({ draSettings: settings });
  chrome.runtime.sendMessage({
    type: 'APPLY_PRESET',
    settings: { ...presetSettings, ...runtimeReset },
    actions: preset.actions ?? {},
  });
}

function deletePreset(id) {
  delete localPresets.byId[id];
  localPresets.order = localPresets.order.filter(o => o !== id);
  if (localPresets.activeId === id) localPresets.activeId = null;
  chrome.storage.sync.set({ draPresets: localPresets });
  renderPresetList();
}

function initPresetManager() {
  chrome.storage.sync.get('draPresets', d => {
    localPresets = d.draPresets ?? { byId: {}, order: [], activeId: null };
    renderPresetList();
  });

  const addBtn   = document.getElementById('preset-add-btn');
  const addMenu  = document.getElementById('preset-add-menu');
  const saveNow  = document.getElementById('preset-save-now');
  const createNew= document.getElementById('preset-create-new');
  const nameInput= document.getElementById('preset-save-now-name');
  const nameError= document.getElementById('preset-save-now-error');
  const confirm  = document.getElementById('preset-save-now-confirm');
  const cancel   = document.getElementById('preset-save-now-cancel');

  addBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    addMenu?.classList.toggle('hidden');
  });

  document.addEventListener('click', () => addMenu?.classList.add('hidden'));

  const showSaveNowInput = () => {
    nameInput?.classList.remove('hidden');
    confirm?.classList.remove('hidden');
    cancel?.classList.remove('hidden');
    nameError?.classList.add('hidden');
    nameInput?.classList.remove('error');
    nameInput?.focus();
  };
  const hideSaveNowInput = () => {
    nameInput?.classList.add('hidden');
    nameError?.classList.add('hidden');
    nameInput?.classList.remove('error');
    confirm?.classList.add('hidden');
    cancel?.classList.add('hidden');
    if (nameInput) nameInput.value = '';
  };

  saveNow?.addEventListener('click', () => {
    addMenu?.classList.add('hidden');
    showSaveNowInput();
  });

  cancel?.addEventListener('click', hideSaveNowInput);
  nameInput?.addEventListener('input', () => {
    nameInput.classList.remove('error');
    nameError?.classList.add('hidden');
  });

  confirm?.addEventListener('click', () => {
    const name = nameInput?.value.trim();
    if (!name) { nameInput?.focus(); return; }
    if (hasPresetName(name)) {
      nameInput?.classList.add('error');
      nameError?.classList.remove('hidden');
      nameInput?.focus();
      return;
    }
    const id = 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const preset = {
      id, name,
      settings: Object.fromEntries(
        PRESET_SETTING_KEYS.map(k => [k, settings[k]])
      ),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    localPresets.byId[id] = preset;
    localPresets.order.push(id);
    localPresets.activeId = id;
    chrome.storage.sync.set({ draPresets: localPresets });
    renderPresetList();
    hideSaveNowInput();
  });

  createNew?.addEventListener('click', () => {
    addMenu?.classList.add('hidden');
    chrome.runtime.sendMessage({
      type: 'OPEN_PRESET_EDITOR',
      mode: 'create',
      currentSettings: { ...settings },
    });
  });
}

// ── Runtime messages ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WORDLISTS_CHANGED') {
    wordLists = { ...DEFAULT_WORDS, ...msg.wordLists };
    WL_CONFIG.forEach(({ key, chipsId }) => renderChips(key, chipsId));
  }
  if (msg.type === 'AI_STATUS') {
    updateAIStatus(msg.feature, msg.status);
  }
  if (msg.type === 'PRESETS_CHANGED') {
    chrome.storage.sync.get(['draPresets', 'draSettings'], d => {
      localPresets = d.draPresets ?? { byId: {}, order: [], activeId: null };
      if (d.draSettings) { settings = { ...DEFAULT_SETTINGS, ...d.draSettings }; migrateLensSettings(settings); syncUI(); }
      renderPresetList();
    });
  }
  if (msg.type === 'ARGUS_AUTH_CHANGED') {
    updateAccountUI().then(() => {
      if (msg.syncError) setAccountSyncBadge('error', msg.syncError);
    });
  }
  if (msg.type === 'ARGUS_SYNC_STATUS') {
    setAccountSyncBadge(msg.status, msg.error);
  }
  if (msg.type === 'ARGUS_CLOUD_STATE_APPLIED') {
    chrome.storage.sync.get(['draSettings', 'draWordLists', 'draPresets'], d => {
      settings = { ...DEFAULT_SETTINGS, ...(d.draSettings || {}) };
      migrateLensSettings(settings);
      wordLists = { ...DEFAULT_WORDS, ...(d.draWordLists || {}) };
      localPresets = d.draPresets ?? { byId: {}, order: [], activeId: null };
      syncUI();
      WL_CONFIG.forEach(({ key, chipsId }) => renderChips(key, chipsId));
      renderPresetList();
      chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', payload: { ...settings, settingsRevision: Date.now() } });
      chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists: { ...wordLists } });
    });
  }
});

// ── Account & cloud sync ──────────────────────────────────────────────

function accountMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, response => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return reject(new Error(runtimeError.message));
      if (!response?.ok) return reject(new Error(response?.error || 'Account request failed.'));
      resolve(response);
    });
  });
}

function setAccountMessage(message = '', state = '') {
  const element = document.getElementById('account-message');
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

function setAccountBusy(busy) {
  document.querySelectorAll('#account-card button, #account-card input').forEach(element => {
    element.disabled = busy;
  });
}

function setAccountSyncBadge(status, error = '') {
  const badge = document.getElementById('account-sync-badge');
  if (!badge) return;
  const state = status === 'error' ? 'error' : status === 'pending' ? 'pending' : 'synced';
  badge.dataset.state = state;
  badge.textContent = state === 'error' ? 'Sync error' : state === 'pending' ? 'Syncing…' : 'Synced';
  if (error) setAccountMessage(error, 'error');
}

async function updateAccountUI() {
  const signedOut = document.getElementById('account-signed-out');
  const signedIn = document.getElementById('account-signed-in');
  try {
    const status = await accountMessage('AUTH_GET_STATUS');
    if (!status.configured) {
      signedOut?.classList.remove('hidden');
      signedIn?.classList.add('hidden');
      document.querySelectorAll('#account-card input, #account-card button').forEach(element => { element.disabled = true; });
      setAccountMessage('Account sync is not configured in config.js.', 'error');
      return;
    }
    signedOut?.classList.toggle('hidden', status.signedIn);
    signedIn?.classList.toggle('hidden', !status.signedIn);
    document.getElementById('account-waiting')?.classList.toggle('hidden', !status.waitingForMagicLink);
    if (!status.signedIn && status.waitingForMagicLink) {
      if (status.pendingEmail) document.getElementById('account-email').value = status.pendingEmail;
      setAccountMessage(`Login email sent to ${status.pendingEmail}.`, 'success');
    }
    if (status.signedIn) {
      document.getElementById('account-user-email').textContent = status.email;
      setAccountSyncBadge(status.syncError ? 'error' : status.pending ? 'pending' : 'synced', status.syncError);
      if (!status.syncError) setAccountMessage('Cloud is the source of truth while you are signed in.');
    }
  } catch (error) {
    setAccountMessage(error.message, 'error');
  }
}

function initAccountUI() {
  const email = document.getElementById('account-email');
  const waiting = document.getElementById('account-waiting');

  document.getElementById('account-send-link')?.addEventListener('click', async () => {
    setAccountBusy(true);
    setAccountMessage('Sending login email…');
    try {
      const result = await accountMessage('AUTH_REQUEST_MAGIC_LINK', { email: email.value });
      waiting?.classList.remove('hidden');
      setAccountMessage(`Login email sent to ${result.email}.`, 'success');
    } catch (error) {
      setAccountMessage(error.message, 'error');
    } finally {
      setAccountBusy(false);
    }
  });

  document.getElementById('account-sync-now')?.addEventListener('click', async () => {
    setAccountBusy(true);
    setAccountSyncBadge('pending');
    try {
      await accountMessage('AUTH_SYNC_NOW');
      setAccountSyncBadge('synced');
      setAccountMessage('Cloud state is up to date.', 'success');
    } catch (error) {
      setAccountSyncBadge('error', error.message);
    } finally {
      setAccountBusy(false);
    }
  });

  document.getElementById('account-sign-out')?.addEventListener('click', async () => {
    setAccountBusy(true);
    try {
      await accountMessage('AUTH_SIGN_OUT');
      waiting?.classList.add('hidden');
      await updateAccountUI();
      setAccountMessage('Signed out. This device keeps its last local copy.');
    } catch (error) {
      setAccountMessage(error.message, 'error');
    } finally {
      setAccountBusy(false);
    }
  });

  document.getElementById('account-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete this Argus account and all cloud settings? This cannot be undone.')) return;
    setAccountBusy(true);
    try {
      await accountMessage('AUTH_DELETE_ACCOUNT');
      location.reload();
    } catch (error) {
      setAccountMessage(error.message, 'error');
      setAccountBusy(false);
    }
  });

  updateAccountUI();
}

// ── Boot ───────────────────────────────────────────────────────────────

// Migrate old genre-based lens values to reading-purpose lens ids.
const OLD_LENS_TO_PURPOSE = { news: 'inform', stem: 'understand', humanities: 'understand', fiction: 'inform', immerse: 'inform' };
function migrateLensSettings(s) {
  if (OLD_LENS_TO_PURPOSE[s.sentenceLabelsLens]) s.sentenceLabelsLens = OLD_LENS_TO_PURPOSE[s.sentenceLabelsLens];
  if (!['inform', 'understand', 'evaluate'].includes(s.sentenceLabelsLens)) s.sentenceLabelsLens = 'inform';
  if (!['low', 'medium', 'high'].includes(s.sentenceLabelsDensity)) s.sentenceLabelsDensity = 'medium';
}

chrome.storage.sync.get('draSettings', (data) => {
  if (data.draSettings) settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
  migrateLensSettings(settings);
  syncUI();
  init();
  initWordListEditor();
  initPresetManager();
  initAccountUI();
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_READER_STATUS' });
});

chrome.storage.local.get(['activeTab', 'effectsWarningDisabled'], (data) => {
  effectsWarningDisabled = Boolean(data.effectsWarningDisabled);
  const tab = data.activeTab || 'effects';
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + tab)
  );
});
