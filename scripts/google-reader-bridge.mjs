import {createHash,randomUUID} from 'node:crypto';

const hosts = new Set(['sts.googleapis.com','iamcredentials.googleapis.com','sheets.googleapis.com','www.googleapis.com']);

async function googleRequest(request) {
  const url = new URL(request.url);
  if (url.protocol!=='https:' || !hosts.has(url.hostname) || url.username || url.password || url.port) throw Error('Alamat Google tidak diizinkan.');
  const response = await fetch(url,{method:request.body===null?'GET':'POST',headers:request.headers,body:request.body===null?undefined:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(10000)});
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2097152)throw Error('Respons Google terlalu besar.');chunks.push(chunk);}
  return {status:response.status,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
}

/** Cache pekerjaan jaringan hanya untuk dev WASM. Scope/flow mencegah pekerjaan antar-sesi tertukar. */
export function createReaderBridge(fetcher=googleRequest) {
  const jobs=new Map();
  return request=>{
    const now=Date.now();for(const[id,job]of jobs)if(job.expires<now)jobs.delete(id);
    let id=request.job_id,job=id?jobs.get(id):null;
    if(id&&(!job||job.scope!==request.scope||job.flow!==request.flow))return{error:'Permintaan Google kedaluwarsa.'};
    if(!job){if(jobs.size>=32)return{error:'Antrean Google penuh.'};id=randomUUID();job={scope:request.scope,flow:request.flow,expires:now+90000,responses:new Map(),pending:new Set()};jobs.set(id,job);}
    const key=createHash('sha256').update(JSON.stringify([request.url,request.body])).digest('hex');
    if(job.responses.has(key))return job.responses.get(key);
    if(!job.pending.has(key)){
      job.pending.add(key);
      const headers=Object.fromEntries(request.headers.map(header=>{const i=header.indexOf(':');return[header.slice(0,i),header.slice(i+1).trim()];}));
      Promise.resolve().then(()=>fetcher({...request,headers})).then(value=>job.responses.set(key,value),()=>job.responses.set(key,{error:'Google belum dapat diakses.'}));
    }
    return{pending:id};
  };
}
