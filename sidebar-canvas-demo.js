/* =================== design languages (learnable styles) =================== */
var THEMES = {
  midnight:{name:'Midnight',bg:'#0e1320',surface:'#1a2236',surface2:'#121829',ink:'#e8edf7',mut:'#8d9bb5',border:'#232c44',accent:'#6ee7b7',accent2:'#7c9cff',radius:'8px',pad:'8px',font:'system-ui,"Segoe UI",sans-serif',shadow:'0 1px 0 #0c1120',density:'Cozy',typeLabel:'Geometric sans'},
  warm:{name:'Warm',bg:'#f6efe4',surface:'#fffaf2',surface2:'#efe5d5',ink:'#3a322a',mut:'#9b8b76',border:'#e3d6c2',accent:'#e8883a',accent2:'#cf6a4c',radius:'16px',pad:'11px',font:'"Iowan Old Style",Palatino,Georgia,serif',shadow:'0 2px 6px rgba(120,90,50,.12)',density:'Airy',typeLabel:'Editorial serif'},
  neon:{name:'Neon',bg:'#080611',surface:'#160f29',surface2:'#0f0b1f',ink:'#eef0ff',mut:'#9a90c8',border:'#2a1f4d',accent:'#c77dff',accent2:'#3fe0ff',radius:'4px',pad:'7px',font:'"SF Mono",ui-monospace,Menlo,monospace',shadow:'0 0 12px rgba(199,125,255,.25)',density:'Compact',typeLabel:'Mono'}
};
var FANOUT=['midnight','warm','neon'];
var RECOMMENDED='warm';   // the variant Sidebar auto-picks if no one chooses

function rootCss(T){return ':root{--bg:'+T.bg+';--surface:'+T.surface+';--surface2:'+T.surface2+';--ink:'+T.ink+';--mut:'+T.mut+';--border:'+T.border+';--ac:'+T.accent+';--ac2:'+T.accent2+';--rad:'+T.radius+';--pad:'+T.pad+';--font:'+T.font+';--shadow:'+T.shadow+';}'}

function kanbanHTML(T){return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+rootCss(T)+
'*{box-sizing:border-box;font-family:var(--font)}body{margin:0;background:var(--bg);color:var(--ink);padding:14px}'+
'h1{font-size:14px;margin:0 0 2px}.sub{color:var(--mut);font-size:11px;margin:0 0 12px}'+
'.board{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}'+
'.col{background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:7px;min-height:124px}'+
'.col h2{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin:3px 5px 7px;display:flex;justify-content:space-between}'+
'.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:var(--pad);margin:5px 0;font-size:12px;cursor:grab;box-shadow:var(--shadow)}'+
'.card .tag{display:inline-block;font-size:9px;padding:1px 6px;border-radius:99px;background:var(--ac);color:var(--bg);margin-bottom:4px;font-weight:700}.card.b .tag{background:var(--ac2)}'+
'.chart{margin-top:10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:9px}.chart h2{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin:0 0 6px}'+
'</style></head><body><h1>Q3 Planning — Sprint Board</h1><p class="sub">drag cards across columns</p>'+
'<div class="board"><div class="col" data-c="todo"><h2>To Do <span id="n0">0</span></h2></div><div class="col" data-c="doing"><h2>In Progress <span id="n1">0</span></h2></div><div class="col" data-c="done"><h2>Done <span id="n2">0</span></h2></div></div>'+
'<div class="chart"><h2>Sprint burndown</h2><svg id="bd" viewBox="0 0 320 66" width="100%" height="66"></svg></div>'+
'<script>var AC="'+T.accent+'",GR="'+T.border+'";var data=[["todo","Auth flow","feat"],["todo","Billing API","feat"],["doing","Dashboard UI","feat","b"],["doing","WS event bus","feat","b"],["done","DB schema","feat"]];'+
'var cols={};document.querySelectorAll(".col").forEach(function(c){cols[c.dataset.c]=c});var drag=null;'+
'data.forEach(function(d){var el=document.createElement("div");el.className="card"+(d[3]?" "+d[3]:"");el.draggable=true;el.innerHTML="<span class=\\"tag\\">"+d[2]+"</span><div>"+d[1]+"</div>";el.addEventListener("dragstart",function(){drag=el});cols[d[0]].appendChild(el)});'+
'document.querySelectorAll(".col").forEach(function(c){c.addEventListener("dragover",function(e){e.preventDefault()});c.addEventListener("drop",function(e){e.preventDefault();if(drag){c.appendChild(drag);count()}})});'+
'function count(){["todo","doing","done"].forEach(function(k,i){document.getElementById("n"+i).textContent=cols[k].querySelectorAll(".card").length})}count();'+
'var ideal=[60,48,36,24,12,0],actual=[60,53,45,31,21,9];function pts(a){return a.map(function(v,i){return (i*60+10)+","+(58-v*0.8).toFixed(0)}).join(" ")}'+
'document.getElementById("bd").innerHTML=\'<polyline fill="none" stroke="\'+GR+\'" stroke-dasharray="4 4" stroke-width="2" points="\'+pts(ideal)+\'"/><polyline fill="none" stroke="\'+AC+\'" stroke-width="2.5" points="\'+pts(actual)+\'"/>\';'+
'<\/script></body></html>'}

