import { DEFAULT_SETTINGS } from '../settings.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { refreshImmersiveReader, openImmersiveReader, closeImmersiveReader } from './immersiveReader.js';
import { SAMPLE_ARTICLES } from './sampleArticles.js';
import { renderPreviewArticle, applyPreviewStyles, updateRulerPosition } from './presetPreviewRender.js';

const EDITOR_ID = 'dra-preset-editor';

// ── Preset storage helpers ─────────────────────────────────────────────

export function genPresetId() {
  return 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

async function loadPresets() {
  return new Promise(resolve => {
    chrome.storage.sync.get('draPresets', d => resolve(d.draPresets ?? { byId: {}, order: [], activeId: null }));
  });
}

async function savePresets(presets) {
  return new Promise(resolve => chrome.storage.sync.set({ draPresets: presets }, resolve));
}

function normalizePresetName(name) {
  return name.trim().toLowerCase();
}

function hasPresetName(presets, name, exceptId = null) {
  const normalized = normalizePresetName(name);
  return Object.values(presets.byId ?? {}).some(p =>
    p?.id !== exceptId && normalizePresetName(p?.name ?? '') === normalized
  );
}

// ── Apply preset to current tab ────────────────────────────────────────

function applySettingsLocally(settings, actions) {
  state.settings = { ...state.settings, ...settings };
  chrome.storage.sync.set({ draSettings: state.settings });
  render();
  refreshImmersiveReader();
  if (actions?.autoOpenReaderMode === true) openImmersiveReader();
  if (actions?.autoOpenReaderMode === false) closeImmersiveReader();
}

// ── Draft state ────────────────────────────────────────────────────────

let draft = null;  // { settings: {...}, actions: {...}, name: '', mode, presetId? }
let onboardingStep = null; // null | 'welcome' | 'preview'

function initDraft(mode, { currentSettings, preset } = {}) {
  const baseSettings = mode === 'modify' ? { ...preset.settings }
    : mode === 'onboarding' ? { ...DEFAULT_SETTINGS, ...ONBOARDING_PREVIEW_SETTINGS }
    : { ...DEFAULT_SETTINGS, ...state.settings, ...(currentSettings ?? {}) };
  // Strip fields not in PRESET_SETTINGS_KEYS to keep draft clean
  const s = {};
  for (const k of PRESET_KEYS) s[k] = baseSettings[k] ?? DEFAULT_SETTINGS[k];

  draft = {
    mode,
    presetId: mode === 'modify' ? preset.id : null,
    name: mode === 'modify' ? preset.name : mode === 'onboarding' ? 'My Reading Setup' : '',
    settings: s,
    actions: mode === 'modify'
      ? { autoOpenReaderMode: preset.actions?.autoOpenReaderMode ?? false }
      : { autoOpenReaderMode: false },
  };
}

const PRESET_KEYS = [
  'fontFamily', 'boldBeginning', 'fontSize', 'lineHeight',
  'wordSpacing', 'letterSpacing', 'fontColor', 'bgColor',
  'typewriterSpeed',
  'gradientRows', 'rowShadingColor', 'transitionAnimation',
  'rulerActive', 'rulerWindowLines', 'autoScrollSpeed',
  'emotionColor', 'emotionMode', 'emotionPositiveColor', 'emotionNegativeColor', 'emotionComplexColor',
  'sentenceLabels', 'sentenceLabelsLens', 'sentenceLabelsDensity',
  'labelKeyPointColor', 'labelCoreDetailColor',
  'labelConceptColor', 'labelReasoningColor', 'labelTakeawayColor',
  'labelClaimColor', 'labelEvidenceColor', 'labelCounterpointColor',
  'panelSize',
];

// A temporary, self-contained first-run experience. These values are only used
// by the onboarding draft and are not written to draSettings unless the user
// explicitly saves the draft as a preset.
const ONBOARDING_PREVIEW_SETTINGS = {
  fontFamily: '',
  boldBeginning: true,
  fontSize: 18,
  lineHeight: 1.8,
  wordSpacing: 0.05,
  letterSpacing: 0,
  fontColor: '#2c2c2c',
  bgColor: '#ffffff',
  gradientRows: true,
  rowShadingColor: '#d8d1e2',
  transitionAnimation: true,
  rulerActive: false,
  emotionColor: false,
  emotionMode: 'local',
  sentenceLabels: false,
  sentenceLabelsMode: 'local',
};

// ── Live preview ───────────────────────────────────────────────────────

function refreshPreview() {
  const root = document.getElementById(EDITOR_ID);
  if (!root || !draft) return;
  const s = draft.settings;
  const lens    = s.sentenceLabelsLens ?? 'inform';
  const article = SAMPLE_ARTICLES[lens] ?? SAMPLE_ARTICLES.inform;
  const previewBody = root.querySelector('.dra-pe-preview-body');
  if (!previewBody) return;
  const densityThreshold = ({ low: 85, medium: 75, high: 65 })[s.sentenceLabelsDensity] ?? 75;
  const previewLabels = article.aiSentenceLabels?.filter(label => label.importance >= densityThreshold) ?? null;

  // AI results come from pre-computed static data in sampleArticles.js — no live API calls.
  const html = renderPreviewArticle(article, s, state.wordLists, {
    externalEmotions: s.emotionMode === 'ai' ? (article.aiEmotionHighlights ?? null) : null,
    externalLabels:   s.sentenceLabels ? previewLabels : null,
  });

  previewBody.innerHTML = `
    <div class="dra-pe-preview-meta">Previewing: ${({inform:'Get Information',understand:'Understand',evaluate:'Evaluate'})[lens] ?? lens} sample</div>
    <h3 class="dra-pe-preview-title">${escHTML(article.title)}</h3>
    <div class="dra-pe-article" style="position:relative">${html}</div>`;

  applyPreviewStyles(previewBody, s, draft.actions);
  filterLabelColors(root, lens);

  // Position ruler: use last mouse position, fall back to center on first render
  if (s.rulerActive) {
    const fontPx  = Number(s.fontSize) || 15;
    const lineH   = Number(s.lineHeight) || 1.7;
    const halfWin = Math.round(fontPx * lineH * (s.rulerWindowLines ?? 1.5) / 2);
    const localY  = _lastRulerLocalY ?? previewBody.clientHeight / 2;
    updateRulerPosition(previewBody, localY, halfWin);
  }
}

function escHTML(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── HTML builder helpers ───────────────────────────────────────────────

function toggle(id, key, label) {
  const checked = draft.settings[key] ? 'checked' : '';
  return `<label class="dra-pe-toggle-row">
    <label class="toggle-switch"><input type="checkbox" id="${id}" ${checked}><span class="track"></span></label>
    <span class="dra-pe-toggle-label">${label}</span>
  </label>`;
}

function slider(id, key, label, min, max, step, unit = '') {
  const val = draft.settings[key] ?? DEFAULT_SETTINGS[key] ?? min;
  return `<div class="dra-pe-row">
    <span class="dra-pe-label">${label}</span>
    <div class="dra-pe-slider-group">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" class="slider">
      <span id="${id}-val" class="slider-value">${Number(val).toFixed(step < 1 ? (step < 0.05 ? 2 : 1) : 0)}${unit}</span>
    </div>
  </div>`;
}

function stepper(id, key, label, min, max, step, unit = '') {
  const raw = draft.settings[key] ?? DEFAULT_SETTINGS[key] ?? min;
  const val = Number(raw).toFixed(step < 1 ? (step < 0.05 ? 2 : 1) : 0);
  const unitSpan = unit ? `<span class="stepper-unit">${unit}</span>` : '';
  return `<div class="dra-pe-row">
    <span class="dra-pe-label">${label}</span>
    <div class="stepper">
      <button class="stepper-btn" data-pe-step="${id}" data-pe-dir="-1">-</button>
      <div class="stepper-center">
        <input type="number" id="${id}" class="stepper-num" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${label}">
        ${unitSpan}
      </div>
      <button class="stepper-btn" data-pe-step="${id}" data-pe-dir="1">+</button>
    </div>
  </div>`;
}

function colorInput(id, key, label) {
  const val = draft.settings[key] ?? DEFAULT_SETTINGS[key];
  return `<div class="dra-pe-row dra-pe-color-row">
    <span class="dra-pe-label">${label}</span>
    <input type="color" id="${id}" value="${val}" class="dra-pe-color">
  </div>`;
}

function selectInput(id, key, label, options) {
  const val = draft.settings[key] ?? DEFAULT_SETTINGS[key];
  const opts = options.map(([v,l]) => `<option value="${v}"${val===v?' selected':''}>${l}</option>`).join('');
  return `<div class="dra-pe-row">
    <span class="dra-pe-label">${label}</span>
    <select id="${id}" class="dra-pe-select">${opts}</select>
  </div>`;
}

function modePill(id, feature, key) {
  const cur = draft.settings[key] ?? 'local';
  return `<div class="mode-pill dra-pe-mode-pill" id="${id}">
    <button class="mode-btn${cur==='local'?' active':''}" data-pe-feature="${feature}" data-pe-mode="local">Local</button>
    <button class="mode-btn${cur==='ai'?' active':''}" data-pe-feature="${feature}" data-pe-mode="ai">AI</button>
  </div>`;
}

function group(title, content) {
  return `<div class="dra-pe-group">
    <div class="dra-pe-group-title">${title}</div>
    <div class="dra-pe-group-body">${content}</div>
  </div>`;
}

// ── Main form HTML ─────────────────────────────────────────────────────

function buildFormHTML() {
  const openReaderChecked = draft.actions?.autoOpenReaderMode ? 'checked' : '';

  const readability = [
    selectInput('pe-font-family', 'fontFamily', 'Font Family', [
      ['','System Default'],['Georgia','Georgia'],['Arial','Arial'],
      ['Verdana','Verdana'],['OpenDyslexic, sans-serif','OpenDyslexic'],
    ]),
    toggle('pe-toggle-bold', 'boldBeginning', 'Bionic Effect'),
    stepper('pe-font-size', 'fontSize', 'Font Size', 14, 28, 1, 'px'),
    stepper('pe-line-height', 'lineHeight', 'Line Height', 1.4, 2.4, 0.1),
    stepper('pe-word-spacing', 'wordSpacing', 'Word Space', 0, 0.5, 0.05, 'em'),
    stepper('pe-letter-spacing', 'letterSpacing', 'Letter Space', 0, 0.1, 0.01, 'em'),
    colorInput('pe-font-color', 'fontColor', 'Text Color'),
    colorInput('pe-bg-color', 'bgColor', 'Background'),
    toggle('pe-toggle-gradient', 'gradientRows', 'Row Shading'),
    colorInput('pe-row-shading-color', 'rowShadingColor', 'Row Shading Color'),
  ].join('');

  const focusNav = [
    `<label class="dra-pe-toggle-row">
      <label class="toggle-switch"><input type="checkbox" id="pe-action-open-reader" ${openReaderChecked}><span class="track"></span></label>
      <span class="dra-pe-toggle-label">Auto-open Reader Mode when applied</span>
    </label>`,
    slider('pe-typewriter-speed', 'typewriterSpeed', 'Typewriter Speed', 1, 10, 1),
    toggle('pe-toggle-ruler', 'rulerActive', 'Reading Ruler'),
    slider('pe-ruler-size', 'rulerWindowLines', 'Ruler Width', 1, 10, 0.5, ' lines'),
    slider('pe-auto-scroll-speed', 'autoScrollSpeed', 'Auto Scroll Speed', 1, 10, 1),
  ].join('');

  const comprehension = [
    // Emotion Colors
    `<div class="dra-pe-row dra-pe-ai-row">
      ${toggle('pe-toggle-emotion', 'emotionColor', 'Emotion Colors')}
      ${modePill('pe-emotion-mode-pill', 'emotion', 'emotionMode')}
    </div>`,
    colorInput('pe-emotion-positive', 'emotionPositiveColor', 'Positive Color'),
    colorInput('pe-emotion-negative', 'emotionNegativeColor', 'Negative Color'),
    colorInput('pe-emotion-complex',  'emotionComplexColor',  'Complex Color'),
    // Lens (AI-only, no mode pill)
    `<div class="dra-pe-row">
      ${toggle('pe-toggle-labels', 'sentenceLabels', 'Lens')}
    </div>`,
    selectInput('pe-label-lens', 'sentenceLabelsLens', 'Reading Purpose (sets preview article)', [
      ['inform','Get Information'],['understand','Understand'],
      ['evaluate','Evaluate'],
    ]),
    selectInput('pe-label-density', 'sentenceLabelsDensity', 'Highlight Density', [
      ['low','Low'],['medium','Medium'],['high','High'],
    ]),
    // Label colors grouped by purpose; only the active purpose group is shown
    `<div id="pe-label-colors" class="dra-pe-label-colors">
      <div data-pe-lens="inform">
        ${colorInput('pe-lc-key-point',   'labelKeyPointColor',   'Key Point')}
        ${colorInput('pe-lc-core-detail', 'labelCoreDetailColor', 'Core Detail')}
      </div>
      <div data-pe-lens="understand">
        ${colorInput('pe-lc-concept',   'labelConceptColor',   'Concept')}
        ${colorInput('pe-lc-reasoning', 'labelReasoningColor', 'Reasoning')}
        ${colorInput('pe-lc-takeaway',  'labelTakeawayColor',  'Takeaway')}
      </div>
      <div data-pe-lens="evaluate">
        ${colorInput('pe-lc-claim',        'labelClaimColor',        'Claim')}
        ${colorInput('pe-lc-evidence',     'labelEvidenceColor',     'Evidence')}
        ${colorInput('pe-lc-counterpoint', 'labelCounterpointColor', 'Counterpoint')}
      </div>
    </div>`,
    toggle('pe-toggle-transition', 'transitionAnimation', 'Transition Words'),
  ].join('');

  const panelSz = draft.settings.panelSize ?? 'comfortable';
  const display = `<div class="dra-pe-row">
    <span class="dra-pe-label">Panel Size</span>
    <div class="panel-size-pill dra-pe-panel-size">
      ${['compact','comfortable','large'].map(sz =>
        `<button class="panel-size-btn${panelSz===sz?' active':''}" data-pe-panel-size="${sz}">${({compact:'S',comfortable:'M',large:'L'})[sz]}</button>`
      ).join('')}
    </div>
  </div>`;

  return [
    group('Readability',        readability),
    group('Focus &amp; Navigation', focusNav),
    group('Comprehension',      comprehension),
    group('Display',            display),
  ].join('');
}

// ── Wire form events ───────────────────────────────────────────────────

function filterLabelColors(root, lens) {
  root.querySelectorAll('[data-pe-lens]').forEach(el => {
    el.style.display = el.dataset.peLens === lens ? '' : 'none';
  });
}

function syncColorInputsDisabled(root, disabled) {
  ['#pe-font-color', '#pe-bg-color'].forEach(sel => {
    const el = root.querySelector(sel);
    if (!el) return;
    el.disabled = disabled;
    el.closest('.dra-pe-color-row')?.classList.toggle('pe-disabled', disabled);
  });
}

function updateSliderFill(el) {
  const pct = (el.value - el.min) / (el.max - el.min) * 100;
  el.style.setProperty('--pct', pct + '%');
}

function wireForm(root) {
  const container = root.querySelector('.dra-pe-form');

  // Set initial --pct on all sliders so the filled track renders correctly
  container.querySelectorAll('input[type="range"].slider').forEach(updateSliderFill);

  const update = (key, val) => {
    draft.settings[key] = val;
    refreshPreview();
  };

  container.addEventListener('change', e => {
    const el = e.target;
    if (!el.id?.startsWith('pe-')) return;
    switch (el.id) {
      case 'pe-toggle-bold':         update('boldBeginning',     el.checked); break;
      case 'pe-font-family':         update('fontFamily',        el.value);   break;
      case 'pe-toggle-gradient':     update('gradientRows',      el.checked); break;
      case 'pe-toggle-transition':   update('transitionAnimation', el.checked); break;
      case 'pe-toggle-ruler':        update('rulerActive',       el.checked); break;
      case 'pe-toggle-emotion':      update('emotionColor',      el.checked); break;
      case 'pe-toggle-labels':       update('sentenceLabels',    el.checked); break;
      case 'pe-label-lens':          update('sentenceLabelsLens', el.value);  break;
      case 'pe-label-density':       update('sentenceLabelsDensity', el.value); break;
      case 'pe-action-open-reader':
        if (!draft.actions) draft.actions = {};
        draft.actions.autoOpenReaderMode = el.checked;
        syncColorInputsDisabled(root, el.checked);
        refreshPreview();
        break;
    }
  });

  container.addEventListener('input', e => {
    const el = e.target;
    if (!el.id?.startsWith('pe-')) return;
    const numKeys = {
      'pe-font-size': 'fontSize', 'pe-line-height': 'lineHeight',
      'pe-word-spacing': 'wordSpacing', 'pe-letter-spacing': 'letterSpacing',
      'pe-ruler-size': 'rulerWindowLines', 'pe-auto-scroll-speed': 'autoScrollSpeed',
      'pe-typewriter-speed': 'typewriterSpeed',
    };
    const colorKeys = {
      'pe-font-color': 'fontColor', 'pe-bg-color': 'bgColor',
      'pe-row-shading-color': 'rowShadingColor',
      'pe-emotion-positive': 'emotionPositiveColor',
      'pe-emotion-negative': 'emotionNegativeColor',
      'pe-emotion-complex':  'emotionComplexColor',
      'pe-lc-key-point': 'labelKeyPointColor', 'pe-lc-core-detail': 'labelCoreDetailColor',
      'pe-lc-concept': 'labelConceptColor', 'pe-lc-reasoning': 'labelReasoningColor',
      'pe-lc-takeaway': 'labelTakeawayColor', 'pe-lc-claim': 'labelClaimColor',
      'pe-lc-evidence': 'labelEvidenceColor', 'pe-lc-counterpoint': 'labelCounterpointColor',
    };
    if (numKeys[el.id]) {
      const v = parseFloat(el.value);
      if (!Number.isFinite(v)) return;   // number input can be transiently empty while typing
      update(numKeys[el.id], v);
      const display = root.querySelector(`#${el.id}-val`);
      if (display) display.textContent = el.value;
      if (el.type === 'range') updateSliderFill(el);
    } else if (colorKeys[el.id]) {
      update(colorKeys[el.id], el.value);
    }
  });

  // Stepper +/- buttons (typography numerics)
  const STEP_KEY = {
    'pe-font-size': 'fontSize', 'pe-line-height': 'lineHeight',
    'pe-word-spacing': 'wordSpacing', 'pe-letter-spacing': 'letterSpacing',
  };

  // Mode pills
  container.addEventListener('click', e => {
    const stepBtn = e.target.closest('[data-pe-step]');
    if (stepBtn) {
      const input = root.querySelector('#' + stepBtn.dataset.peStep);
      if (input) {
        const step = Number(input.step), min = Number(input.min), max = Number(input.max);
        let v = Number(input.value) + Number(stepBtn.dataset.peDir) * step;
        v = Math.min(max, Math.max(min, Math.round(v / step) * step));
        input.value = step < 1 ? v.toFixed(step < 0.05 ? 2 : 1) : String(v);
        update(STEP_KEY[stepBtn.dataset.peStep], Number(input.value));
      }
      return;
    }

    const btn = e.target.closest('[data-pe-mode]');
    if (btn) {
      const feature = btn.dataset.peFeature;
      const mode    = btn.dataset.peMode;
      const keyMap  = { emotion: 'emotionMode' };
      const key     = keyMap[feature];
      if (key) {
        update(key, mode);
        btn.closest('.dra-pe-mode-pill').querySelectorAll('.mode-btn')
          .forEach(b => b.classList.toggle('active', b.dataset.peMode === mode));
      }
    }
    // Panel size buttons
    const szBtn = e.target.closest('[data-pe-panel-size]');
    if (szBtn) {
      const sz = szBtn.dataset.pePanelSize;
      update('panelSize', sz);
      szBtn.closest('.dra-pe-panel-size').querySelectorAll('.panel-size-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.pePanelSize === sz));
    }
  });
}

// ── Save logic ─────────────────────────────────────────────────────────

async function handleSave(root) {
  const nameEl = root.querySelector('.dra-pe-name-input');
  const errorEl = root.querySelector('.dra-pe-name-error');
  const name   = nameEl?.value.trim();
  nameEl?.classList.remove('dra-pe-error');
  errorEl?.classList.add('hidden');
  if (!name) { nameEl?.classList.add('dra-pe-error'); nameEl?.focus(); return; }

  const presets = await loadPresets();
  const currentId = draft.mode === 'modify' ? draft.presetId : null;
  if (hasPresetName(presets, name, currentId)) {
    nameEl?.classList.add('dra-pe-error');
    errorEl?.classList.remove('hidden');
    nameEl?.focus();
    return;
  }

  let id;
  if (draft.mode === 'modify' && draft.presetId) {
    id = draft.presetId;
    presets.byId[id] = { ...presets.byId[id], name, settings: draft.settings, actions: draft.actions, updatedAt: Date.now() };
  } else {
    id = genPresetId();
    presets.byId[id] = { id, name, settings: draft.settings, actions: draft.actions, createdAt: Date.now(), updatedAt: Date.now() };
    presets.order.push(id);
  }

  const wasActive = presets.activeId === id;
  const shouldApply = draft.mode !== 'modify' || wasActive;

  if (shouldApply) {
    presets.activeId = id;
  }

  await savePresets(presets);

  if (shouldApply) {
    applySettingsLocally(draft.settings, draft.actions);
  }

  chrome.runtime.sendMessage({ type: 'PRESETS_CHANGED' }).catch(() => {});
  closePresetEditor();
}

// ── Open / Close ───────────────────────────────────────────────────────

let _rulerTrackingCleanup = null;
let _lastRulerLocalY = null;

function setupRulerTracking(root) {
  if (_rulerTrackingCleanup) { _rulerTrackingCleanup(); _rulerTrackingCleanup = null; }
  const body = root.querySelector('.dra-pe-preview-body');
  if (!body) return;
  const isRulerActive = () => Boolean(draft?.settings?.rulerActive);
  const syncTransform = () => {
    if (!isRulerActive()) return;
    const wrap = body.querySelector('.dra-pe-ruler-wrap');
    if (wrap) wrap.style.transform = `translateY(${body.scrollTop}px)`;
  };
  const onMouseMove = (e) => {
    if (!isRulerActive()) return;
    const s       = draft.settings;
    const rect    = body.getBoundingClientRect();
    const localY  = e.clientY - rect.top;
    _lastRulerLocalY = localY;   // remember for refreshPreview
    const fontPx  = Number(s.fontSize) || 15;
    const lineH   = Number(s.lineHeight) || 1.7;
    const halfWin = Math.round(fontPx * lineH * (s.rulerWindowLines ?? 1.5) / 2);
    updateRulerPosition(body, localY, halfWin);
  };
  body.addEventListener('mousemove', onMouseMove);
  body.addEventListener('scroll',    syncTransform);
  _rulerTrackingCleanup = () => {
    body.removeEventListener('mousemove', onMouseMove);
    body.removeEventListener('scroll',    syncTransform);
  };
}

export function closePresetEditor() {
  if (_rulerTrackingCleanup) { _rulerTrackingCleanup(); _rulerTrackingCleanup = null; }
  document.getElementById(EDITOR_ID)?.remove();
  document.documentElement.classList.remove('dra-preset-editor-open');
  document.removeEventListener('keydown', onEditorKeydown);
  _lastRulerLocalY = null;
  draft = null;
  onboardingStep = null;
}

function onEditorKeydown(e) {
  if (e.key === 'Escape') cancelEditor();
}

function completeOnboardingWithoutSaving() {
  chrome.storage.sync.set({ draPresets: { byId: {}, order: [], activeId: null } });
}

function cancelEditor() {
  if (draft?.mode === 'onboarding' && onboardingStep === 'preview') {
    completeOnboardingWithoutSaving();
  }
  closePresetEditor();
}

function buildEditorHTML(title, { onboarding = false } = {}) {
  const previewNotice = onboarding
    ? `<div class="dra-pe-preview-notice">This is a preview. Your current page will only change after you save this preset.</div>`
    : '';
  return `
  <div class="dra-pe-overlay">
    <div class="dra-pe-card">
      <header class="dra-pe-header">
        <span class="dra-pe-header-title">${title}</span>
        <button class="dra-pe-close" aria-label="Close">×</button>
      </header>
      <div class="dra-pe-body">
        <div class="dra-pe-form dra-pe-left"></div>
        <div class="dra-pe-right">
          <div class="dra-pe-preview-label">Live Preview</div>
          ${previewNotice}
          <div class="dra-pe-preview-body"></div>
        </div>
      </div>
      <footer class="dra-pe-footer">
        <div class="dra-pe-name-group">
          <label class="dra-pe-name-label" for="dra-pe-name">Preset name</label>
          <input id="dra-pe-name" class="dra-pe-name-input" type="text" placeholder="My Preset" maxlength="60">
          <span class="dra-pe-name-error hidden">Preset name already exists</span>
        </div>
        <div class="dra-pe-footer-btns">
          <button class="dra-pe-btn-cancel">${onboarding ? 'Skip for Now' : 'Cancel'}</button>
          <button class="dra-pe-btn-save">Save</button>
        </div>
      </footer>
    </div>
  </div>`;
}

function mountEditor(root, title) {
  const isOnboarding = draft.mode === 'onboarding';
  root.innerHTML = buildEditorHTML(title, { onboarding: isOnboarding });
  root.querySelector('.dra-pe-form').innerHTML = buildFormHTML();
  wireForm(root);
  // Sub-items are always visible now (no parent toggles)
  syncColorInputsDisabled(root, draft.actions?.autoOpenReaderMode ?? false);
  refreshPreview();
  setupRulerTracking(root);

  root.querySelector('.dra-pe-close').addEventListener('click', cancelEditor);
  root.querySelector('.dra-pe-btn-cancel').addEventListener('click', cancelEditor);
  root.querySelector('.dra-pe-btn-save').addEventListener('click', () => handleSave(root));
  root.querySelector('.dra-pe-name-input').addEventListener('input', e => {
    e.currentTarget.classList.remove('dra-pe-error');
    root.querySelector('.dra-pe-name-error')?.classList.add('hidden');
  });

  if (draft.name) root.querySelector('.dra-pe-name-input').value = draft.name;

  root.querySelector('.dra-pe-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cancelEditor();
  });
}

export function openPresetEditor({ mode, preset, currentSettings } = {}) {
  closePresetEditor();
  initDraft(mode, { currentSettings, preset });

  const root = document.createElement('div');
  root.id = EDITOR_ID;
  document.body.appendChild(root);
  document.documentElement.classList.add('dra-preset-editor-open');
  document.addEventListener('keydown', onEditorKeydown);

  if (mode === 'onboarding') {
    onboardingStep = 'welcome';
    root.innerHTML = `
      <div class="dra-pe-overlay">
        <div class="dra-pe-card dra-pe-card--onboarding">
          <div class="dra-pe-ob-logo">Argus</div>
          <h2 class="dra-pe-ob-title">Welcome to Argus</h2>
          <p class="dra-pe-ob-body">Set up your reading preferences with a live preview. Nothing will change on the current page until you save your first preset.</p>
          <div class="dra-pe-ob-btns">
            <button class="dra-pe-btn-yes">Set Up Preferences</button>
          </div>
        </div>
      </div>`;

    root.querySelector('.dra-pe-btn-yes').addEventListener('click', () => {
      onboardingStep = 'preview';
      mountEditor(root, 'Create Your First Preset');
    });
    root.querySelector('.dra-pe-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) closePresetEditor();
    });
    return;
  }

  const titles = { create: 'Create New Preset', modify: 'Edit Preset' };
  mountEditor(root, titles[mode] ?? 'Edit Preset');
}

// ── First-run onboarding trigger ───────────────────────────────────────
// Shows onboarding if draPresets has never been written (new install).
// Once user saves a preset OR clicks Skip, draPresets gets initialized,
// so the popup won't appear again automatically.

export function maybeShowOnboarding() {
  chrome.storage.sync.get('draPresets', d => {
    if (!d.draPresets) {
      openPresetEditor({ mode: 'onboarding' });
    }
  });
}
