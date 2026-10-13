// Generated product illustrations, shared by the browser (window.AurelleArt) and
// the API, which serves them as images at /api/products/:id/image.svg (lib/app.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AurelleArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const METALS = {
    gold: ['#f8e7b8', '#d4a94e', '#9a7226'],
    rose: ['#f9ddd2', '#dc9a85', '#a5604f'],
    silver: ['#f6f7f9', '#c5cad1', '#7d858f'],
  };
  const STONES = {
    diamond: ['#ffffff', '#dbe8f4', '#9fbcd9'],
    emerald: ['#9be5c1', '#1f9d6b', '#0b5a3c'],
    sapphire: ['#a5bff7', '#2f55c4', '#162a73'],
    ruby: ['#f7a3b0', '#c81e3e', '#6e0a1f'],
    morganite: ['#fde3dc', '#f2a999', '#c9705f'],
    amethyst: ['#dcc3f5', '#8b4fc9', '#4a2378'],
    pearl: ['#ffffff', '#f4ede2', '#cdbfaa'],
  };
  const TONES = {
    cream: ['#fcf8ef', '#ecdfc9'],
    blush: ['#fdf5f1', '#f1d9d0'],
    sage: ['#f6f8f2', '#d9e3d2'],
    mist: ['#f7f9fb', '#d8dfe8'],
  };

  function gem(cx, cy, r, uid, stone) {
    if (stone === 'pearl') {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s-${uid})"/>
        <ellipse cx="${cx - r * 0.32}" cy="${cy - r * 0.38}" rx="${r * 0.26}" ry="${r * 0.15}" fill="#fff" opacity=".85"/>`;
    }
    const ring = (scale) =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = Math.PI / 8 + (i * Math.PI) / 4;
        return [cx + Math.cos(angle) * r * scale, cy + Math.sin(angle) * r * scale].map((n) => n.toFixed(1));
      });
    const outer = ring(1);
    const inner = ring(0.55);
    const dark = STONES[stone][2];
    const facets = outer.map((p, i) => `M${p.join(' ')}L${inner[i].join(' ')}`).join('');
    return `<polygon points="${outer.join(' ')}" fill="url(#s-${uid})" stroke="${dark}" stroke-opacity=".55" stroke-width="1"/>
      <polygon points="${inner.join(' ')}" fill="#fff" fill-opacity=".38"/>
      <path d="${facets}" stroke="#fff" stroke-opacity=".6" stroke-width="1" fill="none"/>`;
  }

  const SHAPES = {
    rings: (uid, stone) => `
      <ellipse cx="200" cy="348" rx="92" ry="9" fill="#000" opacity=".07"/>
      <ellipse cx="200" cy="245" rx="82" ry="88" fill="none" stroke="url(#m-${uid})" stroke-width="15"/>
      <path d="M124 222 A82 88 0 0 1 160 170" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/>
      <path d="M176 156h48l-10 16h-28z" fill="url(#m-${uid})"/>
      ${gem(200, 128, 36, uid, stone)}`,
    necklaces: (uid, stone) => `
      <path d="M60 48Q200 340 340 48" fill="none" stroke="url(#m-${uid})" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M60 48Q200 340 340 48" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="2 6"/>
      <circle cx="200" cy="203" r="7" fill="none" stroke="url(#m-${uid})" stroke-width="3"/>
      <circle cx="200" cy="254" r="43" fill="none" stroke="url(#m-${uid})" stroke-width="5"/>
      ${gem(200, 254, 34, uid, stone)}`,
    earrings: (uid, stone) =>
      [135, 265]
        .map(
          (x) => `
      <circle cx="${x}" cy="96" r="11" fill="url(#m-${uid})"/>
      <path d="M${x} 107V192" stroke="url(#m-${uid})" stroke-width="3.5"/>
      <circle cx="${x}" cy="234" r="41" fill="none" stroke="url(#m-${uid})" stroke-width="4.5"/>
      ${gem(x, 234, 32, uid, stone)}`
        )
        .join(''),
    bracelets: (uid, stone) => `
      <ellipse cx="200" cy="332" rx="118" ry="9" fill="#000" opacity=".07"/>
      <ellipse cx="200" cy="205" rx="125" ry="85" fill="none" stroke="url(#m-${uid})" stroke-width="11"/>
      <path d="M92 165 A125 85 0 0 1 150 128" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/>
      ${[38, 64, 90, 116, 142]
        .map((deg) => {
          const a = (deg * Math.PI) / 180;
          return gem(200 + 125 * Math.cos(a), 205 + 85 * Math.sin(a), 15, uid, stone);
        })
        .join('')}`,
  };

  function svg(p) {
    const uid = p.id;
    const metal = METALS[p.metal] || METALS.gold;
    const stoneKey = STONES[p.stone] ? p.stone : 'diamond';
    const stone = STONES[stoneKey];
    const tone = TONES[p.tone] || TONES.cream;
    const stops = (colors) =>
      colors.map((c, i) => `<stop offset="${i / (colors.length - 1)}" stop-color="${c}"/>`).join('');
    const stoneGradient =
      stoneKey === 'pearl'
        ? `<radialGradient id="s-${uid}" cx="35%" cy="30%" r="80%">${stops(stone)}</radialGradient>`
        : `<linearGradient id="s-${uid}" x1="0" y1="0" x2="1" y2="1">${stops(stone)}</linearGradient>`;

    return `<svg viewBox="0 0 400 400" role="img" aria-label="${esc(p.name)}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="b-${uid}" cx="50%" cy="38%" r="75%">${stops(tone)}</radialGradient>
        <linearGradient id="m-${uid}" gradientUnits="userSpaceOnUse" x1="60" y1="60" x2="340" y2="340">${stops(metal)}</linearGradient>
        ${stoneGradient}
      </defs>
      <rect width="400" height="400" fill="url(#b-${uid})"/>
      ${SHAPES[p.category](uid, stoneKey)}
    </svg>`;
  }

  return { svg };
});