function dashboardHTML(T){return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+rootCss(T)+
'*{box-sizing:border-box;font-family:var(--font)}body{margin:0;background:var(--bg);color:var(--ink);padding:14px}'+
'h1{font-size:14px;margin:0 0 2px}.sub{color:var(--mut);font-size:11px;margin:0 0 12px}'+
'.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:11px}'+
'.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:11px}'+
'.kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut)}.kpi .v{font-size:20px;font-weight:700;margin-top:3px}.kpi .d{font-size:10px;margin-top:2px}.up{color:var(--ac)}.down{color:#ff8b6b}'+
'.chart{background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:11px}.chart h2{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin:0 0 9px}'+
'.bars{display:flex;align-items:flex-end;gap:7px;height:80px}.bars .b{flex:1;background:linear-gradient(180deg,var(--ac2),var(--ac));border-radius:var(--rad) var(--rad) 0 0;min-height:4px;transition:height .4s}'+
'</style></head><body><h1>Growth Dashboard</h1><p class="sub">live · updated just now</p>'+
'<div class="kpis"><div class="kpi"><div class="l">MRR</div><div class="v">$142k</div><div class="d up">&#9650; 9% MoM</div></div>'+
'<div class="kpi"><div class="l">Churn</div><div class="v">4.1%</div><div class="d down">&#9650; 0.6 pts</div></div>'+
'<div class="kpi"><div class="l">WAU</div><div class="v">12.0k</div><div class="d up">&#9650; 4% WoW</div></div></div>'+
'<div class="chart"><h2>Weekly active users</h2><div class="bars" id="bars"></div></div>'+
'<script>var d=[7.8,8.4,9.1,9.6,10.3,11.1,11.6,12.0],m=12.6;var w=document.getElementById("bars");d.forEach(function(v){var b=document.createElement("div");b.className="b";b.style.height=(v/m*100)+"%";w.appendChild(b)});<\/script></body></html>'}

