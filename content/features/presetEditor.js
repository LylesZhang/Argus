import { DEFAULT_SETTINGS } from '../settings.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { refreshImmersiveReader, openImmersiveReader, startTypewriterFromBeginning } from './immersiveReader.js';
import { SAMPLE_ARTICLES } from './sampleArticles.js';
import { renderPreviewArticle, applyPreviewStyles } from './presetPreviewRender.js';

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

// ── Apply preset to current tab ────────────────────────────────────────

function applySettingsLocally(settings, actions) {
  state.settings = { ...state.settings, ...settings };
  chrome.storage.sync.set({ draSettings: state.settings });
  render();
  refreshImmersiveReader();
  if (actions?.autoOpenReaderMode) {
    openImmersiveReader();
    if (actions?.autoStartTypewriterFromBeginning) {
      startTypewriterFromBeginning();
    }
  }
}

// ── Draft state ────────────────────────────────────────────────────────

let draft = null;  // { settings: {...}, actions: {...}, name: '', mode, presetId? }

function initDraft(mode, { currentSettings, preset } = {}) {
  const baseSettings = mode === 'modify' ? { ...preset.settings }
    : { ...DEFAULT_SETTINGS, ...state.settings, ...(currentSettings ?? {}) };
  // Strip fields not in PRESET_SETTINGS_KEYS to keep draft clean
  const s = {};
  for (const k of PRESET_KEYS) s[k] = baseSettings[k] ?? DEFAULT_SETTINGS[k];

  draft = {
    mode,
    presetId: mode === 'modify' ? preset.id : null,
    name: mode === 'modify' ? preset.name : '',
    settings: s,
    actions: mode === 'modify'
      ? { ...preset.actions }
      : { autoOpenReaderMode: false, autoStartTypewriterFromBeginning: false },
  };
}

const PRESET_KEYS = [
  'typographyEnabled', 'fontFamily', 'boldBeginning', 'fontSize', 'lineHeight',
  'wordSpacing', 'letterSpacing', 'fontColor', 'bgColor',
  'typewriterSpeed',
  'readingAidsEnabled', 'gradientRows', 'rowShadingColor', 'transitionAnimation',
  'rulerActive', 'rulerWindowLines', 'autoScrollActive', 'autoScrollSpeed',
  'emotionColor', 'emotionMode', 'emotionPositiveColor', 'emotionNegativeColor', 'emotionComplexColor',
  'sentenceLabels', 'sentenceLabelsMode', 'sentenceLabelsLens',
  'labelCoreFactColor', 'labelContextColor', 'labelQuoteColor',
  'labelConceptColor', 'labelMechanismColor', 'labelConstraintColor',
  'labelThesisColor', 'labelEvidenceColor', 'labelExplanationColor',
  'labelDialogueColor', 'labelPlotTurnColor', 'labelSettingColor',
  'panelSize',
];

// ── Live preview ───────────────────────────────────────────────────────

