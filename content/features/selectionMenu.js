import { state } from '../state.js';
import {
  DEFAULT_EMOTION_POSITIVE,
  DEFAULT_EMOTION_NEGATIVE,
  DEFAULT_EMOTION_COMPLEX,
} from './emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './transitions.js';

const MENU_ID = 'dra-word-menu';
let listening = false;
let _render = null;

const KEY_MAP = {
  positive:   'emotionPositive',
  negative:   'emotionNegative',
  complex:    'emotionComplex',
  transition: 'transition',
};

const DEFAULT_MAP = {
  emotionPositive: DEFAULT_EMOTION_POSITIVE,
  emotionNegative: DEFAULT_EMOTION_NEGATIVE,
  emotionComplex:  DEFAULT_EMOTION_COMPLEX,
  transition:      DEFAULT_TRANSITION_WORDS,
};

function getCurrentList(key) {
  return state.wordLists[key] ?? DEFAULT_MAP[key];
}

function getMenu() {
  return document.getElementById(MENU_ID);
}

function hideMenu() {
  const menu = getMenu();
  if (menu) menu.remove();
}

function showMenu(word, rect) {
  hideMenu();

  const menu = document.createElement('div');
  menu.id = MENU_ID;

  const label = document.createElement('span');
  label.id = 'dra-word-menu-text';
  label.textContent = `"${word}"`;
  menu.appendChild(label);

  const actions = document.createElement('div');
  actions.id = 'dra-word-menu-actions';

  const buttons = [
    { id: 'positive',   label: 'Positive' },
    { id: 'negative',   label: 'Negative' },
    { id: 'complex',    label: 'Complex'  },
    { id: 'transition', label: 'Transition' },
  ];

  buttons.forEach(({ id, label: btnLabel }) => {
    const key     = KEY_MAP[id];
    const inList  = getCurrentList(key).includes(word);
    const btn     = document.createElement('button');
    btn.textContent = (inList ? '✓ ' : '＋ ') + btnLabel;
    if (inList) btn.classList.add('active');
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleWord(word, key, inList);
      hideMenu();
    });
    actions.appendChild(btn);
  });

  menu.appendChild(actions);
  document.body.appendChild(menu);

  // Position above the selection
  const menuH = menu.offsetHeight || 44;
  let top  = rect.top  + window.scrollY - menuH - 8;
  let left = rect.left + window.scrollX;
  // Clamp to viewport
  if (left + menu.offsetWidth > window.innerWidth - 8) {
    left = window.innerWidth - menu.offsetWidth - 8;
  }
  if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8;
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';
}

function toggleWord(word, key, currentlyInList) {
  const current = getCurrentList(key);
  const updated = currentlyInList
    ? current.filter(w => w !== word)
    : [...new Set([...current, word])];
  state.wordLists = { ...state.wordLists, [key]: updated };
  chrome.storage.sync.set({ draWordLists: state.wordLists });
  chrome.runtime.sendMessage({ type: 'WORDLISTS_CHANGED', wordLists: state.wordLists });
  if (_render) _render();
}

function onMouseUp() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { hideMenu(); return; }

  const word = sel.toString().trim().toLowerCase();
  if (!word || word.length > 60 || /\s{2,}/.test(word)) { hideMenu(); return; }

  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  showMenu(word, rect);
}

function onSelectionChange() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) hideMenu();
}

export function setupSelectionMenu(renderFn) {
  _render = renderFn;
  if (listening) return;
  listening = true;
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('selectionchange', onSelectionChange);
}

export function teardownSelectionMenu() {
  if (!listening) return;
  listening = false;
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('selectionchange', onSelectionChange);
  hideMenu();
}