function landingHTML(T){return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+rootCss(T)+
'*{box-sizing:border-box;font-family:var(--font)}body{margin:0;background:radial-gradient(120% 80% at 50% -10%,var(--surface),var(--bg) 62%);color:var(--ink);padding:20px;text-align:center}'+
'.badge{display:inline-block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--ac2);border:1px solid var(--border);border-radius:99px;padding:4px 11px;margin-bottom:12px}'+
'h1{font-size:23px;line-height:1.15;margin:0 0 9px;letter-spacing:-.5px}h1 b{background:linear-gradient(90deg,var(--ac),var(--ac2));-webkit-background-clip:text;background-clip:text;color:transparent}'+
'p.s{color:var(--mut);font-size:13px;max-width:330px;margin:0 auto 15px}'+
'.cta{display:flex;gap:8px;max-width:320px;margin:0 auto 20px}.cta input{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:9px 12px;color:var(--ink);font-size:12px}'+
'.cta button{background:linear-gradient(90deg,var(--ac),var(--ac2));border:0;border-radius:var(--rad);padding:9px 15px;font-weight:700;font-size:12px;color:var(--bg);cursor:pointer}'+
'.feat{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:370px;margin:0 auto}.f{background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:11px 9px}.f .i{font-size:16px;color:var(--ac2)}.f .t{font-size:11px;font-weight:600;margin:5px 0 3px}.f .d{font-size:10px;color:var(--mut);line-height:1.35}'+
'</style></head><body><div class="badge">&#9670; launching soon</div><h1>Ship ideas <b>while they&#39;re still spoken</b></h1>'+
'<p class="s">A panel of AI agents that turns your meeting into working prototypes — live.</p>'+
'<div class="cta"><input placeholder="you@work.com"><button>Join waitlist</button></div>'+
'<div class="feat"><div class="f"><div class="i">&#9889;</div><div class="t">Instant</div><div class="d">Idea to artifact in ~2s</div></div>'+
'<div class="f"><div class="i">&#9673;</div><div class="t">Screen-aware</div><div class="d">Reads your slides</div></div>'+
'<div class="f"><div class="i">&#8734;</div><div class="t">Ambient</div><div class="d">No prompting needed</div></div></div></body></html>'}

var PROTO_BUILD={kanban:kanbanHTML,dashboard:dashboardHTML,landing:landingHTML};

/* =================== state + helpers =================== */
var FIX = JSON.parse(document.getElementById('fixtures').textContent).scenarios;
var $=function(id){return document.getElementById(id)};
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
var clamp=function(v,a,b){return Math.max(a,Math.min(b,v))};
var RATE=0.6;
var runId=0, abMode=false, busy=false, curScn=0, fanning=false;
var learnedKey=null, learnedTheme=null;   // persists across scenarios in the session

/* =================== transcript / summary / factcheck =================== */
var transEl=$('trans'), pendingEl=null;
function scrollT(){transEl.scrollTop=transEl.scrollHeight}
function partial(sp,text){
  if(!pendingEl){pendingEl=document.createElement('div');pendingEl.className='line partial';transEl.appendChild(pendingEl)}
  pendingEl.innerHTML='<span class="sp">'+sp+'</span>'+text; scrollT(); return sleep(460);
}
async function say(sp,text,ms){
  if(pendingEl){pendingEl.remove();pendingEl=null}
  var el=document.createElement('div'); el.className='line';
  el.innerHTML='<span class="sp">'+sp+'</span>'+text; transEl.appendChild(el); scrollT();
  await sleep(Math.max(700,(ms||2600)*RATE));
}
function routerLine(r){
  var pr=r.prototype&&r.prototype.trigger, fc=r.factcheck&&r.factcheck.trigger;
  var el=document.createElement('div'); el.className='line router';
  el.innerHTML='<b>&rarr; router</b> &nbsp;prototype <span class="'+(pr?'y':'n')+'">'+(pr?'fire':'skip')+'</span> &middot; summary <span class="'+(r.summary_update?'y':'n')+'">'+(r.summary_update?'update':'skip')+'</span> &middot; factcheck <span class="'+(fc?'y':'n')+'">'+(fc?'fire':'skip')+'</span>'+(pr&&r.prototype.uses_screen?' &middot; <span class="y">+screenshot</span>':'');
  transEl.appendChild(el); scrollT(); pulse('router',950,180);
}
function fillList(el,items,render){el.innerHTML=''; if(!items||!items.length){el.innerHTML='<li class="empty" style="list-style:none">&mdash;</li>';return} items.forEach(function(it){var li=document.createElement('li');li.innerHTML=render(it);el.appendChild(li)})}
function setSummary(s){
  $('sTldr').textContent=s.tldr;
  fillList($('sDec'),s.decisions,function(d){return d});
  fillList($('sAct'),s.action_items,function(a){return '<span class="owner">'+a.owner+'</span>'+a.task});
  fillList($('sOpen'),s.open_questions,function(q){return q});
  pulse('sumr',760,520);
}
async function factCheck(f){
  $('fact').innerHTML='';
  var el=document.createElement('div'); el.className='fc';
  el.innerHTML='<div class="claim">&ldquo;'+f.claim+'&rdquo;</div><div class="row"><span class="verdict v-checking" id="fcv">checking&hellip;</span><span class="conf" id="fcc">web search&hellip;</span><span class="src" id="fcs"></span></div>';
  $('fact').appendChild(el);
  await sleep(1500);
  $('fcv').className='verdict v-'+f.verdict; $('fcv').textContent=f.verdict;
  $('fcc').textContent='confidence '+f.confidence; $('fcs').innerHTML='&#128279; '+f.source;
}

