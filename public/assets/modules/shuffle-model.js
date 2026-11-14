// Model glyph visual saja. Pemilihan pemenang tetap dilakukan oleh server.
export const shuffleAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const reducedInterval = 800;

function hash(value) {
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Acak terus-menerus dari seed/waktu yang sama, tanpa target nama atau fase selesai. */
export function glyphAt(seed, index, elapsed, alphabet, reduced = false) {
  const salt = hash(seed + index * 7919);
  let step, angle = 0;
  if (reduced) step = Math.floor(elapsed / reducedInterval);
  else {
    const period = 140 + salt % 75;
    const time = elapsed + salt % period;
    const boundary = turn => turn * period + hash(salt + turn * 3571) % Math.floor(period * .35);
    let turn = Math.floor(time / period);
    if (time < boundary(turn)) turn--;
    const phase = (time - boundary(turn)) / (boundary(turn + 1) - boundary(turn));
    // Ganti huruf saat membalik; tempo tiap glyph bervariasi tanpa reset baris.
    step = turn + (phase >= .5 ? 1 : 0);
    angle = phase < .5 ? phase * -180 : (1 - phase) * 180;
  }
  const text = alphabet[hash(salt + step * 104729) % alphabet.length];
  return { text, angle };
}
