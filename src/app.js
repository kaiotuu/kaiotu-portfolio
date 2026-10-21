(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const data=JSON.parse($('#data').textContent),root=document.documentElement;

/* theme: initial value is set by an inline <head> script (no flash) */
const tb=$('#theme'),tc=$('meta[name=theme-color]');
const applyTheme=t=>{root.dataset.theme=t;tb.setAttribute('aria-label',t==='dark'?'Switch to light theme':'Switch to dark theme');tc.content=t==='dark'?'#000000':'#ffffff'};
applyTheme(root.dataset.theme||'dark');
tb.onclick=()=>{const t=root.dataset.theme==='dark'?'light':'dark';applyTheme(t);try{localStorage.setItem('kt-theme',t)}catch{}};
matchMedia('(prefers-color-scheme:light)').addEventListener('change',e=>{let s=null;try{s=localStorage.getItem('kt-theme')}catch{}if(!s)applyTheme(e.matches?'light':'dark')});

/* menu */
const menu=$('#menu'),scrim=$('#scrim'),burger=$('#burger');
const setMenu=(o,focus=true)=>{menu.classList.toggle('open',o);scrim.classList.toggle('open',o);burger.setAttribute('aria-expanded',o);
  menu.inert=!o;if(o)$('#menu-close').focus();else if(focus&&menu.contains(document.activeElement))burger.focus()};
menu.inert=true;
burger.onclick=()=>setMenu(true);$('#menu-close').onclick=scrim.onclick=()=>setMenu(false);
menu.addEventListener('click',e=>{if(e.target.closest('a'))setMenu(false,false)});

/* contact panel: small, non-modal, closes with its button or Esc */
const cp=$('#cpanel'),cbtn=$('#contact-btn');let cpFrom=null;
const setPanel=o=>{cp.classList.toggle('on',o);cp.inert=!o;cbtn.setAttribute('aria-expanded',o);
  if(o){cpFrom=document.activeElement;$('#cp-close').focus()}else if(cp.contains(document.activeElement)||document.activeElement===document.body){(cpFrom&&cpFrom.isConnected?cpFrom:cbtn).focus()}};
cp.inert=true;
cbtn.onclick=()=>setPanel(!cp.classList.contains('on'));$('#cp-close').onclick=()=>setPanel(false);

/* menu sheet: drag it away to the right. 1:1 tracking, rubber-band on the wrong side,
   and the release velocity is projected to decide where it lands. */
const project=v=>v/1e3*.99/(1-.99),rubber=(o,d)=>o*d*.55/(d+.55*Math.abs(o));
let dg=null;
menu.addEventListener('pointerdown',e=>{if(!menu.classList.contains('open')||e.target.closest('a,button'))return;
  dg={id:e.pointerId,x:e.clientX,lx:e.clientX,lt:e.timeStamp,v:0,dx:0,on:false}});
menu.addEventListener('pointermove',e=>{if(!dg||e.pointerId!==dg.id)return;
  let dx=e.clientX-dg.x;if(!dg.on){if(Math.abs(dx)<10)return;dg.on=true;menu.setPointerCapture(e.pointerId);menu.style.transition='none'}
  const dt=e.timeStamp-dg.lt;if(dt>0)dg.v=(e.clientX-dg.lx)/dt*1e3;dg.lx=e.clientX;dg.lt=e.timeStamp;
  dg.dx=dx;menu.style.transform=`translateX(${dx>0?dx:-rubber(-dx,menu.offsetWidth)}px)`});
const endDrag=e=>{if(!dg||e.pointerId!==dg.id)return;const d=dg;dg=null;if(!d.on)return;
  const v=e.timeStamp-d.lt>100?0:d.v; /* a held finger has no momentum */
  menu.style.transition='';const close=d.dx+project(v)>menu.offsetWidth*.4;
  menu.style.transform='';setMenu(!close?true:false)};
menu.addEventListener('pointerup',endDrag);menu.addEventListener('pointercancel',endDrag);
cp.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();setPanel(false)}});
$$('[data-open-contact]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();setMenu(false,false);setPanel(true)}));
addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open'))setMenu(false)});

/* copy buttons (Discord username) */
document.addEventListener('click',async e=>{const b=e.target.closest('.copy');if(!b)return;
  const v=b.dataset.copy;let ok=false;
  try{await navigator.clipboard.writeText(v);ok=true}catch{
    const t=document.createElement('textarea');t.value=v;t.style.cssText='position:fixed;opacity:0';document.body.append(t);t.select();try{ok=document.execCommand('copy')}catch{}t.remove()}
  $('#live').textContent=ok?v+' copied to clipboard':'Copy failed';
  if(b.querySelector('svg')){b.classList.add('ok');setTimeout(()=>b.classList.remove('ok'),1600);return}
  const old=b.dataset.l||(b.dataset.l=b.textContent);b.textContent=ok?(b.dataset.done||'Copied'):'Copy failed';
  setTimeout(()=>{b.textContent=old},1600)});

/* gallery: one category at a time, 3 cards per row, 2 rows. With more than 6, the third row peeks out under a fade;
   "View all" opens everything, switching category resets it. */
const cats=$$('.cat'),tabs=$$('[role=tab]');let view=(cats.find(c=>!c.hidden)||cats[0]).dataset.cat,expanded=false;
const fit=c=>{const g=$('.gw',c),r=$('.row',c),vis=+c.dataset.vis,items=[...r.children];
  const clip=!expanded&&items.length>vis;g.classList.toggle('peek',clip);
  items.forEach((li,i)=>li.inert=clip&&i>=vis);
  if(!clip){g.style.maxHeight='';return}
  const t=items[vis],th=$('.thumb',t);g.style.maxHeight=(t.offsetTop-r.offsetTop+Math.round(th.offsetHeight*.34))+'px'};
const render=()=>{tabs.forEach(t=>t.setAttribute('aria-selected',t.dataset.cat===view));
  cats.forEach(c=>{const on=c.dataset.cat===view;c.hidden=!on;if(!on)return;
    const b=$('.viewall',c);
    if(b){b.setAttribute('aria-expanded',expanded);b.textContent=expanded?'Show less':`View all (${c.dataset.n})`}
    fit(c)})};
tabs.forEach(t=>t.onclick=()=>{view=t.dataset.cat;expanded=false;render()});
cats.forEach(c=>{const v=$('.viewall',c);if(v)v.onclick=()=>{expanded=!expanded;render();if(!expanded)$('.tabs').scrollIntoView({block:'start'})}});
addEventListener('resize',()=>cats.forEach(c=>!c.hidden&&fit(c)));
addEventListener('load',()=>cats.forEach(c=>!c.hidden&&fit(c)));
render();

/* viewer: full-size images are only created when a piece is opened */
const dlg=$('#viewer'),vimg=$('#v-img'),vcount=$('#v-count'),vmeta=$('#v-meta'),prev=$('#v-prev'),next=$('#v-next');
let seq=[],pos=0,opener=null;
const show=()=>{resetZoom();const{it,k}=seq[pos],w=it.imgs[k];vimg.src=w.src;vimg.alt=w.alt||it.t||'3D artwork by kaiotu';
  if(w.w)vimg.width=w.w,vimg.height=w.h;
  const many=seq.length>1;prev.hidden=next.hidden=!many;vcount.textContent=many?`${pos+1} / ${seq.length}`:'';
  vmeta.textContent='';
  if(it.t){const b=document.createElement('b');b.textContent=it.t;vmeta.append(b)}
  const rest=[it.d,it.s,it.dt].filter(Boolean).join(' · ');
  if(rest)vmeta.append((it.t?' — ':'')+rest);
  if(many){const n=seq[(pos+1)%seq.length];new Image().src=n.it.imgs[n.k].src}};
const go=d=>{pos=(pos+d+seq.length)%seq.length;show()};
/* arrows and swipes move through the pieces of the section that was opened (a category, or Recent Work) */
$$('.thumb[data-i]').forEach(b=>b.onclick=()=>{
  const root=b.closest('.cat')||b.closest('#recent')||document,ids=[...new Set($$('.thumb[data-i]',root).map(x=>+x.dataset.i))];
  seq=[];ids.forEach(i=>data.items[i].imgs.forEach((_,k)=>seq.push({it:data.items[i],k})));
  const me=data.items[+b.dataset.i];pos=Math.max(0,seq.findIndex(s=>s.it===me&&s.k===0));opener=b;show();dlg.showModal();dlg.focus()});
prev.onclick=()=>go(-1);next.onclick=()=>go(1);$('#v-close').onclick=()=>dlg.close();
dlg.addEventListener('keydown',e=>{if(seq.length>1){if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)}});
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
dlg.addEventListener('close',()=>{resetZoom();vimg.removeAttribute('src');opener&&opener.focus()});
/* zoom: click/tap the image to zoom in at that spot, click again to zoom out; drag to move when zoomed;
   at 100% a horizontal swipe moves to the next/previous image. */