/* =================== telemetry =================== */
function pulse(agent,tps,toks){
  var map={router:['tpsRouter','barRouter'],sumr:['tpsSum','barSum'],proto:['tpsProto','barProto']};
  var m=map[agent], jit=Math.round(tps*(0.93+Math.random()*0.13));
  $(m[0]).innerHTML=jit.toLocaleString()+'<small> tok/s</small>'; $(m[1]).style.width=clamp(tps/19,0,100)+'%'; speed.boost(agent,tps);
}
function pulseProto(tps){
  if(!fanning) $('tpsProto').innerHTML=Math.round(tps*(0.95+Math.random()*0.1)).toLocaleString()+'<small> tok/s</small>';
  $('barProto').style.width=clamp(tps/19,0,100)+'%'; speed.boost('proto',tps);
}

/* =================== canvas: pan / zoom / camera =================== */
var viewport=$('viewport'), world=$('world'), dragcatch=$('dragcatch');
var panX=0,panY=0,zoom=0.9, follow=true, artifacts=[], ghosts=[];
var AW=440,AH=360,GAP=64, STAGE_Y=AH+GAP*1.7;
function apply(){world.style.transform='translate('+panX+'px,'+panY+'px) scale('+zoom+')'}
function nextX(){return artifacts.length*(AW+GAP)}
var camAnim=null;
function animateCamera(tx,ty,tz){
  if(camAnim)cancelAnimationFrame(camAnim);
  var sx=panX,sy=panY,sz=zoom,n=0,N=26;
  (function go(){n++;var k=n/N,e=1-Math.pow(1-k,3);panX=sx+(tx-sx)*e;panY=sy+(ty-sy)*e;zoom=sz+(tz-sz)*e;apply();if(n<N)camAnim=requestAnimationFrame(go)})();
}
function frameRect(x,y,w,h){
  var vw=viewport.clientWidth, vh=viewport.clientHeight, pad=70;
  var z=clamp(Math.min(vw/(w+pad*2),vh/(h+pad*2)),0.4,1.05);
  animateCamera(vw/2-(x+w/2)*z, vh/2-(y+h/2)*z, z);
}
function frameEl(el){frameRect(el.offsetLeft,el.offsetTop,el.offsetWidth,el.offsetHeight)}
function frameEls(els){var x=1e9,y=1e9,r=-1e9,b=-1e9;els.forEach(function(el){x=Math.min(x,el.offsetLeft);y=Math.min(y,el.offsetTop);r=Math.max(r,el.offsetLeft+el.offsetWidth);b=Math.max(b,el.offsetTop+el.offsetHeight)});frameRect(x,y,r-x,b-y)}
function fitAll(){var all=artifacts.concat(ghosts).map(function(a){return a.el}); follow=false; if(!all.length){animateCamera(viewport.clientWidth/2-220*0.9,40,0.9);return} frameEls(all)}
var dragging=false,lx=0,ly=0;
viewport.addEventListener('pointerdown',function(e){if(e.target.closest('.artifact'))return;dragging=true;follow=false;lx=e.clientX;ly=e.clientY;viewport.classList.add('grabbing');dragcatch.classList.add('on')});
window.addEventListener('pointermove',function(e){if(!dragging)return;panX+=e.clientX-lx;panY+=e.clientY-ly;lx=e.clientX;ly=e.clientY;apply()});
window.addEventListener('pointerup',function(){dragging=false;viewport.classList.remove('grabbing');dragcatch.classList.remove('on')});
viewport.addEventListener('wheel',function(e){e.preventDefault();follow=false;var rect=viewport.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top,wx=(mx-panX)/zoom,wy=(my-panY)/zoom;zoom=clamp(zoom*(e.deltaY<0?1.12:0.89),0.25,1.7);panX=mx-wx*zoom;panY=my-wy*zoom;apply()},{passive:false});
$('zoomIn').onclick=function(){follow=false;zoom=clamp(zoom*1.15,0.25,1.7);apply()};
$('zoomOut').onclick=function(){follow=false;zoom=clamp(zoom*0.87,0.25,1.7);apply()};
$('fitAll').onclick=fitAll;
$('follow').onclick=function(){follow=true;if(artifacts.length)frameEl(artifacts[artifacts.length-1].el)};

