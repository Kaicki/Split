const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const S={file:null,ext:'',dur:0,mode:'dur',cuts:[],parts:[]};
let ff=null,logs=[],onLog=null,onProg=null,cancelled=false;
const fmt=t=>{t=Math.max(0,t);const m=Math.floor(t/60);return m+':'+(t-m*60).toFixed(1).padStart(4,'0')};
const sz=b=>b>1e9?(b/1e9).toFixed(2)+' GB':(b/1e6).toFixed(1)+' MB';
const parse=v=>{v=String(v).trim().replace(',','.');return v.includes(':')?v.split(':').reduce((a,x)=>a*60+(+x),0):parseFloat(v)};
const show=id=>['up','ed','pr','rs'].forEach(x=>$('#'+x).hidden=x!==id);
let tt;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),6000)};

// ===== FFmpeg.wasm =====
async function engine(){
 if(ff&&ff.loaded&&ff._m)return ff;
 if(!ff||!ff.loaded){
  ff=new FFmpegWASM.FFmpeg();
  ff.on('log',({message})=>{logs.push(message);if(logs.length>300)logs.shift();onLog&&onLog(message)});
  ff.on('progress',({time})=>onProg&&onProg(time));
  const core='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',w='https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd',{toBlobURL}=FFmpegUtil;
  await ff.load({
   classWorkerURL:await toBlobURL(w+'/814.ffmpeg.js','text/javascript'),
   coreURL:await toBlobURL(core+'/ffmpeg-core.js','text/javascript'),
   wasmURL:await toBlobURL(core+'/ffmpeg-core.wasm','application/wasm')});
 }
 // monta o arquivo sem copiá-lo para a memória (suporta arquivos grandes)
 try{await ff.createDir('/in');await ff.mount('WORKERFS',{files:[S.file]},'/in');ff._m='mount'}
 catch{await ff.writeFile('/in_'+S.file.name,await FFmpegUtil.fetchFile(S.file));ff._m='mem'}
 return ff}
const src=()=>ff._m==='mount'?'/in/'+S.file.name:'/in_'+S.file.name;
async function run(args){logs=[];const c=await ff.exec(args);if(c!==0&&!cancelled)throw new Error('Falha no FFmpeg: '+logs.filter(l=>l.trim()).slice(-2).join(' '));return c}
function kill(){try{ff&&ff.terminate()}catch{}ff=null}

// ===== envio / leitura =====
const drop=$('#drop'),file=$('#file');
drop.onclick=()=>file.click();file.onchange=()=>file.files[0]&&pick(file.files[0]);
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add('on')}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove('on')}));
drop.addEventListener('drop',x=>x.dataTransfer.files[0]&&pick(x.dataTransfer.files[0]));
async function pick(f){
 const m=f.name.match(/\.(mp4|mov|avi|mkv|webm)$/i);
 if(!m)return toast('Formato não suportado. Use MP4, MOV, AVI, MKV ou WebM.');
 S.ext='.'+m[1].toLowerCase();S.file=new File([f],'source'+S.ext,{type:f.type}); // referência, sem copiar dados
 S.cuts=[];S.orig=f;
 $('#upbar').hidden=false;$('#upbar').classList.add('ind');$('#uptxt').textContent='Carregando o motor FFmpeg (~30 MB, só na primeira vez)…';
 try{
  await engine();
  let info='';onLog=l=>info+=l+'\n';
  await ff.exec(['-hide_banner','-i',src()]); // sai com erro por não ter saída; só queremos o log
  onLog=null;
  const d=info.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if(!d)throw new Error('Não foi possível ler este vídeo (arquivo corrompido ou inválido).');
  S.dur=+d[1]*3600+ +d[2]*60+ +d[3];
  const r=info.match(/Video:.*?[, ](\d{2,5})x(\d{2,5})/),c=info.match(/Video:\s*(\w+)/);
  if(!r)throw new Error('O arquivo não contém trilha de vídeo.');
  $('#vid').src=URL.createObjectURL(f);
  $('#meta').innerHTML=[['Duração',fmt(S.dur)],['Resolução',r[1]+'×'+r[2]],['Tamanho',sz(f.size)],['Codec',c?c[1]:'?']].map(a=>`<span class="chip">${a[0]}: <b>${a[1]}</b></span>`).join('');
  $('#rows').innerHTML='';addRow(0,Math.min(S.dur,30));setMode('dur');show('ed');
 }catch(e){kill();toast(e.message.includes('fetch')||e.name==='TypeError'?'Não foi possível carregar o motor FFmpeg. Verifique a conexão e abra o site por http(s).':e.message)}
 finally{$('#upbar').hidden=true;$('#upbar').classList.remove('ind');$('#uptxt').textContent='';file.value=''}
}
$('#vid').onerror=()=>toast('Seu navegador não reproduz este formato na prévia, mas a divisão funciona normalmente.');

