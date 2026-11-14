export const canvasNumbers = ['canvas_width','canvas_height','area_width','area_height','area_x','area_y'];
export const canvasFields = [...canvasNumbers,'area_anchor_x','area_anchor_y'];
export const geometryOnly = value => Object.fromEntries(canvasFields.map(key => [key,value[key]]));
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

/** Nilai tetap dalam px; hanya dimensi/jarak yang keluar batas yang diperkecil. */
export function fitGeometry(value) {
  const result = { ...value };
  for (const key of ['canvas_width','canvas_height']) result[key] = clamp(Math.round(result[key]),1,32768);
  result.area_width = clamp(Math.round(result.area_width),1,result.canvas_width);
  result.area_height = clamp(Math.round(result.area_height),1,result.canvas_height);
  result.area_x = clamp(Math.round(result.area_x * 2) / 2,0,result.canvas_width - result.area_width);
  result.area_y = clamp(Math.round(result.area_y * 2) / 2,0,result.canvas_height - result.area_height);
  return result;
}

export function validGeometry(value) {
  return canvasNumbers.every(key => Number.isFinite(value[key]) && Number.isInteger(value[key] * (['area_x','area_y'].includes(key) ? 2 : 1)) && value[key] >= (['area_x','area_y'].includes(key) ? 0 : 1) && value[key] <= 32768)
    && value.area_width + value.area_x <= value.canvas_width && value.area_height + value.area_y <= value.canvas_height
    && ['left','right'].includes(value.area_anchor_x) && ['top','bottom'].includes(value.area_anchor_y);
}

/** Hanya batas renderer mengubah jarak dari acuan menjadi koordinat absolut SVG. */
export function resolveNameArea(visual) {
  return { ...visual,
    area_x: visual.area_anchor_x === 'right' ? visual.canvas_width - visual.area_width - visual.area_x : visual.area_x,
    area_y: visual.area_anchor_y === 'bottom' ? visual.canvas_height - visual.area_height - visual.area_y : visual.area_y,
  };
}

export function changeAnchor(visual,key,value) {
  const result = { ...visual };
  if (visual[key] === value) return result;
  const horizontal = key === 'area_anchor_x';
  const [dimension,size,offset] = horizontal ? ['canvas_width','area_width','area_x'] : ['canvas_height','area_height','area_y'];
  result[offset] = visual[dimension] - visual[size] - visual[offset]; result[key] = value;
  return result;
}

/** Editor memakai pusat; API lama tetap menyimpan jarak pixel yang kompatibel. */
export function centeredGeometry(visual) {
  return { ...geometryOnly(resolveNameArea(visual)),area_anchor_x: 'left',area_anchor_y: 'top' };
}

export function positionLimits(visual) {
  return { x: (visual.canvas_width - visual.area_width) / 2,y: (visual.canvas_height - visual.area_height) / 2 };
}

export function centerOffsets(visual) {
  const limits = positionLimits(visual);
  return { x: visual.area_x - limits.x,y: visual.area_y - limits.y };
}

export function editGeometry(visual,key,value) {
  const next = centeredGeometry(visual), limits = positionLimits(next);
  if (key === 'area_offset_x' || key === 'area_offset_y') {
    const axis = key.endsWith('x') ? 'x' : 'y';
    next[`area_${axis}`] = limits[axis] + clamp(Math.round(value * 2) / 2,-limits[axis],limits[axis]);
  } else if (key === 'canvas_width' || key === 'canvas_height') {
    const horizontal = key === 'canvas_width';
    next[key] = clamp(Math.round(value),1,32768);
    next[horizontal ? 'area_width' : 'area_height'] = next[key];
    next[horizontal ? 'area_x' : 'area_y'] = 0;
  } else if (key === 'area_width' || key === 'area_height') {
    const horizontal = key === 'area_width', offset = horizontal ? 'area_x' : 'area_y';
    const center = next[offset] + next[key] / 2;
    next[key] = clamp(Math.round(value),1,next[horizontal ? 'canvas_width' : 'canvas_height']);
    next[offset] = center - next[key] / 2;
  }
  return fitGeometry(next);
}