/* =================== artifacts =================== */
function createArtifact(o){
  $('emptyHint').style.display='none';
  var el=document.createElement('div');
  el.className='artifact building '+(o.side||'cer')+(o.variant?' variant':'')+(o.variant&&o.variant.recommended?' reco':'');
  el.style.left=o.x+'px'; el.style.top=o.y+'px';
  var chip = o.variant
      ? '<span class="art-vname">'+o.variant.name+(o.variant.recommended?' <i>&#9733;</i>':'')+'</span>'
      : '<span class="art-side'+(o.matching?' match':'')+'">'+(o.matching?('&#10003; '+o.matching):(o.side==='gpu'?'GPU':'Cerebras'))+'</span>';
  var overlay = o.variant?'<div class="pick-overlay"></div>':'';
  var foot = o.variant?'<div class="art-foot"><button class="use-btn">Use this design &rarr;</button></div>':'';
  el.innerHTML='<div class="art-head"><span class="art-badge">&#9670;</span>'+chip+'<span class="art-title">'+o.intent+'</span>'+(o.uses_screen?'<span class="art-screen">&#128247; screen</span>':'')+'<span class="art-time">&hellip;</span></div><div class="art-body"><div class="scan"></div><iframe sandbox="allow-scripts"></iframe>'+overlay+'</div>'+foot;
  world.appendChild(el);
  return {el:el,iframe:el.querySelector('iframe'),timeEl:el.querySelector('.art-time'),side:o.side};
}
function artDone(art,ms){art.el.classList.remove('building'); art.timeEl.textContent=(ms/1000).toFixed(2)+'s'}
function updCount(){$('acount').textContent=artifacts.length+(artifacts.length===1?' artifact':' artifacts')}

function streamP(art,src,totalMs,onTick,onDone){
  return new Promise(function(resolve){
    var steps=46, per=totalMs/steps, t0=performance.now(), my=runId, i=0, tps=totalMs<4000?1900:200;
    art.iframe.srcdoc='';
    (function step(){
      if(my!==runId){resolve();return;}
      i++; var to=Math.floor(src.length*i/steps);
      if(i%6===0||i===steps) art.iframe.srcdoc=src.slice(0,to);
      pulseProto(tps);
      if(onTick) onTick(performance.now()-t0,i/steps);
      if(i<steps) setTimeout(step,per); else{art.iframe.srcdoc=src; if(onDone)onDone(); resolve();}
    })();
  });
}

/* HUD */
function setHudLat(ms,locked){$('hudLat').textContent=(ms/1000).toFixed(2)+'s'; if(locked){$('hudLat').classList.add('flash');setTimeout(function(){$('hudLat').classList.remove('flash')},500);}}
function setHudState(s,cls){$('hudState').textContent=s;$('hudState').className='lat-state '+(cls||'go')}
function setSide(side,ms,cap,locked){
  $(side+'T').textContent=(ms/1000).toFixed(2)+'s'; $(side+'B').style.width=clamp(ms/cap*100,0,100)+'%';
  if(side==='gpu'&&!locked)$('gpuM').innerHTML='&#9612; generating&hellip; '+Math.round(2500*Math.min(1,ms/cap))+'/2500 tok';
  if(locked)$(side+'M').innerHTML='&#10003; rendered &middot; '+(side==='cer'?'1900':'200')+' tok/s';
}

