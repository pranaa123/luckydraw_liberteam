// Referensi metrik font; animasi memakai nama peserta utuh, bukan glyph buatan.
export const shuffleAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const reducedInterval = 800;
export const nameInterval = 100;

function hash(value) {
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Seed/waktu yang sama menyamakan preview dan output tanpa request per frame. */
export class NameSequence {
  constructor(seed,names) {
    this.seed = seed >>> 0;
    const unique = new Map();
    for (const name of names) if(typeof name==='string' && name.trim()){const clean=name.replace(/\s+/gu,' ').trim(),key=clean.toLocaleLowerCase('id-ID');if(!unique.has(key))unique.set(key,clean);}
    this.names = [...unique.values()];
    this.orders = new Map();
  }

  rawOrder(cycle) {
    const result = this.names.map((_,index) => index);
    let state = hash(this.seed + cycle * 104729);
    for (let index=result.length-1;index>0;index--) {
      state = hash(state + index * 7919);
      const other = state % (index+1);
      [result[index],result[other]] = [result[other],result[index]];
    }
    return result;
  }

  order(cycle) {
    if (this.orders.has(cycle)) return this.orders.get(cycle);
    const result=this.rawOrder(this.names.length===2?0:cycle);
    if (cycle>0 && result.length>2 && result[0]===this.rawOrder(cycle-1).at(-1)) [result[0],result[1]]=[result[1],result[0]];
    this.orders.set(cycle,result);
    for (const key of this.orders.keys()) if (key<cycle-1) this.orders.delete(key);
    return result;
  }

  at(turn) {
    if (!this.names.length) return '';
    const cycle = Math.floor(turn/this.names.length),order = this.order(cycle);
    return this.names[order[turn % order.length]];
  }

  frame(elapsed,reduced=false) {
    const interval = reduced ? reducedInterval : nameInterval;
    const turn = Math.floor(Math.max(0,elapsed)/interval);
    return { current:this.at(turn),next:this.at(turn+1),progress:reduced ? 0 : (elapsed % interval)/interval,turn,interval };
  }
}
