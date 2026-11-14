import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { projectRoot } from './php-runtime.mjs';

export async function baselineSQL() {
  const names = (await readdir(resolve(projectRoot,'database/migrations'))).filter(name => /^00[1-5]_.*\.sql$/.test(name)).sort();
  const files = ['database/schema.sql',...names.map(name => `database/migrations/${name}`)];
  const fragments = await Promise.all(files.map(async file => (await readFile(resolve(projectRoot,file),'utf8')).split('\n').filter(line => !/^(BEGIN|COMMIT);$/.test(line.trim())).join('\n')));
  const sql = fragments.join('\n');
  if (sql.includes('$doorprize_legacy_schema$')) throw new Error('Delimiter baseline bertabrakan.');
  const digest = createHash('sha256').update(sql).digest('hex');
  return `-- Generated baseline: schema + migrations 001–005. SHA-256 ${digest}\n-- Tidak mengubah skema yang sudah ada. Perubahan berikutnya memakai migrasi baru.\nDO $doorprize_baseline$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'doorprize') THEN\n    EXECUTE $doorprize_legacy_schema$\n${sql}\n$doorprize_legacy_schema$;\n  END IF;\nEND\n$doorprize_baseline$;\n`;
}

if (process.argv[2] === '--write') {
  const names = (await readdir(resolve(projectRoot,'supabase/migrations'))).filter(name => name.endsWith('_doorprize_baseline.sql'));
  if (names.length !== 1) throw new Error('Diperlukan satu baseline yang dihasilkan CLI Supabase.');
  await writeFile(resolve(projectRoot,'supabase/migrations',names[0]),await baselineSQL());
  console.log('Baseline Supabase dibuat dari skema aplikasi baru.');
}