/* =================== Design DNA (learned style) =================== */
function renderDNA(){
  if(!learnedTheme){
    $('dnaStatus').textContent='learning…'; $('dnaStatus').className='dna-status';
    $('dnaSw').innerHTML='<span class="ph">&mdash;</span>';
    $('dnaRows').innerHTML='<div class="dna-row"><span style="color:var(--dim)">awaiting your first pick</span></div>';
    $('dnaLearn').textContent='';
    return;
  }
  var T=learnedTheme;
  $('dnaStatus').textContent='learned · '+T.name; $('dnaStatus').className='dna-status on';
  $('dnaSw').innerHTML=[T.bg,T.surface,T.accent,T.accent2,T.ink].map(function(c){return '<i style="background:'+c+'"></i>'}).join('');
  $('dnaRows').innerHTML='<div class="dna-row"><span>Accent</span><b>'+T.name+'</b></div><div class="dna-row"><span>Radius</span><b>'+T.radius+'</b></div><div class="dna-row"><span>Density</span><b>'+T.density+'</b></div><div class="dna-row"><span>Type</span><b>'+T.typeLabel+'</b></div>';
  $('dnaLearn').innerHTML='&#9670; applied to every new build';
}
function learnStyle(tk){learnedKey=tk;learnedTheme=THEMES[tk];renderDNA();toast('Sidebar learned your style: <b>'+THEMES[tk].name+'</b> — future builds match your taste.')}
$('resetTaste').onclick=function(){if(busy)return;learnedKey=null;learnedTheme=null;renderDNA();toast('Forgot your style — the next build will explore fresh directions.')};

/* =================== build flows =================== */
async function fanOut(proto){
  fanning=true;
  var sx=nextX();
  var vs=FANOUT.map(function(tk,k){
    var a=createArtifact({x:sx+k*(AW+GAP),y:STAGE_Y,side:'cer',intent:proto.intent,uses_screen:proto.uses_screen,variant:{name:THEMES[tk].name,recommended:tk===RECOMMENDED}});
    a.theme=tk; return a;
  });
  if(follow) frameEls(vs.map(function(v){return v.el}));
  setHudState('generating 3 variants · parallel','go'); $('latSub').innerHTML='Cerebras &middot; <b>3 designs in parallel</b>';
  var ft=setInterval(function(){$('tpsProto').innerHTML=(5400+Math.round(Math.random()*600)).toLocaleString()+'<small> tok/s &times;3</small>'},120);
  await Promise.all(vs.map(function(v){return streamP(v,PROTO_BUILD[proto.build](THEMES[v.theme]),1850,(v===vs[0]?function(e){setHudLat(e,false)}:null),function(){artDone(v,1850)})}));
  clearInterval(ft);
  setHudLat(2000,true); setHudState('3 designs · pick one','ok');
  toast('<b>3 design languages</b> generated in parallel &mdash; pick one, Sidebar learns your taste.');
  $('stageBanner').classList.add('on');
  var chosen=await new Promise(function(resolve){
    var picked=false,left=4;
    function choose(v){if(picked)return;picked=true;clearInterval(iv);clearTimeout(au);resolve(v)}
    vs.forEach(function(v){
      v.el.querySelector('.pick-overlay').onclick=function(){choose(v)};
      v.el.querySelector('.use-btn').onclick=function(e){e.stopPropagation();choose(v)};
      v.el.addEventListener('mouseenter',function(){v.el.classList.add('hl')});
      v.el.addEventListener('mouseleave',function(){v.el.classList.remove('hl')});
    });
    $('stageCount').textContent=left;
    var iv=setInterval(function(){left--;$('stageCount').textContent=Math.max(0,left);if(left<=0)clearInterval(iv)},1000);
    var au=setTimeout(function(){choose(vs.filter(function(v){return v.theme===RECOMMENDED})[0]||vs[0])},4200);
  });
  $('stageBanner').classList.remove('on'); fanning=false;
  vs.forEach(function(v){if(v!==chosen){v.el.classList.add('dismiss');setTimeout(function(){v.el.remove()},420)}});
  var ov=chosen.el.querySelector('.pick-overlay'); if(ov)ov.remove();
  var fo=chosen.el.querySelector('.art-foot'); if(fo)fo.remove();
  var vn=chosen.el.querySelector('.art-vname'); if(vn)vn.outerHTML='<span class="art-side match">&#10003; '+THEMES[chosen.theme].name+'</span>';
  chosen.el.classList.remove('variant','reco');
  artifacts.push(chosen); updCount();
  requestAnimationFrame(function(){chosen.el.style.left=nextXFor(artifacts.length-1)+'px';chosen.el.style.top='0px'});
  if(follow) setTimeout(function(){frameEl(chosen.el)},470);
  $('latSub').innerHTML='Cerebras &middot; <b>~1900 tok/s</b>';
  return chosen.theme;
}
function nextXFor(i){return i*(AW+GAP)}