const stage=$('#v-stage'),ZOOM=2.5;
let S=1,TX=0,TY=0,pan=null,sw=null;
const clampT=()=>{const w=vimg.offsetWidth*S,h=vimg.offsetHeight*S,sr=stage.getBoundingClientRect();
  const mx=Math.max(0,(w-sr.width)/2),my=Math.max(0,(h-sr.height)/2);TX=Math.min(mx,Math.max(-mx,TX));TY=Math.min(my,Math.max(-my,TY))};
const paint1=()=>{clampT();vimg.style.transform=S===1?'':`translate(${TX}px,${TY}px) scale(${S})`;stage.classList.toggle('zoomed',S>1)};
const zoomTo=(s,cx,cy)=>{const r=stage.getBoundingClientRect(),px=cx-(r.left+r.width/2),py=cy-(r.top+r.height/2);
  TX=px-(px-TX)*(s/S);TY=py-(py-TY)*(s/S);S=s;if(S===1){TX=TY=0}paint1()};
const resetZoom=()=>{S=1;TX=TY=0;pan=sw=pinch=null;pts.clear();vimg.style.transform='';stage.classList.remove('zoomed','panning','pinching')};
const pts=new Map();let pinch=null,noTap=false;
const dist=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y)||1},mid=()=>{const [a,b]=[...pts.values()];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
stage.addEventListener('pointerdown',e=>{if(e.target.closest('.vnav')||e.button)return;stage.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pts.size===2){pan=sw=null;noTap=true;pinch={d:dist(),s:S,m:mid()};stage.classList.add('pinching');stage.classList.remove('panning');return}
  if(pts.size>2)return;noTap=false;
  if(S>1){pan={x:e.clientX,y:e.clientY,tx:TX,ty:TY};stage.classList.add('panning')}else sw={x:e.clientX,y:e.clientY,t:e.timeStamp}});
