import {templates} from './catalog.js';
const base=new URL('.',import.meta.url).pathname.replace(/\/$/,'');
const page=location.pathname.slice(base.length);
const $=(s,root=document)=>root.querySelector(s);
async function post(url,data={}){
 const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await r.json();if(!r.ok)throw Error(result.error);return result;
}
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function play(root){
 const scene=$('.scene',root),symbol=$('.symbol',scene),name=scene.classList[1],output=$('output',root);
 const slow=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 scene.classList.remove('playing');void scene.offsetWidth;scene.classList.add('playing');
 if(slow&&['rocket','countdown'].includes(name)){for(const n of ['3','2','1']){output.textContent=n;await pause(320);}}
 await pause(slow?900:30);output.textContent="Congratulations! We're live!";
 symbol.textContent=templates[name][1];
}
for(const button of document.querySelectorAll('[data-play]'))button.onclick=async()=>{button.disabled=true;await play(button.parentElement);button.disabled=false;};
const form=$('#builder');
if(form){
 const el=form.elements,preview=$('.hero-preview'),time=Number(el.at.dataset.time);
 if(time){const dt=new Date(time);el.at.value=new Date(time-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 function update(){const t=el.template.value;$('#preview-title').textContent=el.title.value||'Something Amazing Is Launching!';$('.scene',preview).className='scene '+t;$('.symbol',preview).textContent=templates[t][1];preview.style.setProperty('--accent',el.color.value);}
 form.oninput=update;update();
 form.onsubmit=async e=>{
 e.preventDefault();const btn=$('[type=submit]',form);btn.disabled=true;
 try{
 const data=Object.fromEntries(new FormData(form));for(const c of form.querySelectorAll('[type=checkbox]'))data[c.name]=c.checked;
 data.at=data.at?new Date(data.at).getTime():0;
 const create=page==='/create',result=await post(create?'/api/create':page,data);
 if(result.challenge){
 let widget=$('#verification');
 if(!widget){widget=document.createElement('div');widget.id='verification';form.insertBefore(widget,btn);const challenge=document.createElement('script');challenge.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';challenge.onload=()=>window.turnstile.render(widget,{sitekey:result.challenge,'response-field-name':'challenge'});document.head.append(challenge);}else window.turnstile?.reset();
 $('output',form).textContent='Complete verification, then publish again.';return;
 }
 if(!create){$('output',form).textContent='Changes saved.';return;}
 const box=$('#published');form.closest('.builder').hidden=true;box.hidden=false;
 box.innerHTML='<h2>Your launch is ready</h2><p>Share your public invitation.</p><p><a id="public-link"></a></p><button id="copy">Copy launch link</button> <button id="share">Share</button> <a id="qr">Download QR code</a><h3>Private management link</h3><p>Save your private management link. Anyone with this link can manage your LaunchPad.</p><a id="manage-link">Manage your launch</a> · <a id="recovery" download="launchpad-recovery.txt">Download recovery file</a><output></output>';
 const link=$('#public-link');link.href=result.public;link.textContent=result.public;$('#manage-link').href=result.manage;$('#qr').href=new URL(result.public).pathname.replace('/l/','/qr/');$('#recovery').href=URL.createObjectURL(new Blob([result.manage+'\n'],{type:'text/plain'}));
 async function copy(){try{await navigator.clipboard.writeText(result.public);$('output',box).textContent='Link copied.';}catch{$('output',box).textContent='Select the invitation URL above to copy it.';}}
 $('#copy').onclick=copy;$('#share').onclick=async()=>{if(!navigator.share)return copy();try{await navigator.share({url:result.public});}catch{}};
 box.scrollIntoView();
 }catch(err){$('output',form).textContent=err.message;}finally{btn.disabled=false;}
 };
}
for(const [selector,action] of [['[data-delete]','delete'],['[data-toggle]','toggle'],['[data-remove]','remove']]){
 for(const b of document.querySelectorAll(selector))b.onclick=async()=>{if(!confirm(b.textContent+'?'))return;try{await post(page+'/'+action,{id:b.dataset.remove});if(action==='delete')location.assign(base+'/');else location.reload();}catch(e){alert(e.message);}};
}
const stage=$('.ceremony');
if(stage){
 const d=stage.dataset,btn=$('[data-activate]'),clock=$('.clock'),output=$('output',stage);
 let running=false,offset=0,locked=Number(d.at)>0;
 const event=name=>post('/event/'+d.id+'/'+name);
 async function activate(replay=false,automatic=false){
 if(running||locked)return;running=true;btn.disabled=true;
 const navigate=d.preview!=='true'&&!replay;
 const popup=navigate&&d.tab==='true'&&!automatic?window.open('about:blank','_blank'):null;
 if(popup)popup.opener=null;
 try{if(navigate){const r=await event('start');$('h1',stage).textContent=r.title;}
 await play(stage);
 if(navigate){await event('finish');certificate();await pause(600);if(popup)popup.location.href=base+'/go/'+d.id;else if(d.tab!=='true')location.assign(base+'/go/'+d.id);else output.textContent+=' Select Enter website to continue.';}
 }catch(e){popup?.close();output.textContent=e.message;}finally{running=false;btn.disabled=false;}
 }
 function certificate(){
 if($('[data-cert]',stage))return;
 const c=document.createElement('canvas');c.width=1200;c.height=700;const g=c.getContext('2d');g.fillStyle='#171128';g.fillRect(0,0,c.width,c.height);g.fillStyle='#e4cb96';g.textAlign='center';
 [ 'Officially Launched with CodeIXE LaunchPad',$('h1',stage).textContent,$('small',stage).textContent,templates[d.template][0],new Date().toLocaleDateString(),'Powered by CodeIXE AI Solutions'].forEach((v,i)=>{g.font=(i===1?64:32)+'px Georgia';g.fillText(v,600,120+i*88,1100);});
 const a=document.createElement('a');a.dataset.cert='';a.href=c.toDataURL();a.download='launch-certificate.png';a.textContent='Download launch certificate';stage.append(a);
 }
 btn.onclick=()=>activate();$('.scene',stage).onclick=()=>activate();
 if($('[data-replay]'))$('[data-replay]').onclick=()=>activate(true);
 if($('[data-report]'))$('[data-report]').onclick=async e=>{try{await event('report');e.target.textContent='Report received';e.target.disabled=true;}catch(err){output.textContent=err.message;}};
 if(locked){btn.disabled=true;const sync=async()=>{try{const r=await fetch(base+'/api/time');const t=await r.json();offset=t.now-Date.now();
 const tick=()=>{const left=Math.max(0,Math.ceil((Number(d.at)-Date.now()-offset)/1000));clock.textContent=left?[Math.floor(left/86400)+'d',Math.floor(left/3600)%24+'h',Math.floor(left/60)%60+'m',left%60+'s'].join('  '):'Launch is open';if(left)setTimeout(tick,300);else{locked=false;btn.disabled=false;if(d.auto==='true')activate(false,true);}};tick();
 }catch{clock.textContent='Synchronizing countdown…';setTimeout(sync,3000);}};sync();}
}
for(const b of document.querySelectorAll('[data-review]'))b.onclick=async()=>{try{await post(page+'/'+b.dataset.review,{note:b.dataset.noteid});b.closest('aside').remove();}catch(e){alert(e.message);}};
for(const b of document.querySelectorAll('[data-react]'))b.onclick=async()=>{try{await post('/event/'+stage.dataset.id+'/react',{kind:b.dataset.react});const n=$('span',b);n.textContent=Number(n.textContent)+1;b.disabled=true;}catch(e){$('.community output').textContent=e.message;}};
if($('#note'))$('#note').onsubmit=async e=>{e.preventDefault();try{await post('/event/'+stage.dataset.id+'/note',{message:e.target.elements.message.value});e.target.reset();$('.community output').textContent='Your message is awaiting review.';}catch(err){$('.community output').textContent=err.message;}};
for(const field of document.querySelectorAll('[data-image]'))field.onchange=async()=>{
 const file=field.files[0];if(!file)return;field.setCustomValidity('Preparing image…');
 try{if(file.size>5000000)throw Error('Choose an image under 5 MB.');const img=await createImageBitmap(file);const scale=Math.min(1,(field.dataset.image==='logo'?180:650)/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();const uri=canvas.toDataURL();if(uri.length>450000)throw Error('Choose a smaller image.');form.elements[field.dataset.image].value=uri;field.setCustomValidity('');}catch(e){field.setCustomValidity(e.message);field.reportValidity();}
};
if(form&&page==='/create'){
 const sets=[...form.querySelectorAll('fieldset')],submit=$('[type=submit]',form);
 let step=0;const controls=document.createElement('div');controls.className='steps';controls.innerHTML='<button type="button" class="secondary">Back</button><span></span><button type="button">Continue</button>';form.insertBefore(controls,submit);
 const [back,next]=controls.querySelectorAll('button');
 function show(){sets.forEach((s,i)=>s.hidden=i!==step);back.hidden=step===0;next.hidden=step===sets.length-1;submit.hidden=!next.hidden;$('span',controls).textContent='Step '+(step+1)+' of '+sets.length;}
 next.onclick=()=>{if([...sets[step].querySelectorAll('input')].every(input=>input.reportValidity())){step++;show();}};
 back.onclick=()=>{step--;show();};show();
}
if(stage?.dataset.sound==='true')$('[data-activate]').addEventListener('click',()=>{try{const ctx=new AudioContext(),tone=ctx.createOscillator(),gain=ctx.createGain();tone.connect(gain).connect(ctx.destination);tone.frequency.setValueAtTime(440,ctx.currentTime);tone.frequency.exponentialRampToValueAtTime(880,ctx.currentTime+.3);gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.4);tone.start();tone.stop(ctx.currentTime+.4);tone.onended=()=>ctx.close();}catch{}});