function refreshPreview() {
  const root = document.getElementById(EDITOR_ID);
  if (!root || !draft) return;
  const lens = draft.settings.sentenceLabelsLens ?? 'news';
  const article = SAMPLE_ARTICLES[lens] ?? SAMPLE_ARTICLES.news;
  const previewBody = root.querySelector('.dra-pe-preview-body');
  if (!previewBody) return;
  previewBody.innerHTML = `<h3 class="dra-pe-preview-title">${escHTML(article.title)}</h3>
    <div class="dra-pe-article">${renderPreviewArticle(article, draft.settings, state.wordLists)}</div>`;
  applyPreviewStyles(previewBody, draft.settings);
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

function section(title, content) {
  return `<div class="dra-pe-section">
    <div class="dra-pe-section-title">${title}</div>
    <div class="dra-pe-section-body">${content}</div>
  </div>`;
}

// ── Main form HTML ─────────────────────────────────────────────────────

function buildFormHTML() {
  const s = draft.settings;
  const a = draft.actions;

  const typography = [
    toggle('pe-toggle-typography', 'typographyEnabled', 'Enable Typography'),
    selectInput('pe-font-family', 'fontFamily', 'Font Family', [
      ['','System Default'],['Georgia','Georgia'],['Arial','Arial'],
      ['Verdana','Verdana'],['OpenDyslexic, sans-serif','OpenDyslexic'],
    ]),
    toggle('pe-toggle-bold', 'boldBeginning', 'Bionic Effect'),
    slider('pe-font-size', 'fontSize', 'Font Size', 14, 28, 1, 'px'),
    slider('pe-line-height', 'lineHeight', 'Line Height', 1.4, 2.4, 0.1),
    slider('pe-word-spacing', 'wordSpacing', 'Word Space', 0, 0.5, 0.05, 'em'),
    slider('pe-letter-spacing', 'letterSpacing', 'Letter Space', 0, 0.1, 0.01, 'em'),
    colorInput('pe-font-color', 'fontColor', 'Text Color'),
    colorInput('pe-bg-color', 'bgColor', 'Background'),
  ].join('');

  const actionChecked = (k) => a[k] ? 'checked' : '';
  const readerMode = [
    `<label class="dra-pe-toggle-row">
      <input type="checkbox" id="pe-action-open-reader" ${actionChecked('autoOpenReaderMode')}>
      <span class="dra-pe-toggle-label">Auto-open Reader Mode when applied</span>
    </label>`,
    `<label class="dra-pe-toggle-row">
      <input type="checkbox" id="pe-action-typewriter" ${actionChecked('autoStartTypewriterFromBeginning')}>
      <span class="dra-pe-toggle-label">Start Typewriter from beginning</span>
    </label>`,
    slider('pe-typewriter-speed', 'typewriterSpeed', 'Typewriter Speed', 1, 10, 1),
  ].join('');

  const aids = [
    toggle('pe-toggle-reading-aids', 'readingAidsEnabled', 'Enable Reading Aids'),
    toggle('pe-toggle-gradient', 'gradientRows', 'Row Shading'),
    colorInput('pe-row-shading-color', 'rowShadingColor', 'Row Shading Color'),
    toggle('pe-toggle-transition', 'transitionAnimation', 'Transition Words'),
    toggle('pe-toggle-ruler', 'rulerActive', 'Reading Ruler'),
    slider('pe-ruler-size', 'rulerWindowLines', 'Ruler Width', 1, 10, 0.5, ' lines'),
    toggle('pe-toggle-auto-scroll', 'autoScrollActive', 'Auto Scroll'),
    slider('pe-auto-scroll-speed', 'autoScrollSpeed', 'Auto Scroll Speed', 1, 10, 1),
    // Emotion Colors
    `<div class="dra-pe-row dra-pe-ai-row">
      ${toggle('pe-toggle-emotion', 'emotionColor', 'Emotion Colors')}
      ${modePill('pe-emotion-mode-pill', 'emotion', 'emotionMode')}
    </div>`,
    colorInput('pe-emotion-positive', 'emotionPositiveColor', 'Positive Color'),
    colorInput('pe-emotion-negative', 'emotionNegativeColor', 'Negative Color'),
    colorInput('pe-emotion-complex',  'emotionComplexColor',  'Complex Color'),
    // Sentence Labels
    `<div class="dra-pe-row dra-pe-ai-row">
      ${toggle('pe-toggle-labels', 'sentenceLabels', 'Sentence Labels')}
      ${modePill('pe-labels-mode-pill', 'sentenceLabels', 'sentenceLabelsMode')}
    </div>`,
    selectInput('pe-label-lens', 'sentenceLabelsLens', 'Analysis Type', [
      ['news','News'],['stem','Academic – STEM'],
      ['humanities','Academic – Humanities'],['fiction','Fiction'],
    ]),
    // Label colors for active lens shown dynamically; show all for completeness
    `<div id="pe-label-colors" class="dra-pe-label-colors">
      ${colorInput('pe-lc-core-fact',   'labelCoreFactColor',   'Core Fact')}
      ${colorInput('pe-lc-context',     'labelContextColor',    'Context')}
      ${colorInput('pe-lc-quote',       'labelQuoteColor',      'Quote')}
      ${colorInput('pe-lc-concept',     'labelConceptColor',    'Concept')}
      ${colorInput('pe-lc-mechanism',   'labelMechanismColor',  'Mechanism')}
      ${colorInput('pe-lc-constraint',  'labelConstraintColor', 'Constraint')}
      ${colorInput('pe-lc-thesis',      'labelThesisColor',     'Thesis')}
      ${colorInput('pe-lc-evidence',    'labelEvidenceColor',   'Evidence')}
      ${colorInput('pe-lc-explanation', 'labelExplanationColor','Explanation')}
      ${colorInput('pe-lc-dialogue',    'labelDialogueColor',   'Dialogue')}
      ${colorInput('pe-lc-plot-turn',   'labelPlotTurnColor',   'Plot Turn')}
      ${colorInput('pe-lc-setting',     'labelSettingColor',    'Setting')}
    </div>`,
  ].join('');

  const panelSz = draft.settings.panelSize ?? 'comfortable';
  const panelDisplay = `<div class="dra-pe-row">
    <span class="dra-pe-label">Panel Size</span>
    <div class="panel-size-pill dra-pe-panel-size">
      ${['compact','comfortable','large'].map(sz =>
        `<button class="panel-size-btn${panelSz===sz?' active':''}" data-pe-panel-size="${sz}">${sz[0].toUpperCase()}</button>`
      ).join('')}
    </div>
  </div>`;

  return [
    section('Typography',    typography),
    section('Reader Mode',   readerMode),
    section('Reading Aids',  aids),
    section('Panel Display', panelDisplay),
  ].join('');
}

// ── Wire form events ───────────────────────────────────────────────────

function wireForm(root) {
  const container = root.querySelector('.dra-pe-form');

  const update = (key, val) => { draft.settings[key] = val; refreshPreview(); };
  const updateAction = (key, val) => { draft.actions[key] = val; };

  container.addEventListener('change', e => {
    const el = e.target;
    if (!el.id?.startsWith('pe-')) return;
    switch (el.id) {
      case 'pe-toggle-typography':   update('typographyEnabled', el.checked); break;
      case 'pe-toggle-bold':         update('boldBeginning',     el.checked); break;
      case 'pe-font-family':         update('fontFamily',        el.value);   break;
      case 'pe-toggle-reading-aids': update('readingAidsEnabled', el.checked); break;
      case 'pe-toggle-gradient':     update('gradientRows',      el.checked); break;
      case 'pe-toggle-transition':   update('transitionAnimation', el.checked); break;
      case 'pe-toggle-ruler':        update('rulerActive',       el.checked); break;
      case 'pe-toggle-auto-scroll':  update('autoScrollActive',  el.checked); break;
      case 'pe-toggle-emotion':      update('emotionColor',      el.checked); break;
      case 'pe-toggle-labels':       update('sentenceLabels',    el.checked); break;
      case 'pe-label-lens':          update('sentenceLabelsLens', el.value);  break;
      case 'pe-action-open-reader':  updateAction('autoOpenReaderMode', el.checked); break;
      case 'pe-action-typewriter':   updateAction('autoStartTypewriterFromBeginning', el.checked); break;
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
      'pe-lc-core-fact': 'labelCoreFactColor', 'pe-lc-context': 'labelContextColor',
      'pe-lc-quote': 'labelQuoteColor', 'pe-lc-concept': 'labelConceptColor',
      'pe-lc-mechanism': 'labelMechanismColor', 'pe-lc-constraint': 'labelConstraintColor',
      'pe-lc-thesis': 'labelThesisColor', 'pe-lc-evidence': 'labelEvidenceColor',
      'pe-lc-explanation': 'labelExplanationColor', 'pe-lc-dialogue': 'labelDialogueColor',
      'pe-lc-plot-turn': 'labelPlotTurnColor', 'pe-lc-setting': 'labelSettingColor',
    };
    if (numKeys[el.id]) {
      const v = parseFloat(el.value);
      update(numKeys[el.id], v);
      const display = root.querySelector(`#${el.id}-val`);
      if (display) display.textContent = el.value;
    } else if (colorKeys[el.id]) {
      update(colorKeys[el.id], el.value);
    }
  });

  // Mode pills
  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-pe-mode]');
    if (btn) {
      const feature = btn.dataset.peFeature;
      const mode    = btn.dataset.peMode;
      const keyMap  = { emotion: 'emotionMode', sentenceLabels: 'sentenceLabelsMode' };
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
  const name   = nameEl?.value.trim();
  if (!name) { nameEl?.classList.add('dra-pe-error'); nameEl?.focus(); return; }

  const presets = await loadPresets();

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

export function closePresetEditor() {
  document.getElementById(EDITOR_ID)?.remove();
  document.removeEventListener('keydown', onEditorKeydown);
  draft = null;
}

function onEditorKeydown(e) {
  if (e.key === 'Escape') closePresetEditor();
}

function buildEditorHTML(title) {
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
          <div class="dra-pe-preview-body"></div>
        </div>
      </div>
      <footer class="dra-pe-footer">
        <div class="dra-pe-name-group">
          <label class="dra-pe-name-label" for="dra-pe-name">Preset name</label>
          <input id="dra-pe-name" class="dra-pe-name-input" type="text" placeholder="My Preset" maxlength="60">
        </div>
        <div class="dra-pe-footer-btns">
          <button class="dra-pe-btn-cancel">Cancel</button>
          <button class="dra-pe-btn-save">Save</button>
        </div>
      </footer>
    </div>
  </div>`;
}

function mountEditor(root, title) {
  root.innerHTML = buildEditorHTML(title);
  root.querySelector('.dra-pe-form').innerHTML = buildFormHTML();
  wireForm(root);
  refreshPreview();

  root.querySelector('.dra-pe-close').addEventListener('click', closePresetEditor);
  root.querySelector('.dra-pe-btn-cancel').addEventListener('click', closePresetEditor);
  root.querySelector('.dra-pe-btn-save').addEventListener('click', () => handleSave(root));

  if (draft.name) root.querySelector('.dra-pe-name-input').value = draft.name;

  root.querySelector('.dra-pe-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePresetEditor();
  });
}

export function openPresetEditor({ mode, preset, currentSettings } = {}) {
  closePresetEditor();
  initDraft(mode, { currentSettings, preset });

  const root = document.createElement('div');
  root.id = EDITOR_ID;
  document.body.appendChild(root);
  document.addEventListener('keydown', onEditorKeydown);

  if (mode === 'onboarding') {
    root.innerHTML = `
      <div class="dra-pe-overlay">
        <div class="dra-pe-card dra-pe-card--onboarding">
          <div class="dra-pe-ob-logo">Argus</div>
          <h2 class="dra-pe-ob-title">Welcome to Argus</h2>
          <p class="dra-pe-ob-body">Would you like to set up your reading preferences now? You can create a custom preset that controls typography, highlights, and more.</p>
          <div class="dra-pe-ob-btns">
            <button class="dra-pe-btn-yes">Set Up Preferences</button>
            <button class="dra-pe-btn-no">Skip for Now</button>
          </div>
        </div>
      </div>`;

    root.querySelector('.dra-pe-btn-yes').addEventListener('click', () => {
      mountEditor(root, 'Create Your First Preset');
    });
    root.querySelector('.dra-pe-btn-no').addEventListener('click', () => {
      chrome.storage.sync.set({ draPresets: { byId: {}, order: [], activeId: null } });
      closePresetEditor();
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