stage.addEventListener('pointermove',e=>{if(pts.has(e.pointerId))pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pts.size>=2){const m=mid(),ns=Math.min(6,Math.max(1,pinch.s*dist()/pinch.d));zoomTo(ns,m.x,m.y);TX+=m.x-pinch.m.x;TY+=m.y-pinch.m.y;pinch.m=m;paint1();return}
  if(pan){TX=pan.tx+e.clientX-pan.x;TY=pan.ty+e.clientY-pan.y;paint1()}});
const up=e=>{
  const wasPinch=!!pinch;pts.delete(e.pointerId);
  if(wasPinch){if(pts.size<2){pinch=null;stage.classList.remove('pinching');if(S<1.05)resetZoom();
    if(pts.size===1&&S>1){const [r]=[...pts.values()];pan={x:r.x,y:r.y,tx:TX,ty:TY};stage.classList.add('panning')}}return}
  if(pan){const moved=Math.hypot(e.clientX-pan.x,e.clientY-pan.y)>6;pan=null;stage.classList.remove('panning');
    if(!moved&&e.type==='pointerup'&&!noTap)zoomTo(1,e.clientX,e.clientY);return}
  if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y,v=dx/(e.timeStamp-sw.t||1)*1e3;sw=null;if(e.type!=='pointerup'||noTap)return;
  if(Math.abs(dx)<6&&Math.abs(dy)<6)zoomTo(ZOOM,e.clientX,e.clientY);
  else if(seq.length>1&&Math.abs(dx)>Math.abs(dy)*1.5&&Math.abs(dx+v*.12)>60)go(dx<0?1:-1)};
stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
vimg.addEventListener('load',paint1);

/* recent work: relative ages ("2H", "3 DAYS", "1 MONTH"), refreshed every minute */
const ago=(t,p)=>{const s=Math.max(0,(Date.now()-t)/1e3),m=s/60,h=m/60,d=h/24,mo=d/30.44,y=d/365.25,n=(v,u)=>{v=Math.floor(v);return v+' '+u+(v>1?'S':'')};
  if(p==='month')return mo<1?'THIS MONTH':(y>=1?n(y,'YEAR'):n(mo,'MONTH'))+' AGO';
  if(p==='day'&&d<1)return 'TODAY';
  if(m<1)return 'JUST NOW';if(m<60)return Math.floor(m)+' MIN AGO';if(h<24)return Math.floor(h)+'H AGO';if(d<7)return n(d,'DAY')+' AGO';if(d<30.44)return n(d/7,'WEEK')+' AGO';if(y>=1)return n(y,'YEAR')+' AGO';return n(mo,'MONTH')+' AGO'};
const tick1=()=>$$('time.rel').forEach(e=>{e.textContent=ago(+e.dataset.t,e.dataset.p)});
tick1();setInterval(tick1,6e4);

/* recent work: continuous drift that loops without a jump (one hidden copy of the list).
   Pause/Play; arrows appear while paused; mouse drag + touch swipe work any time. */
const strip=$('#strip'),pb=$('#rpause'),tools=$('#rtools'),rp=$('#rprev'),rn=$('#rnext');
if(strip&&strip.scrollWidth>strip.clientWidth+8){
  const ul=$('ul',strip),rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const base=[...ul.children],w0=ul.scrollWidth+16,K=Math.max(3,Math.ceil(strip.clientWidth/w0)+2); // K copies: we always rest in the 2nd one
  for(let k=1;k<K;k++)base.forEach(li=>{const c=li.cloneNode(true);c.setAttribute('aria-hidden','true');c.setAttribute('inert','');c.dataset.clone='';
    const b=$('button',c);b&&(b.removeAttribute('data-i'),b.tabIndex=-1);ul.append(c)});
  const h=()=>w0; // width of one copy incl. gap
  let run=!rm,hold=false,seen=false,pos=h(),last=0,raf=0,idle=0,rs=0;
  strip.scrollLeft=pos;
  const wrap=()=>{if(strip.scrollLeft>=2*h()){strip.scrollLeft-=h()}else if(strip.scrollLeft<h()){strip.scrollLeft+=h()}pos=strip.scrollLeft};
  const tick=t=>{raf=0;if(!run||hold||!seen){last=0;return}
    if(last){pos+=(t-last)*SPEED/1e3;if(pos>=2*h())pos-=h();strip.scrollLeft=pos}
    last=t;raf=requestAnimationFrame(tick)};
  const SPEED=22; // px per second
  const kick=()=>{if(!raf&&run&&!hold&&seen){pos=strip.scrollLeft;last=0;raf=requestAnimationFrame(tick)}};
  const sync=()=>{pb.textContent=run?'Pause':'Play';pb.setAttribute('aria-pressed',!run);pb.setAttribute('aria-label',run?'Pause automatic scrolling':'Play automatic scrolling');rp.hidden=rn.hidden=run};
  const hold1=v=>{hold=v;if(!v)kick()};
  const step=()=>(ul.firstElementChild.offsetWidth+16)*2;
  tools.hidden=false;sync();strip.parentElement.classList.add('live');
  pb.onclick=()=>{run=!run;sync();kick()};
  rp.onclick=()=>strip.scrollBy({left:-step(),behavior:'smooth'});rn.onclick=()=>strip.scrollBy({left:step(),behavior:'smooth'});
  strip.addEventListener('scroll',()=>{clearTimeout(idle);idle=setTimeout(()=>{if(!raf)wrap()},140)},{passive:true});
  strip.addEventListener('mouseenter',()=>hold1(true));strip.addEventListener('mouseleave',()=>{hold1(false)});
  strip.addEventListener('focusin',()=>hold1(true));strip.addEventListener('focusout',()=>hold1(false));
  strip.addEventListener('touchstart',()=>{hold=true},{passive:true});
  strip.addEventListener('touchend',()=>{clearTimeout(rs);rs=setTimeout(()=>hold1(false),1800)},{passive:true});
  strip.addEventListener('wheel',()=>{pos=strip.scrollLeft},{passive:true});
  /* mouse drag (click-through suppressed once it moved) */
  let d=null,moved=false;
  strip.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button)return;d={x:e.clientX,s:strip.scrollLeft};moved=false});
  addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x;if(!moved&&Math.abs(dx)>5){moved=true;strip.classList.add('drag')}if(moved){strip.scrollLeft=d.s-dx;pos=strip.scrollLeft}});
  addEventListener('pointerup',()=>{if(d){d=null;strip.classList.remove('drag');pos=strip.scrollLeft}});
  strip.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault();moved=false}},true);
  new IntersectionObserver(([e])=>{seen=e.isIntersecting;if(seen)kick()}).observe(strip);
  if(rm){hold=true}
}

