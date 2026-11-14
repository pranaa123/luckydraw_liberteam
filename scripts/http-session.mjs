/** Cookie jar untuk alat lokal/QA; kredensial tidak ditulis ke disk atau log. */
export async function httpSession(origin,credentials) {
  const response = await fetch(origin+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(credentials)});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Login belum berhasil.');
  const cookie = response.headers.getSetCookie().find(value=>value.startsWith('doorprize_baru_session='))?.split(';')[0];
  if (!cookie) throw Error('Cookie login belum diterima.');
  const page = await fetch(origin+'/',{headers:{cookie}});
  const html = await page.text();
  const scope = html.match(/name="auth-scope" content="([^"]+)"/)?.[1];
  const csrf = html.match(/name="csrf-token" content="([^"]+)"/)?.[1];
  const eventScope = html.match(/name="event-scope" content="([^"]+)"/)?.[1];
  if (!scope || !csrf) throw Error('Sesi operator belum tersedia.');
  const headers = {cookie,'x-doorprize-session':scope,'x-csrf-token':csrf,...(eventScope ? {'x-doorprize-event':eventScope} : {})};
  return {
    cookie,scope,csrf,
    fetch:(url,options={})=>fetch(url,{...options,headers:{...headers,...options.headers}}),
    async browser(browser) {
      const index = cookie.indexOf('=');
      await browser.call('Storage.setCookies',{cookies:[{name:cookie.slice(0,index),value:cookie.slice(index+1),url:origin,httpOnly:true,sameSite:'Lax'}]});
    },
  };
}
