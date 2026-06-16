import { state } from '../state.js';

export function updateRuler(e) {
  state.lastRulerY = e.clientY;
  const halfH = Math.round(16 * 1.8 * state.settings.rulerWindowLines / 2);
  const topEl = document.getElementById('dra-ruler-top');
  const botEl = document.getElementById('dra-ruler-bottom');
  const winEl = document.getElementById('dra-ruler-window');
  if (!topEl) return;

  topEl.style.height = Math.max(0, e.clientY - halfH) + 'px';
  botEl.style.top    = (e.clientY + halfH) + 'px';
  winEl.style.top    = Math.max(0, e.clientY - halfH) + 'px';
  winEl.style.height = (halfH * 2) + 'px';
}

export function setupRuler() {
  if (document.getElementById('dra-ruler-top')) return;
  ['dra-ruler-top', 'dra-ruler-bottom', 'dra-ruler-window'].forEach(id => {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  });
  document.addEventListener('mousemove', updateRuler);
  updateRuler({ clientY: state.lastRulerY ?? window.innerHeight / 2 });
}

export function teardownRuler() {
  ['dra-ruler-top', 'dra-ruler-bottom', 'dra-ruler-window'].forEach(id => {
    document.getElementById(id)?.remove();
  });
  document.removeEventListener('mousemove', updateRuler);
}
