import { state } from '../state.js';

const POPUP_ID = 'dra-simplify-popup';
let listening = false;
let pendingRequestId = null;
let currentRect = null;

function getPopup() {
  return document.getElementById(POPUP_ID);
}

function hidePopup() {
  getPopup()?.remove();
  pendingRequestId = null;
}

function positionPopup(popup, rect) {
  const popupH = popup.offsetHeight || 60;
  let top  = rect.top  + window.scrollY - popupH - 10;
  let left = rect.left + window.scrollX;
  if (left + popup.offsetWidth > window.innerWidth - 8) {
    left = window.innerWidth - popup.offsetWidth - 8;
  }
  if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 10;
  popup.style.top  = top  + 'px';
  popup.style.left = left + 'px';
}

function showSimplifyButton(selectedText, rect) {
  currentRect = rect;
  hidePopup();

  const popup = document.createElement('div');
  popup.id = POPUP_ID;

  const btn = document.createElement('button');
  btn.className = 'dra-simplify-trigger-btn';
  btn.textContent = 'Simplify';
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    startSimplify(selectedText, rect);
  });
  popup.appendChild(btn);
  document.body.appendChild(popup);
  positionPopup(popup, rect);
}

function startSimplify(selectedText, rect) {
  const popup = getPopup();
  if (!popup) return;

  popup.innerHTML = '';
  const loading = document.createElement('span');
  loading.className = 'dra-simplify-loading';
  loading.textContent = 'Simplifying…';
  popup.appendChild(loading);
  positionPopup(popup, rect);

  const requestId = Math.random().toString(36).slice(2);
  pendingRequestId = requestId;

  chrome.runtime.sendMessage({
    type: 'SIMPLIFY_REQUEST',
    text: selectedText,
    requestId,
  });
}

export function showSimplifyResult(simplified, requestId) {
  if (requestId !== pendingRequestId) return;
  const popup = getPopup();
  if (!popup) return;

  popup.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'dra-simplify-header';

  const label = document.createElement('span');
  label.className = 'dra-simplify-label';
  label.textContent = 'Simplified';
  header.appendChild(label);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dra-simplify-close-btn';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    hidePopup();
  });
  header.appendChild(closeBtn);
  popup.appendChild(header);

  const body = document.createElement('div');
  body.className = 'dra-simplify-result';
  body.textContent = simplified;
  popup.appendChild(body);
  if (currentRect) positionPopup(popup, currentRect);
}

export function showSimplifyError(requestId) {
  if (requestId !== pendingRequestId) return;
  const popup = getPopup();
  if (!popup) return;

  popup.innerHTML = '';
  const msg = document.createElement('span');
  msg.className = 'dra-simplify-error';
  msg.textContent = 'Could not simplify. Try again.';
  popup.appendChild(msg);
}

function onMouseUp(e) {
  // If click was inside the popup, do nothing — let the popup handle it
  if (e.target.closest?.(`#${POPUP_ID}`)) return;

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    hidePopup();
    return;
  }

  const text = sel.toString().trim();
  if (!text || text.length < 10) {
    hidePopup();
    return;
  }

  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  showSimplifyButton(text, rect);
}

function onMouseDown(e) {
  const popup = getPopup();
  if (popup && !popup.contains(e.target)) {
    hidePopup();
  }
}

export function setupSimplify() {
  if (listening) return;
  listening = true;
  document.addEventListener('mouseup',   onMouseUp);
  document.addEventListener('mousedown', onMouseDown);
}

export function teardownSimplify() {
  if (!listening) return;
  listening = false;
  document.removeEventListener('mouseup',   onMouseUp);
  document.removeEventListener('mousedown', onMouseDown);
  hidePopup();
}
