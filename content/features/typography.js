export function injectOpenDyslexicFont() {
  if (document.getElementById('dra-od-font')) return;
  const style = document.createElement('style');
  style.id = 'dra-od-font';
  const base = chrome.runtime.getURL('fonts/');
  style.textContent = `
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${base}OpenDyslexic-Regular.otf') format('opentype');
      font-weight: normal; font-style: normal;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${base}OpenDyslexic-Bold.otf') format('opentype');
      font-weight: bold; font-style: normal;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${base}OpenDyslexic-Italic.otf') format('opentype');
      font-weight: normal; font-style: italic;
    }
  `;
  document.head.appendChild(style);
}
