// Pengembangan lokal saja. Mengambil token identitas proyek, tanpa menarik environment/secret lain.
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectRoot} from './php-runtime.mjs';

export async function googleDevelopmentIdentity() {
  const path=resolve(projectRoot,'.env.google.local');
  const previous=await readFile(path,'utf8').catch(()=>''),token=previous.match(/^VERCEL_OIDC_TOKEN=(.*)$/m)?.[1];
  try {if(token&&JSON.parse(Buffer.from(token.split('.')[1],'base64url')).exp>Date.now()/1000+300)return token;}catch{}
  const link=JSON.parse(await readFile(resolve(projectRoot,'.vercel/project.json'),'utf8'));
  if(link.projectId!=='prj_A1SLJkMkMo58eUXy7MNMgcP7vJw5'||link.orgId!=='team_5XCB6S7d2lXOYacNsiSsLJZY')throw Error('Proyek pengembangan Google tidak cocok.');
  const auth=JSON.parse(await readFile(resolve(projectRoot,'.cache/vercel-cli/auth.json'),'utf8'));
  const response=await fetch(`https://api.vercel.com/v1/projects/${link.projectId}/token?source=vercel-oidc-refresh&teamId=${link.orgId}`,{method:'POST',headers:{authorization:'Bearer '+auth.token},signal:AbortSignal.timeout(5000)});
  const value=await response.json();if(!response.ok||typeof value.token!=='string')throw Error('Login pengembangan Vercel perlu diperbarui.');
  await writeFile(path,`GOOGLE_READER_EMAIL=sheets-reader@luckydraw-liberteam.iam.gserviceaccount.com\nGOOGLE_READER_AUDIENCE=//iam.googleapis.com/projects/203795669606/locations/global/workloadIdentityPools/luckydraw-vercel/providers/vercel\nVERCEL_OIDC_TOKEN=${value.token}\n`,{mode:0o600});
  await chmod(path,0o600);return value.token;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await googleDevelopmentIdentity();console.log('Identitas Google pengembangan siap; token tetap privat.');}
