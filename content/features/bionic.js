function bionicN(len) {
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  if (len <= 9) return 3;
  return 4;
}

export function applyBionicToText(text) {
  return text.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    const leading  = tok.match(/^[^a-zA-Z]*/)[0];
    const trailing = tok.match(/[^a-zA-Z]*$/)[0];
    const body     = tok.slice(leading.length, tok.length - trailing.length);
    if (!body) return tok;
    const N      = bionicN(body.length);
    const anchor = body.slice(0, N);
    const rest   = body.slice(N);
    const inner  = rest.length <= 1
      ? `<b>${anchor}</b>${rest}`
      : `<b>${anchor}</b><span class="dra-bionic-fade">${rest[0]}</span>${rest.slice(1)}`;
    return `${leading}${inner}${trailing}`;
  }).join('');
}
