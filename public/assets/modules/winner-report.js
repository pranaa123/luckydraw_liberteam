// Definisi PDF murni; engine/font baru dimuat worker ketika export diminta.
const pageWidth = 841.89, margin = 36;
function headerLines(value) {
  const lines = []; let line = '';
  for (const word of value.replace(/\s+/gu,' ').trim().split(' ')) {
    if (!word) continue;
    if (line && [...line, ' ', ...word].length > 60) { lines.push(line); line = ''; }
    const glyphs = [...word];
    while (glyphs.length > 60) { lines.push(glyphs.splice(0,60).join('')); }
    const rest = glyphs.join(''); if (rest) line += (line ? ' ' : '') + rest;
  }
  if (line) lines.push(line);
  return lines;
}

export function winnerFilename(meta) {
  const name = (meta.event_name || '').normalize('NFKD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,'').slice(0,60);
  return `pemenang${name ? '-' + name : ''}.pdf`;
}

export function createWinnerReport(meta,items) {
  if (!items.length) throw Error('Belum ada pemenang yang disahkan.');
  const date = meta.event_at ? new Intl.DateTimeFormat('id-ID',{ dateStyle: 'long',timeStyle: 'short',timeZone: meta.timezone }).format(new Date(meta.event_at)) : '';
  const info = [meta.event_name,[meta.client_name,date].filter(Boolean).join(' · ')].filter(Boolean).flatMap(headerLines);
  const sections = [];
  for (const item of items) {
    const fields = [...item.fields].sort((a,b)=>a.slot-b.slot);
    const key = JSON.stringify(fields);
    let section = sections.at(-1);
    if (!section || section.key !== key) {
      section = { key,fields,rows: [] }; sections.push(section);
    }
    section.rows.push([item.participant.name,...fields.map(field=>item.participant[`field_${field.slot}`] || '—'),item.prize_name || '—',String(item.sequence_number)]);
  }
  return {
    pageSize: 'A4',pageOrientation: 'landscape',pageMargins: [margin,52 + info.length * 15,margin,42],
    defaultStyle: { font: 'Roboto',fontSize: 12,lineHeight: 1.15,color: '#172b4d' },
    info: { title: `Daftar pemenang${meta.event_name ? ' · ' + meta.event_name : ''}`,author: meta.client_name || 'Doorprize' },
    header: { margin: [margin,18,margin,0],stack: [
      { text: 'Daftar pemenang',fontSize: 16,bold: true,margin: [0,0,0,5] },
      ...info.map(text=>({ text,fontSize: 12,lineHeight: 1.15 })),
    ] },
    footer: (page,total)=>({ margin: [margin,12,margin,0],columns: [
      { text: `${meta.total} pemenang · ${meta.rounds} undian`,fontSize: 12 },
      { text: `Halaman ${page} / ${total}`,fontSize: 12,alignment: 'right' },
    ] }),
    content: sections.map((section,index)=>{
      const count = section.fields.length, available = pageWidth - margin * 2 - (count + 3) * 12 - 58;
      const unit = available / (3.5 + count);
      return { margin: [0,index ? 14 : 0,0,0],table: {
        headerRows: 1,
        widths: [unit * 2,...section.fields.map(()=>unit),unit * 1.5,58],
        body: [
          ['Nama',...section.fields.map(field=>field.label),'Hadiah','Undian ke'].map(text=>({ text,bold: true,color: '#ffffff',fillColor: '#1d4ed8',fontSize: 12 })),
          ...section.rows.map((row,index)=>row.map((text,column)=>({ text,fontSize: 12,alignment: column === row.length-1 ? 'center' : 'left',fillColor: index % 2 ? '#f8fafc' : '#ffffff' }))),
        ],
      },layout: {
        hLineWidth: ()=>.5,vLineWidth: ()=>0,hLineColor: ()=> '#dbe3ee',
        paddingLeft: ()=>6,paddingRight: ()=>6,paddingTop: ()=>7,paddingBottom: ()=>7,
      } };
    }),
  };
}
