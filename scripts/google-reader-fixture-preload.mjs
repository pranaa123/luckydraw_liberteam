// Hanya QA lokal; tidak dikemas ke runtime produksi.
import {readFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const fixture=resolve(process.env.DOORPRIZE_GOOGLE_READER_FIXTURE||'');
if(!fixture.includes('/doorprize-baru/.cache/'))throw Error('Fixture harus berada di cache aplikasi baru.');
const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(!['sts.googleapis.com','iamcredentials.googleapis.com','www.googleapis.com','sheets.googleapis.com'].includes(url.hostname))return actualFetch(input,options);
 const state=JSON.parse(await readFile(fixture,'utf8'));
 await appendFile(fixture+'.requests.jsonl',JSON.stringify({host:url.hostname,path:url.pathname,at:Date.now()})+'\n');
 if(state.delay_ms)await new Promise(r=>setTimeout(r,state.delay_ms));
 const answer=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 if(state.deny&&url.hostname==='sheets.googleapis.com')return answer({},403);
 if(url.hostname==='sts.googleapis.com')return answer({access_token:'fixture-federated'});
 if(url.hostname==='iamcredentials.googleapis.com')return answer({accessToken:'fixture-reader',expireTime:'2099-01-01T00:00:00Z'});
 if(url.hostname==='www.googleapis.com')return answer({version:String(state.version),trashed:false});
 if(/\/spreadsheets\/[^/]+$/.test(url.pathname)){
   const table=[state.headers,...state.rows],blocks=url.searchParams.getAll('ranges').map(range=>{
    const m=range.match(/(?:^|!)([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(!m)throw Error('Rentang fixture tidak valid');const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;
    return{startRow:Number(m[2])-1,startColumn:col(m[1]),rowData:table.slice(Number(m[2])-1,Number(m[4])).map(row=>({values:row.slice(col(m[1]),col(m[3])+1).map(v=>({formattedValue:String(v),effectiveValue:{[typeof v==='number'?'numberValue':'stringValue']:v}}))}))};
   });return answer({spreadsheetId:state.id,sheets:[{properties:{sheetId:0,title:'Respons formulir',gridProperties:{rowCount:Math.max(3,state.rows.length+1),columnCount:state.headers.length}},data:blocks}]});
 }
 const table=[state.headers,...state.rows];
 function values(range){const m=range.match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(!m)throw Error('Rentang fixture tidak valid');const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;return table.slice(Number(m[2])-1,Number(m[4])).map(row=>row.slice(col(m[1]),col(m[3])+1));}
 if(url.pathname.endsWith('/values:batchGet'))return answer({valueRanges:url.searchParams.getAll('ranges').map(range=>({values:values(range)}))});
 if(url.pathname.includes('/values/'))return answer({values:values(decodeURIComponent(url.pathname.split('/values/')[1]))});
 return answer({},404);
};