async function runBuild(proto){
  busy=true;
  var build=proto.build;
  if(abMode){
    $('canvasCol').classList.add('ab');
    var th=learnedTheme||THEMES.midnight, src=PROTO_BUILD[build](th), x=nextX();
    var cer=createArtifact({x:x,y:0,side:'cer',intent:proto.intent,uses_screen:proto.uses_screen});
    var gpu=createArtifact({x:x,y:AH+GAP,side:'gpu',intent:proto.intent,uses_screen:proto.uses_screen});
    artifacts.push(cer); ghosts.push(gpu); updCount();
    if(follow) frameEls([cer.el,gpu.el]);
    var t0=performance.now(),cerCap=1780,gpuCap=9200,my=runId,lc=false,lg=false;
    $('cerB').style.width='0%';$('gpuB').style.width='0%';
    (function tl(){if(my!==runId)return;var e=performance.now()-t0;if(!lc)setSide('cer',Math.min(e,cerCap),cerCap,false);if(!lg)setSide('gpu',Math.min(e,gpuCap),gpuCap,false);if(e<gpuCap)requestAnimationFrame(tl)})();
    await Promise.all([
      streamP(cer,src,cerCap,null,function(){lc=true;setSide('cer',cerCap,cerCap,true);artDone(cer,cerCap)}),
      streamP(gpu,src,gpuCap,null,function(){lg=true;setSide('gpu',gpuCap,gpuCap,true);artDone(gpu,gpuCap)})
    ]);
    toast('<b>'+(gpuCap/cerCap).toFixed(1)+'&times;</b> faster &mdash; Cerebras rendered while the idea was still in the room.');
  } else if(!learnedTheme){
    $('canvasCol').classList.remove('ab');
    var tk=await fanOut(proto);
    learnStyle(tk);
  } else {
    $('canvasCol').classList.remove('ab');
    var art=createArtifact({x:nextX(),y:0,side:'cer',intent:proto.intent,uses_screen:proto.uses_screen,matching:learnedTheme.name});
    artifacts.push(art); updCount();
    if(follow) frameEl(art.el);
    setHudState('generating · matching your style','go');
    await streamP(art,PROTO_BUILD[build](learnedTheme),1800,function(e){setHudLat(e,false)},function(){setHudLat(1800,true);setHudState('✓ matched your learned style','ok');artDone(art,1800)});
  }
  busy=false;
}

/* =================== ambient engine =================== */
var sec=0, clockTimer=null;
function startClock(){sec=0;clearInterval(clockTimer);clockTimer=setInterval(function(){sec++;$('clock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')},1000)}
function toast(html){var t=$('toast');t.innerHTML=html;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('show')},3800)}

function resetScene(scn){
  runId++; busy=false; fanning=false;
  $('mtg').textContent=scn.title;
  transEl.innerHTML=''; pendingEl=null;
  $('sTldr').textContent='Listening…';
  ['sDec','sAct','sOpen'].forEach(function(id){$(id).innerHTML='<li class="empty" style="list-style:none">—</li>'});
  $('fact').innerHTML='<div class="empty">No checkable claims yet.</div>';
  world.innerHTML=''; artifacts=[]; ghosts=[]; $('emptyHint').style.display=''; updCount();
  $('canvasCol').classList.remove('ab'); $('stageBanner').classList.remove('on');
  $('hudLat').textContent='0.00s'; $('hudState').textContent='standby'; $('hudState').className='lat-state'; $('latSub').innerHTML='Cerebras &middot; <b>~1900 tok/s</b>';
  panX=0;panY=0;zoom=0.9;follow=true;apply();
  ['Router','Sum','Proto'].forEach(function(n){$('tps'+n).innerHTML='0<small> tok/s</small>'});
  renderDNA();   // keeps learnedTheme — that's the point
}

