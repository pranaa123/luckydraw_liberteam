import { defaultNameSize,prizeSizeRatio,resultSizeLimit } from './output-typography.js';

// Hanya mengukur hasil terpilih. Nama selalu satu baris; metrik dicache per render.
export function resultLayout(entries,fields,visual,measure,write) {
  const count = entries.length;
  if (!count) return [];
  const widths = new Map();
  const width = text => {
    if (!widths.has(text)) widths.set(text,Math.max(.01,measure.measureText(text).width / 100));
    return widths.get(text);
  };
  const content = entries.map(entry => {
    const name = write(entry.participant.name.replace(/\s+/gu,' '));
    const details = fields.filter(field => visual[`show_field_${field.slot}`] !== false).flatMap(field => {
      const value = entry.participant[`field_${field.slot}`];
      return value?.trim() ? [{ text: write(value.replace(/\s+/gu,' ')),ratio: Number(field.slot) === 1 ? .5 : .25 }] : [];
    });
    const prize = entry.prize_name ? write(entry.prize_name) : '';
    return { entry,name,details,prize,
      width: Math.max(width(name),...details.map(detail => width(detail.text) * detail.ratio),prize ? width(prize) * prizeSizeRatio : 0),
      height: 1.15 + details.reduce((sum,detail) => sum + detail.ratio * 1.3,0) + (prize ? .6 : 0) };
  });
  const gap = Math.min(visual.area_width,visual.area_height) * .028 / Math.max(1,Math.sqrt(count) / 4);
  const maximumSize = resultSizeLimit(defaultNameSize(visual,measure),count);
  const sortedWidths = content.map(item => item.width).sort((a,b) => a - b);
  // Nama ekstrem tidak menjadi patokan seluruh pemenang; satu ukuran umum tetap diprioritaskan.
  const ordinaryLimit = sortedWidths[Math.floor((count - 1) / 2)] * 1.6;
  const typicalWidth = sortedWidths.filter(value => value <= ordinaryLimit).at(-1);
  const tallest = Math.max(...content.map(item => item.height));
  let best = null;
  const maxColumns = Math.min(count,Math.ceil(Math.sqrt(count * visual.area_width / visual.area_height) * 2 + 2));
  for (let columns = 1; columns <= maxColumns; columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (visual.area_width - (columns - 1) * gap) / columns;
    const cellHeight = (visual.area_height - (rows - 1) * gap) / rows;
    const fitSize = Math.min(cellHeight * .88 / tallest,cellWidth * .92 / typicalWidth);
    const fontSize = Math.min(maximumSize,fitSize);
    const average = content.reduce((sum,item) => sum + Math.min(fontSize,cellWidth * .92 / item.width),0) / count;
    const score = fontSize * .8 + average * .2;
    if (!best || score > best.score || (score === best.score && fitSize > best.fitSize)) best = { columns,rows,cellWidth,cellHeight,fontSize,fitSize,score };
  }
  return content.map((item,index) => {
    const row = Math.floor(index / best.columns), column = index % best.columns;
    const rowCount = Math.min(best.columns,count - row * best.columns);
    const offset = (visual.area_width - rowCount * best.cellWidth - (rowCount - 1) * gap) / 2;
    const x = Number(visual.area_x) + offset + column * (best.cellWidth + gap) + best.cellWidth / 2;
    const size = Math.min(best.fontSize,best.cellWidth * .92 / item.width);
    const lines = [{ text: item.name,size,weight: '600',step: size * 1.15 }];
    for (const detail of item.details) lines.push({ text: detail.text,size: size * detail.ratio,weight: '400',step: size * detail.ratio * 1.3 });
    if (item.prize) lines.push({ text: item.prize,size: size * prizeSizeRatio,weight: '600',step: size * .6 });
    const totalHeight = lines.reduce((sum,line) => sum + line.step,0);
    let y = Number(visual.area_y) + row * (best.cellHeight + gap) + best.cellHeight / 2 - totalHeight / 2;
    return { id: item.entry.participant_id,lines: lines.map(line => { y += line.step / 2; const positioned = { ...line,x,y }; y += line.step / 2; return positioned; }) };
  });
}
