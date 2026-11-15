import {apiRequest} from './api-client.js';
import {ImportMapping} from './import-mapping.js';
import {element} from './ui.js';

const $ = name => document.querySelector(`#google-${name}`);
const localTime = value => value ? new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';

/** Periksa link tanpa menyimpan. Hanya Hubungkan yang mengganti koneksi acara. */
export class GoogleDialog {
  constructor(store,feedback) {
    this.store=store;this.feedback=feedback;this.session=0;this.dialog=$('dialog');
    this.mapping=new ImportMapping($('mapping'),()=>this.renderSample(),'google');
  }
  start() {
    $('close').addEventListener('click',()=>this.close());
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    $('prepare').addEventListener('click',()=>this.inspect());
    $('connect').addEventListener('click',()=>this.connect());
    $('copy-email').addEventListener('click',async()=>{
      try {await navigator.clipboard.writeText(this.store.reader.email);this.status('Email aplikasi disalin.');}
      catch {this.status('Pilih dan salin email aplikasi di atas.');}
    });
    for(const id of ['url','header']) $(id).addEventListener('input',()=>this.invalidate());
  }
  invalidate() {
    this.inspection=null;this.metadata=null;
    for(const id of ['mapping-controls','schedule-label','connect'])$(id).hidden=true;
  }
  async open(source=null) {
    const session=++this.session;this.source=source;this.connection=crypto.randomUUID();this.committing=false;
    this.invalidate();$('error').hidden=true;$('header').value=source?.header_row||1;
    $('url').value=source?`https://docs.google.com/spreadsheets/d/${source.spreadsheet_id}/edit#gid=${source.sheet_id??0}`:'';
    $('closes').value=localTime(source?.closes_at);$('connect').textContent=source?'Simpan koneksi':'Hubungkan';
    $('replace-note').hidden=!source;$('advanced').open=false;this.dialog.showModal();this.busy(true,'Memuat pengaturan…');
    try {
      await this.store.load();this.active(session);
      this.source=this.store.values()[0]||null;
      const current=this.source;
      $('url').value=current?`https://docs.google.com/spreadsheets/d/${current.spreadsheet_id}/edit#gid=${current.sheet_id??0}`:'';
      $('header').value=current?.header_row||1;$('closes').value=localTime(current?.closes_at);
      $('replace-note').hidden=!current;$('connect').textContent=current?'Simpan koneksi':'Hubungkan';
      this.savedMapping=current?.connection_mode==='reader'?await apiRequest('/api/google-sources',{action:'setup',id:Number(current.id)}):null;
      this.active(session);
      const metadata=await apiRequest('/api/imports');this.active(session);
      this.fields=metadata.fields;this.schema=metadata.field_schema;
      $('reader-email').value=this.store.reader?.email||'';
      if(!this.store.reader?.ready)throw Error('Koneksi Google aplikasi belum dikonfigurasi.');
      this.status('');
    }catch(error){if(session===this.session)this.error(error);}
    finally{if(session===this.session)this.busy(false);}
  }
  active(session) {if(session!==this.session||!this.dialog.open)throw Error('Pemeriksaan dibatalkan.');}
  status(text) {$('status').textContent=text;}
  error(error) {$('error').textContent=error.message;$('error').hidden=false;this.status('');}
  busy(value,text) {
    this.loading=value;if(text!==undefined)this.status(text);
    for(const id of ['url','header','prepare','closes'])$(id).disabled=value;
    if(!value&&!this.store.reader?.ready)$('prepare').disabled=true;
    $('mapping-controls').disabled=value;$('connect').disabled=value;$('close').disabled=!!this.committing;
  }
  close() {if(this.committing)return;this.session++;this.dialog.close();this.invalidate();}
  async inspect() {
    if(this.loading)return;
    const session=this.session,url=$('url').value,header=Number($('header').value);
    this.invalidate();this.busy(true,'Memeriksa akses dan kolom…');$('error').hidden=true;
    try {
      let result,job;
      do {
        result=await apiRequest('/api/google-sources',{action:'inspect',spreadsheet_url:url,header_row:header,...(job?{job_id:job}:{})});
        this.active(session);job=result.job_id;
        if(result.pending){await new Promise(resolve=>setTimeout(resolve,150));this.active(session);}
      }while(result.pending);
      this.inspection=result.inspection;this.metadata=result.metadata;
      this.mapping.render(this.fields,this.metadata.headers);
      if (this.savedMapping?.field_schema===this.schema && this.savedMapping?.header_hash===this.metadata.header_hash
        && new URL(url).pathname.includes('/'+this.source?.spreadsheet_id+'/')) {
        for(const[key,column]of Object.entries(this.savedMapping.mapping)){const select=this.mapping.selects.get(key);if(select)select.value=String(column);}
      }
      $('mapping-controls').hidden=false;$('schedule-label').hidden=false;$('connect').hidden=false;
      this.renderSample();this.status(`${this.metadata.sheet_name} · Periksa kecocokan kolom, lalu hubungkan.`);
    }catch(error){if(session===this.session)this.error(error);}
    finally{if(session===this.session)this.busy(false);}
  }
  renderSample() {
    if(!this.metadata)return;
    const table=element('table',undefined,'participant-table'),head=element('thead'),header=element('tr'),body=element('tbody');
    for(const field of this.fields)header.append(element('th',field.label));head.append(header);
    for(const values of this.metadata.sample||[]){const row=element('tr');for(const field of this.fields){const column=Number(this.mapping.selects.get(field.key)?.value);row.append(element('td',column?values[column-1]||'—':'—'));}body.append(row);}
    table.append(head,body);$('sample').replaceChildren(table);$('sample').hidden=!body.children.length;
  }
  async connect() {
    if(this.loading||!this.inspection)return;
    this.committing=true;this.busy(true,'Menghubungkan…');$('error').hidden=true;
    try {
      const source=await apiRequest('/api/google-sources',{action:'connect',connection_id:this.connection,inspection:this.inspection,
        current_id:this.source?Number(this.source.id):null,current_version:this.source?Number(this.source.version):null,
        mapping:this.mapping.value(),field_schema:this.schema,
        closes_at:$('closes').value?new Date($('closes').value).toISOString():null});
      this.store.update(source);this.store.changed(false,true);this.store.wake();this.committing=false;this.close();
      this.feedback('Google Sheets terhubung. Peserta diperbarui otomatis.');
    }catch(error){this.error(error);}
    finally{this.committing=false;this.busy(false);}
  }
}
export {localTime as googleLocalTime};