async function play(idx){
  curScn=idx; var scn=FIX[idx];
  document.querySelectorAll('.pill').forEach(function(p,i){p.classList.toggle('active',i===idx)});
  resetScene(scn); startClock();
  var my=runId; await sleep(450);
  for(var s=0;s<scn.segments.length;s++){
    if(my!==runId)return;
    var seg=scn.segments[s];
    if(seg.partials){for(var p=0;p<seg.partials.length;p++){if(my!==runId)return;await partial(seg.speaker,seg.partials[p])}}
    await say(seg.speaker,seg.text,seg.ms);
    if(my!==runId)return;
    if(seg.expect){
      var ex=seg.expect;
      if(ex.router) routerLine(ex.router);
      await sleep(170);
      if(ex.summary) setSummary(ex.summary);
      if(ex.factcheck) await factCheck(ex.factcheck);
      if(ex.prototype){ await runBuild(ex.prototype); if(my!==runId)return; await sleep(450); }
    }
  }
  if(my===runId) toast('Meeting captured &mdash; <b>'+artifacts.length+'</b> prototypes, all in your learned style.');
}

/* =================== speed canvas =================== */
var speed=(function(){
  var cv=$('speed'), ctx=cv.getContext('2d'), parts=[], boost={router:0,sumr:0,proto:0,gpu:0}, t=0;
  function size(){var r=cv.getBoundingClientRect();cv.width=r.width*devicePixelRatio;cv.height=r.height*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
  function spawn(col,sp,y){parts.push({x:-4,y:y,vx:sp,col:col,a:.5+Math.random()*.5,r:.6+Math.random()*1.5})}
  function loop(){
    t++; var w=cv.getBoundingClientRect().width,h=cv.getBoundingClientRect().height; ctx.clearRect(0,0,w,h);
    var act=Math.max(boost.proto,boost.sumr,boost.router);
    if(!abMode){var rate=1+act/8;for(var i=0;i<rate;i++){if(Math.random()<.9)spawn('#4dffd2',1.2+act/14,h*.5+(Math.random()*16-8))}}
    else{if(t%2===0)spawn('#4dffd2',3.4,h*.34+(Math.random()*8-4));if(t%9===0)spawn('#ff5f56',.7,h*.7+(Math.random()*8-4))}
    for(var k in boost)boost[k]*=.94;
    for(var p=parts.length-1;p>=0;p--){var o=parts[p];o.x+=o.vx;ctx.globalAlpha=o.a;ctx.fillStyle=o.col;ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,7);ctx.fill();ctx.globalAlpha=o.a*.25;ctx.fillRect(o.x-o.vx*3,o.y-.4,o.vx*3,.8);if(o.x>w+6)parts.splice(p,1)}
    ctx.globalAlpha=1; if(parts.length>800)parts.splice(0,parts.length-800);
    requestAnimationFrame(loop);
  }
  window.addEventListener('resize',size); size(); loop();
  return {boost:function(a,tps){boost[a]=Math.min(60,tps/32)}};
})();

/* =================== controls =================== */
(function buildPills(){
  var wrap=$('scenarios');
  FIX.forEach(function(s,i){var b=document.createElement('button');b.className='pill'+(i===0?' active':'');b.innerHTML=s.title+'<small>'+s.subtitle+'</small>';b.onclick=function(){play(i)};wrap.appendChild(b)});
})();
$('replay').onclick=function(){play(curScn)};
$('abchk').addEventListener('change',function(e){abMode=e.target.checked;toast(abMode?'A/B race armed &mdash; the <b>next build</b> runs Cerebras vs GPU.':'A/B race off.')});

renderDNA();
window.addEventListener('load',function(){setTimeout(function(){play(0)},650)});