// ===== modos =====
function setMode(m){S.mode=m;$$('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));$$('[data-p]').forEach(p=>p.hidden=p.dataset.p!==m);sum()}
$('#tabs').onclick=e=>e.target.dataset.m&&setMode(e.target.dataset.m);
$('#pre').onclick=e=>{const s=e.target.dataset.s;if(!s)return;$('#step').value=s;sum()};
['step','qty','minlen'].forEach(i=>$('#'+i).oninput=sum);
$('#th').oninput=()=>$('#thv').textContent=(+$('#th').value).toFixed(2);
$('#scan').onclick=async()=>{const b=$('#scan');b.disabled=true;
 const times=[];onLog=l=>{const m=l.match(/pts_time:([\d.]+)/);if(m)times.push(+m[1])};
 onProg=t=>b.textContent='Analisando… '+Math.min(99,Math.round(t/1e6/S.dur*100))+'%';b.textContent='Analisando…';
 try{await run(['-hide_banner','-i',src(),'-an','-vf',`fps=2,scale=320:-2,select='gt(scene,${+$('#th').value})',showinfo`,'-f','null','-']);
  S.cuts=times;if(!times.length)toast('Nenhuma mudança de cena encontrada. Tente reduzir a sensibilidade.')}
 catch(e){toast(e.message)}
 onLog=onProg=null;b.disabled=false;b.textContent='🔍 Detectar cenas';sum()};
function addRow(a,b){const d=document.createElement('div');d.className='row';
 d.innerHTML=`<input type="text" value="${fmt(a)}"><span>→</span><input type="text" value="${fmt(b)}"><button title="Usar tempo atual no fim">⏺</button>`;
 d.querySelector('button').onclick=()=>{d.children[2].value=fmt($('#vid').currentTime);sum()};
 d.oninput=sum;$('#rows').append(d)}
$('#addrow').onclick=()=>{const r=$$('#rows .row'),l=r.length?parse(r[r.length-1].children[2].value):0;addRow(l,Math.min(S.dur,l+30));sum()};

function segs(){const D=S.dur;let c=[];
 if(S.mode==='dur'){const s=+$('#step').value;if(!(s>0))return[];for(let t=0;t<D-0.05;t+=s)c.push([t,Math.min(D,t+s)]);
  if(c.length>1&&c[c.length-1][1]-c[c.length-1][0]<1){const l=c.pop();c[c.length-1][1]=l[1]}}
 else if(S.mode==='qty'){const n=Math.max(1,Math.min(500,+$('#qty').value|0));for(let i=0;i<n;i++)c.push([D*i/n,D*(i+1)/n])}
 else if(S.mode==='auto'){const mn=Math.max(1,+$('#minlen').value||5);let last=0;for(const t of S.cuts)if(t-last>=mn&&D-t>=mn){c.push([last,t]);last=t}c.push([last,D])}
 else c=$$('#rows .row').map(r=>[parse(r.children[0].value),parse(r.children[2].value)]);
 return c}
function sum(){const c=segs();
 $('#sum').innerHTML=S.mode==='auto'&&!S.cuts.length?'Clique em “Detectar cenas” para analisar o vídeo.':c.length?`<b>${c.length}</b> ${c.length>1?'partes':'parte'} · duração média <b>${fmt(c.reduce((a,x)=>a+x[1]-x[0],0)/c.length)}</b>`:'Defina ao menos um trecho válido.'}

// ===== processamento =====
function clearParts(){S.parts.forEach(p=>URL.revokeObjectURL(p.url));S.parts=[]}
$('#go').onclick=async()=>{const c=segs();
 if(!c.length||c.some(a=>!(a[1]>a[0])||a[0]<0||a[1]>S.dur+0.5))return toast('Há trechos inválidos: o fim deve ser maior que o início e caber na duração do vídeo.');
 if(S.mode==='auto'&&!S.cuts.length&&!confirm('Nenhuma cena foi detectada; o vídeo será mantido em uma única parte. Continuar?'))return;
 clearParts();cancelled=false;const precise=$('#precise').checked,n=c.length,t0=Date.now();
 $('#pct').textContent='0%';$('#pbar').style.width='0';$('#eta').textContent='Iniciando…';show('pr');
 const upd=p=>{$('#pct').textContent=Math.round(p*100)+'%';$('#pbar').style.width=p*100+'%';
  const el=(Date.now()-t0)/1000;if(p>0.02){const r=el*(1-p)/p;$('#eta').textContent='Tempo restante estimado: '+(r<60?Math.ceil(r)+' s':Math.floor(r/60)+' min '+Math.ceil(r%60)+' s')}else $('#eta').textContent='Calculando tempo estimado…'};
 try{
  if(!ff||!ff.loaded||!ff._m)await engine();
  for(let i=0;i<n;i++){
   const [s,e]=c[i],dur=e-s,name=`parte-${String(i+1).padStart(2,'0')}${precise?'.mp4':S.ext}`;
   onProg=t=>upd((i+Math.min(1,Math.max(0,t/1e6/dur)))/n);
   await run(['-hide_banner','-y','-ss',String(s),'-i',src(),'-t',String(dur),'-map','0:v:0','-map','0:a?',
    ...(precise?['-c:v','libx264','-crf','16','-preset','veryfast','-c:a','aac','-b:a','320k','-movflags','+faststart']:['-c','copy','-avoid_negative_ts','make_zero']),name]);
   const data=await ff.readFile(name);await ff.deleteFile(name); // libera a memória do FFmpeg
   const blob=new Blob([data.buffer],{type:precise||S.ext==='.mp4'?'video/mp4':S.file.type||'video/'+S.ext.slice(1)});
   S.parts.push({name,blob,url:URL.createObjectURL(blob),dur});upd((i+1)/n);
  }
  onProg=null;results();
 }catch(e){onProg=null;clearParts();if(cancelled){cancelled=false;toast('Processamento cancelado.')}else toast(/memory|alloc|abort/i.test(e.message)?'Memória do navegador esgotada. Use um computador, um arquivo menor ou mais partes.':e.message);kill();show('ed')}
};
$('#cancel').onclick=()=>{cancelled=true;kill()};
function results(){
 $('#parts').innerHTML=S.parts.map((p,i)=>`<div class="part" style="animation-delay:${i*40}ms"><video src="${p.url}" controls playsinline preload="metadata"></video><h4>${p.name}</h4><p><span class="d">${fmt(p.dur)}</span> · ${sz(p.blob.size)}</p><a class="btn" href="${p.url}" download="${p.name}">⬇ Baixar</a></div>`).join('');
 $$('#parts .part').forEach((el,i)=>el.querySelector('video').onloadedmetadata=e=>{const d=e.target.duration;if(isFinite(d))el.querySelector('.d').textContent=fmt(d)});
 show('rs')}
$('#zip').onclick=async()=>{const b=$('#zip');b.disabled=true;
 try{const z=new JSZip();S.parts.forEach(p=>z.file(p.name,p.blob,{compression:'STORE'}));
  const blob=await z.generateAsync({type:'blob',compression:'STORE'},m=>b.textContent='Gerando ZIP… '+Math.round(m.percent)+'%');
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='partes.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}
 catch{toast('Não foi possível gerar o ZIP (memória insuficiente). Baixe as partes separadamente.')}
 b.disabled=false;b.textContent='⬇ Baixar tudo (ZIP)'};
$('#again').onclick=()=>{clearParts();kill();URL.revokeObjectURL($('#vid').src);$('#vid').removeAttribute('src');S.file=S.orig=null;show('up')};
addEventListener('pagehide',()=>{clearParts();kill()});
