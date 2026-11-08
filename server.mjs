import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {templates,pages,demos} from './catalog.mjs';
import {layout,home,esc,builder,ceremony,cards} from './views.mjs';
import {pngQR} from './qr.mjs';
const dir=process.env.DATA_DIR||'data',port=Number(process.env.PORT||3000);
const publicURL=new URL(process.env.PUBLIC_ORIGIN||'http://localhost:'+port);
const base=publicURL.pathname.replace(/\/+$/, '');
const origin=publicURL.origin+base;
mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(join(dir,'launch.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS launches(id TEXT PRIMARY KEY,owner TEXT UNIQUE NOT NULL,config TEXT NOT NULL,active INTEGER DEFAULT 1,visits INTEGER DEFAULT 0,starts INTEGER DEFAULT 0,finishes INTEGER DEFAULT 0,clicks INTEGER DEFAULT 0,reports INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, launch TEXT REFERENCES launches(id) ON DELETE CASCADE,message TEXT NOT NULL,approved INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS reactions(launch TEXT REFERENCES launches(id) ON DELETE CASCADE,kind TEXT,count INTEGER DEFAULT 0,PRIMARY KEY(launch,kind));`);
const byId=id=>db.prepare('SELECT * FROM launches WHERE id=?').get(id);
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const limits=new Map();
setInterval(()=>{for(const [k,v] of limits)if(v.end<Date.now())limits.delete(k);},60000).unref();
function limit(key,max){let v=limits.get(key);if(!v||v.end<Date.now()){v={n:0,end:Date.now()+60000};limits.set(key,v);}if(++v.n>max)fail(429,'Please try again in a minute.');return v.n;}
function validate(input){
 let url;try{url=new URL(input.url);}catch{fail(400,'Enter a valid HTTPS destination.');}
 const blocked=(process.env.BLOCKED_HOSTS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
 if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048||!url.hostname.includes('.')||blocked.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))fail(400,'Choose an allowed HTTPS website.');
 if(!Object.hasOwn(templates,input.template))fail(400,'Choose a template.');
 const at=Number(input.at||0);if(!Number.isSafeInteger(at)||at<0||at>253402300799000)fail(400,'Invalid date.');
 const image=k=>{
  if(!input[k])return '';
  if(typeof input[k]!=='string'||input[k].length>450000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(input[k]))fail(400,'Select a smaller PNG image.');
  const b=Buffer.from(input[k].split(',')[1],'base64');
  if(b.length<33||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||b.toString('ascii',12,16)!=='IHDR'||b.readUInt32BE(16)>2048||b.readUInt32BE(20)>2048)fail(400,'Invalid PNG.');
  return input[k];
 };
 const str=(k,n)=>String(input[k]||'').trim().slice(0,n);
 return {logo:image('logo'),cover:image('cover'),sound:input.sound===true,guestbook:input.guestbook===true,url:url.href,title:str('title',120)||'Something Amazing Is Launching!',description:str('description',500),label:str('label',50),template:input.template,at,color:/^#[0-9a-f]{6}$/i.test(input.color)?input.color:'#986cff',...Object.fromEntries(['newTab','auto','surprise','listed','indexed'].map(k=>[k,input[k]===true]))};
}
async function json(req){let body='';for await(const bytes of req){body+=bytes;if(body.length>950000)fail(413,'Request too large.');}try{const d=JSON.parse(body||'{}');if(d&&typeof d==='object'&&!Array.isArray(d))return d;}catch{}fail(400,'Invalid JSON.');}
const asset=name=>readFileSync(new URL('./public/'+name,import.meta.url));
http.createServer(async(req,res)=>{
 const send=(status,data,type='text/html; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});if(base && type.startsWith('text/html')) data=data.replace(/( (?:href|src)=")\/(?!\/)/g, '$1'+base+'/');
 res.end(data);};
 const reply=data=>send(200,JSON.stringify(data),'application/json');
 try{
 const path=new URL(req.url,origin).pathname,[,route,id,action]=path.split('/');
 const peer=req.socket.remoteAddress;
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 if(req.method==='POST'){
  if(req.headers.origin&&req.headers.origin!==publicURL.origin)fail(403,'Origin mismatch.');
  if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required.');
  const input=await json(req);
  if(path==='/api/create'){
   const burst=limit(peer+':create',12);
   if(burst>3&&process.env.TURNSTILE_SECRET&&process.env.TURNSTILE_SITE_KEY){
    if(!input.challenge)return reply({challenge:process.env.TURNSTILE_SITE_KEY});
    const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:process.env.TURNSTILE_SECRET,response:String(input.challenge)}),signal:AbortSignal.timeout(6000)});
    if(!(await verification.json()).success)fail(403,'Verification failed. Refresh the challenge and retry.');
   }
   const config=validate(input),key=randomBytes(32).toString('base64url');
   const launch=randomBytes(12).toString('base64url');
   db.prepare('INSERT INTO launches(id,owner,config) VALUES(?,?,?)').run(launch,hash(key),JSON.stringify(config));
   return reply({public:origin+'/l/'+launch,manage:origin+'/manage/'+key});
  }
  if(route==='manage'){
   const row=db.prepare('SELECT * FROM launches WHERE owner=?').get(hash(id||''));if(!row)fail(404,'Management link unavailable.');
   if(action==='delete')db.prepare('DELETE FROM launches WHERE id=?').run(row.id);
   else if(action==='approve'||action==='reject'){const query=action==='approve'?'UPDATE notes SET approved=1 WHERE launch=? AND id=?':'DELETE FROM notes WHERE launch=? AND id=?';db.prepare(query).run(row.id,Number(input.note));}
   else if(action==='toggle')db.prepare('UPDATE launches SET active=1-active WHERE id=?').run(row.id);
   else if(!action)db.prepare('UPDATE launches SET config=? WHERE id=?').run(JSON.stringify(validate(input)),row.id);
   else fail(404,'Unknown action.');
   return reply({ok:true});
  }
  if(route==='event'){
   const row=byId(id);if(!row?.active)fail(404,'Invitation unavailable.');
   limit(peer+':event',100);
   const d=JSON.parse(row.config);
   if(action==='note'){if(!d.guestbook)fail(404,'Guestbook closed.');limit(peer+':note',3);const message=String(input.message||'').trim().slice(0,200);if(!message)fail(400,'Enter a message.');db.prepare('INSERT INTO notes(launch,message) VALUES(?,?)').run(id,message);}
   else if(action==='react'){limit(peer+':react',10);if(!['🎉','🔥','🚀','👏','❤️'].includes(input.kind))fail(400,'Invalid reaction.');db.prepare('INSERT INTO reactions VALUES(?,?,1) ON CONFLICT(launch,kind) DO UPDATE SET count=count+1').run(id,input.kind);}
   else if(action==='report'){limit(peer+':report',4);db.prepare('UPDATE launches SET reports=reports+1 WHERE id=?').run(id);}
   else {if(d.at>Date.now())fail(409,'The countdown is still running.');const col={start:'starts',finish:'finishes'}[action];if(!['starts','finishes'].includes(col))fail(400,'Unknown event.');db.prepare('UPDATE launches SET '+col+'='+col+'+1 WHERE id=?').run(id);}
   return reply({title:d.title});
  }
  if(path==='/admin/remove'){admin();db.prepare('DELETE FROM launches WHERE id=?').run(String(input.id));return reply({ok:true});}
  fail(404,'Unknown action.');
 }
 function admin(){const expected=process.env.ADMIN_TOKEN;if(!expected||!timingSafeEqual(Buffer.from(hash(req.headers.authorization||'')),Buffer.from(hash('Basic '+Buffer.from('admin:'+expected).toString('base64'))))){res.setHeader('WWW-Authenticate','Basic realm="Launch administration"');fail(401,'Administrator credentials required.');}}
 if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method unavailable.');
 const html=(title,desc,body,opts={})=>send(200,layout(title,desc,body,{canonical:origin+path,...opts}));
 if(path==='/')return html('CodeIXE LaunchPad | Free Website Launch Animation & Countdown Creator','Launch your website or app in style with CodeIXE LaunchPad. Create free ribbon-cutting ceremonies, countdown pages and animated launches. No signup required.',home());
 if(path==='/create')return html('Create your launch','Design a shareable website invitation.',builder());
 if(path==='/style.css'||path==='/app.js')return send(200,asset(path.slice(1)),path.endsWith('css')?'text/css':'text/javascript');
 if(path==='/catalog.js')return send(200,readFileSync(new URL('./catalog.mjs',import.meta.url)),'text/javascript');
 if(path==='/api/time')return reply({now:Date.now()});
 if(path==='/robots.txt')return send(200,'User-agent: *\nDisallow: '+base+'/manage/\nDisallow: '+base+'/admin\nSitemap: '+origin+'/sitemap.xml','text/plain');
 function listed(key){return db.prepare("SELECT id,config FROM launches WHERE active=1 AND json_extract(config,?)=1").all('$.'+key);}
 if(path==='/sitemap.xml'){const paths=['/',...Object.keys(pages),...Object.keys(demos).map(x=>'/templates/'+x),...listed('indexed').map(x=>'/l/'+x.id)];return send(200,'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>'<url><loc>'+esc(origin+p)+'</loc></url>').join('')+'</urlset>','application/xml');}
 if(Object.hasOwn(pages,path)){const [title,desc]=pages[path];let extra=path==='/templates'?cards():'';
 if(path==='/wall')extra=listed('listed').map(r=>'<p><a href="/l/'+r.id+'">'+esc(JSON.parse(r.config).surprise?'Mystery launch':JSON.parse(r.config).title)+'</a></p>').join('')||'<p>No invitations listed yet.</p>';
 return html(title+' | CodeIXE LaunchPad',desc,'<section><a href="/">Home</a><h1>'+title+'</h1><p>'+desc+'</p>'+extra+'</section>');}
 if(route==='demo'||route==='templates'){const t=route==='demo'?id:demos[id];if(!Object.hasOwn(templates,t))fail(404,'Template unavailable.');return html(templates[t][0],'Interactive ceremony preview.',ceremony({template:t,title:templates[t][0],description:'Try this example ceremony.'},'',true));}
 if(route==='manage'){const row=db.prepare('SELECT * FROM launches WHERE owner=?').get(hash(id||''));if(!row)fail(404,'Management link unavailable.');return html('Manage LaunchPad','Private management',builder(JSON.parse(row.config),true,row)+db.prepare('SELECT * FROM notes WHERE launch=? AND approved=0').all(row.id).map(n=>`<aside><h3>Guestbook review</h3><p>${esc(n.message)}</p><button data-noteid="${n.id}" data-review="approve">Approve</button> <button data-noteid="${n.id}" data-review="reject">Reject</button></aside>`).join(''),{index:false,canonical:''});}
 if(path==='/admin'){admin();const rows=db.prepare('SELECT id,visits,reports FROM launches ORDER BY reports DESC').all();return html('Administration','Private moderation','<section><h1>Launch administration</h1><p>'+rows.length+' launches</p>'+rows.map(r=>`<p><a href="/l/${r.id}">${r.id}</a> · ${r.visits} views · ${r.reports} reports <button data-remove="${r.id}">Remove</button></p>`).join('')+'</section>',{index:false,canonical:''});}
 if(['l','go','qr','calendar','social'].includes(route)){
 const row=byId(id||'');if(!row?.active)fail(404,'This invitation is unavailable.');
 const d=JSON.parse(row.config),publicURL=origin+'/l/'+id;
 if(route==='qr'){res.setHeader('Content-Disposition','attachment; filename="launch-invitation.png"');return send(200,pngQR(publicURL),'image/png');}
 if(route==='calendar'&&d.at){const stamp=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');return send(200,['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CodeIXE//LaunchPad//EN','BEGIN:VEVENT','UID:'+id+'@'+new URL(origin).hostname,'DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(d.at),'SUMMARY:Website launch','URL:'+publicURL,'END:VEVENT','END:VCALENDAR',''].join('\r\n'),'text/calendar');}
 if(route==='go'){if(d.at>Date.now())fail(409,'This launch has not opened yet.');db.prepare('UPDATE launches SET clicks=clicks+1 WHERE id=?').run(id);res.writeHead(302,{Location:d.url});return res.end();}
 const title=d.surprise?'Something Extraordinary Is Coming':d.title;
 if(route==='social')return send(200,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#171128"/><circle cx="1080" cy="120" r="230" fill="${d.color}"/><g fill="white" font-family="sans-serif"><text x="60" y="145" font-size="35">Grand launch invitation</text><text x="60" y="330" font-size="54">${esc(title.slice(0,36))}</text><text x="60" y="540" font-size="28">Powered by CodeIXE AI Solutions</text></g></svg>`,'image/svg+xml');
 if(route==='l'){db.prepare('UPDATE launches SET visits=visits+1 WHERE id=?').run(id);return html(title,d.description||'Join our launch ceremony.',`<div style="--accent:${d.color}">${ceremony(d,id)}<aside class="community"><h2>Celebrate this launch</h2>${['🎉','🔥','🚀','👏','❤️'].map(kind=>'<button data-react="'+kind+'">'+kind+' <span>'+(db.prepare('SELECT count FROM reactions WHERE launch=? AND kind=?').get(id,kind)?.count||0)+'</span></button>').join(' ')}${d.guestbook?'<h3>Guestbook</h3>'+db.prepare('SELECT message FROM notes WHERE launch=? AND approved=1 ORDER BY id DESC LIMIT 100').all(id).map(n=>'<p>'+esc(n.message)+'</p>').join('')+'<form id="note"><label>Leave a congratulatory message<input required maxlength="200" name="message"></label><button>Submit for review</button></form>':''}<output></output></aside></div>`,{index:d.indexed,image:origin+'/social/'+id});}
 }
 fail(404,'Page unavailable.');
 }catch(e){if(!e.status)console.error(e.message);send(e.status||500,req.method==='POST'?JSON.stringify({error:e.status?e.message:'Server error'}):layout('LaunchPad', '', '<section><h1>'+esc(e.status?e.message:'Server error')+'</h1><a href="/">Return home</a></section>',{index:false}),req.method==='POST'?'application/json':'text/html; charset=utf-8');}
}).listen(port,process.env.HOST||'0.0.0.0',()=>console.log('LaunchPad listening on '+port));
