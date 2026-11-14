import { shuffleAlphabet } from './shuffle-model.js';

export const prizeSizeRatio = .48;
const advances = new WeakMap();

/** Metrik sama untuk glyph pengacakan, batas nama hasil dan label standby. */
export function shuffleTypography(visual,measure) {
  let cached = advances.get(measure);
  if (!cached || cached.font !== measure.font) {
    const glyphs = [...shuffleAlphabet,...shuffleAlphabet.toLocaleLowerCase('id-ID')];
    cached = { font: measure.font,advance: Math.max(...glyphs.map(glyph => measure.measureText(glyph).width / 100)) + .025 };
    advances.set(measure,cached);
  }
  const count = Math.min(20,Math.max(10,Math.round(visual.area_width / visual.area_height * 6)));
  return { count,advance: cached.advance,size: Math.min(visual.area_height * .52,visual.area_width * .92 / (count * cached.advance)) };
}

export const defaultNameSize = (visual,measure) => shuffleTypography(visual,measure).size;
export const defaultStandbySize = (visual,measure) => defaultNameSize(visual,measure) * .68;

// Skala berkurang bertahap menurut jumlah, lalu grid membatasi lebih lanjut bila perlu.
export const resultSizeLimit = (reference,count) => reference / Math.pow(Math.max(1,count),.25);
