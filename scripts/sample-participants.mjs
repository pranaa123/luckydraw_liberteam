// Fixture lokal: seluruh data fiktif, tanpa mengambil peserta yang sudah tersimpan.
export function generateSampleParticipants(fields,seed) {
  let state = seed >>> 0;
  const random = max => { state = (Math.imul(state,1664525) + 1013904223) >>> 0; return state % max; };
  const pick = values => values[random(values.length)];
  const first = ['Alam','Budi','Citra','Dewi','Eka','Fajar','Gita','Hana','Indra','Joko','Kartika','Lestari','Muhammad','Nadia','Oka','Putri','Rizky','Siti','Taufik','Utami','Vina','Wahyu','Yuni','Zahra','Andi','Ni Luh','Abdul','Dian','Raden','Sri','I Made','Nur'];
  const middle = ['Aditya','Ayu','Dwi','Nur','Pratama','Rahma','Kusuma','Tri','Fitri','Anindita','Arief','Nabila'];
  const last = ['Saputra','Wijaya','Santoso','Lestari','Hidayat','Permata','Wulandari','Pratama','Nugroho','Putra','Sari','Utami','Maulana','Ramadhani','Kurniawan','Puspita','Darmawan','Setiawan','Syahputra','Anggraini','Mahendra','Salsabila'];
  const cities = ['Makassar','Jakarta','Bandung','Surabaya','Denpasar','Balikpapan','Yogyakarta','Medan','Manado','Semarang','Palembang','Malang'];
  const divisions = ['Operasional','Keuangan','Pemasaran','Teknologi Informasi','Sumber Daya Manusia','Produksi','Layanan Pelanggan','Logistik'];
  const groups = ['Tim Utara','Tim Selatan','Tim Timur','Tim Barat','Cabang Pusat','Cabang Utama','Unit Lapangan','Unit Administrasi'];
  const used = new Set(), rows = [];
  for (let index = 0; index < 400; index++) {
    let name;
    do { const length = random(10); name = [pick(first),...(length < 2 ? [] : length > 6 ? [pick(middle),pick(last)] : [pick(last)])].join(' '); } while (used.has(name));
    used.add(name); const row = { name };
    for (const field of fields) {
      const label = field.label.toLocaleLowerCase('id-ID');
      row[field.key] = /email|surel/u.test(label) ? `peserta.${index + 1}@example.test`
        : /telepon|ponsel|whatsapp|handphone|hp\b/u.test(label) ? `080000${String(index + 1).padStart(6,'0')}`
        : /nomor|kode|\bid\b|nik|nip|no\b/u.test(label) ? `DP-${String(index + 1).padStart(5,'0')}`
        : /kota|alamat|domisili|daerah/u.test(label) ? pick(cities)
        : /divisi|bagian|departemen|jabatan/u.test(label) ? pick(divisions)
        : /perusahaan|instansi|organisasi/u.test(label) ? `PT ${pick(last)} ${pick(['Sentosa','Nusantara','Mandiri','Bersama'])}`
        : pick(groups);
    }
    rows.push(row);
  }
  const originals = [...rows];
  for (let index = 0; index < 40; index++) {
    const row = { ...originals[index * 3] };
    for (const key of Object.keys(row)) row[key] = index % 3 === 0 ? row[key].toUpperCase() : index % 3 === 1 ? row[key].toLowerCase() : ` ${row[key]} `;
    rows.push(row);
  }
  for (let index = 0; index < 30; index++) {
    const row = { ...originals[150 + index] };
    if (fields.length) row[fields[index % fields.length].key] = `Variasi ${index + 1}`;
    rows.push(row);
  }
  for (let index = 0; index < 30; index++) {
    const row = { ...originals[250 + index] };
    if (index < 15) row.name = index % 2 ? row.name.replace(/a/iu,'@') : row.name.replace(/./u,'_');
    else if (fields.length) row[fields[index % fields.length].key] = '';
    else row.name = row.name.toLowerCase();
    rows.push(row);
  }
  for (let index = rows.length - 1; index > 0; index--) { const swap = random(index + 1); [rows[index],rows[swap]] = [rows[swap],rows[index]]; }
  return rows.map((row,index) => ({ ...row,row_number: index + 7 }));
}