/* contributions: baked in at build time; refreshed from the edge function only
   when something is missing or older than a day, at most once per 6h per browser. */
const cards=$$('.x[data-id]'),nf=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1});
const stale=data.expUpdated?Date.now()-data.expUpdated>864e5:true;
const missing=cards.some(c=>c.dataset.ok!=='1');
const paint=list=>list.forEach(e=>{const c=cards.find(x=>x.dataset.id===e.id);if(!c||!e.resolved)return;
  $('h3',c).textContent=e.name;
  if(typeof e.visits==='number')$('.vis',c).textContent=nf.format(e.visits)+' Visits';
  const a=$('a.card',c),go=$('.go',c);if(e.url){a.href=e.url;a.target='_blank';a.rel='noopener';go.hidden=false}
  if(e.thumb&&!$('.im img',c)){const i=new Image();i.src=e.thumb;i.alt='';i.loading='lazy';i.width=768;i.height=432;$('.im',c).append(i);$('.ph',c)?.remove()}});
if((missing||stale)&&location.protocol.startsWith('http')){
  let c=null;try{c=JSON.parse(localStorage.getItem('kt-exp'))}catch{}
  if(c&&Date.now()-c.t<216e5)paint(c.items);
  else fetch('/api/experiences').then(r=>r.ok?r.json():Promise.reject()).then(j=>{paint(j.items);try{localStorage.setItem('kt-exp',JSON.stringify({t:Date.now(),items:j.items}))}catch{}}).catch(()=>{});
}

/* Discord: on desktop try the app first, fall back to the web profile; phones use the https link (universal link) */
$$('a[data-app]').forEach(a=>a.addEventListener('click',e=>{
  if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1)return;
  e.preventDefault();let left=false;const mark=()=>{left=true};
  addEventListener('blur',mark,{once:true});document.addEventListener('visibilitychange',mark,{once:true});
  const f=document.createElement('iframe');f.hidden=true;f.src=a.dataset.app;document.body.append(f);
  setTimeout(()=>{f.remove();if(!left)window.open(a.href,'_blank','noopener')},1200)}));
})();
