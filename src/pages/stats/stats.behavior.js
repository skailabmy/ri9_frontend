/* RI9 · STATS SCREEN logic — ported verbatim from the prototype
   (references/index.html, #s-stats block). The prototype was a
   hash-navigated single document; here the stats screen is its
   own page, so nav('home') becomes a real redirect to index.html.

   UI only for now — like the reference, the numbers are seeded
   mock data (rng). When real stats endpoints (accuracy, daily
   averages, weekly activity) land, swap the bodies of subjStats,
   cxAgg, weekCount and statsCard. */
export function mount() {

  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $=s=>document.querySelector(s), root=document.documentElement;
  const replay=(el,c)=>{if(reduce)return;el.classList.remove(c);void el.offsetWidth;el.classList.add(c)};

  /* ===================== SFX ENGINE (synthesised, no files) ===================== */
  const SFX=(()=>{let ctx=null,out=null,on=true,nb=null;try{on=localStorage.getItem('sfx')!=='0'}catch(_){}
    function init(){if(ctx)return ctx;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;ctx=new AC();
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;out=ctx.createGain();out.gain.value=.6;out.connect(comp);comp.connect(ctx.destination);return ctx}
    const unlock=()=>{const c=init();if(c&&c.state==='suspended')c.resume()};
    ['pointerdown','touchend','keydown'].forEach(ev=>addEventListener(ev,unlock,{passive:true,capture:true}));
    const ok=()=>on&&ctx&&ctx.state==='running';
    function tone(f,o={}){if(!ok())return;const{t=0,d=.12,type='sine',v=.3,to=null,a=.004}=o,t0=ctx.currentTime+t,os=ctx.createOscillator(),g=ctx.createGain();
      os.type=type;os.frequency.setValueAtTime(f,t0);if(to)os.frequency.exponentialRampToValueAtTime(to,t0+d);
      g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(v,t0+a);g.gain.exponentialRampToValueAtTime(.0001,t0+d);os.connect(g);g.connect(out);os.start(t0);os.stop(t0+d+.03)}
    function nz(o={}){if(!ok())return;const{t=0,d=.15,v=.2,f=2000,to=null,q=1,type='bandpass'}=o,t0=ctx.currentTime+t;
      if(!nb){nb=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const x=nb.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=Math.random()*2-1}
      const s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=nb;fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f,t0);if(to)fl.frequency.exponentialRampToValueAtTime(to,t0+d);
      g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.0001,t0+d);s.connect(fl);fl.connect(g);g.connect(out);s.start(t0);s.stop(t0+d+.03)}
    const P={
      tap(){tone(1650,{d:.035,type:'triangle',v:.1,to:1100})},
      whoosh(){nz({d:.24,v:.09,f:500,to:3200,q:.7})}, // screen-transition swoosh (back nav) — same as reference
      pop(){tone(380,{d:.1,v:.28,to:880})},
      tick(){tone(1400,{d:.025,type:'square',v:.04})}
    };
    return{play(k,...a){try{P[k]&&P[k](...a)}catch(_){}},get on(){return on},set(v){on=!!v;try{localStorage.setItem('sfx',on?'1':'0')}catch(_){}}};
  })();
  window.SFX=SFX;
  const buzz=()=>{SFX.play('tap');try{navigator.vibrate&&navigator.vibrate(10)}catch(e){}};

  /* ---------- stage fit (390×820 scaled to viewport) ---------- */
  function fit(){const vp=$('#vp'),vw=vp.clientWidth,vh=vp.clientHeight;
    let s=Math.min(vw/390,vh/812,1.5);const W=Math.min(vw/s,520),H=vh/s;
    root.style.setProperty('--s',s.toFixed(4));root.style.setProperty('--W',W.toFixed(1));root.style.setProperty('--H',H.toFixed(1));
    root.style.setProperty('--ox',((vw-W*s)/2).toFixed(1)+'px');}
  fit();addEventListener('resize',fit);window.visualViewport&&visualViewport.addEventListener('resize',fit);

  /* ---------- speed streaks on the arena backdrop ---------- */
  document.querySelectorAll('.emb').forEach(cv=>{
    const x=cv.getContext('2d');let W=0,H=0,P=[],last=0;
    function size(){const d=Math.min(2,devicePixelRatio||1);W=cv.offsetWidth;H=cv.offsetHeight;cv.width=W*d;cv.height=H*d;x.setTransform(d,0,0,d,0,0)}
    function spawn(init){const lime=Math.random()<.28,len=40+Math.random()*150;
      return{x:init?Math.random()*(W+len):W+len*Math.random(),y:Math.random()*H,len,v:5+Math.random()*9+(len/40),w:lime?1.6+Math.random():0.8+Math.random()*1.2,lime,a:lime?.45+Math.random()*.3:.09+Math.random()*.09}}
    function draw(dt){x.clearRect(0,0,W,H);x.lineCap='round';
      P.forEach(p=>{p.x-=p.v*dt;const g=x.createLinearGradient(p.x,0,p.x+p.len,0);const c=p.lime?'154,206,24':'27,28,25';
        g.addColorStop(0,`rgba(${c},${p.a})`);g.addColorStop(1,`rgba(${c},0)`);x.strokeStyle=g;x.lineWidth=p.w;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(p.x+p.len,p.y);x.stroke()});
      P=P.filter(p=>p.x+p.len>-10);while(P.length<42)P.push(spawn(false))}
    function f(t){const dt=last?Math.min(3,(t-last)/16.7):1;last=t;
      if(!W||W!==cv.offsetWidth){size();P=Array.from({length:42},()=>spawn(true))}
      if(reduce){if(!cv._drawn){draw(0);cv._drawn=1}}else draw(dt);
      requestAnimationFrame(f)}
    addEventListener('resize',()=>{W=0});requestAnimationFrame(f);
  });

  /* ---------- toast ---------- */
  let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),1700)}
  window.toast=toast;

  /* ---------- helpers (ported from the prototype) ---------- */
  /* entity map built with unicode escapes so the literal sequences
     '&' etc. survive any HTML-aware tooling around here */
  const EMAP={'\u0026':'\u0026amp;','\u003c':'\u0026lt;','\u003e':'\u0026gt;','"':'\u0026quot;',"'":'\u0026#39;'};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>EMAP[c]);
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function countUpAll(rootEl,delay){rootEl.querySelectorAll('[data-count]').forEach(el=>{const to=+el.dataset.count;if(reduce){el.textContent=to.toLocaleString();return}const t0=performance.now()+(delay||0);el.textContent='0';(function f(t){const p=Math.max(0,Math.min(1,(t-t0)/1000)),e=1-Math.pow(1-p,3);el.textContent=Math.round(to*e).toLocaleString();if(p<1)requestAnimationFrame(f)})(performance.now())})}

  /* =================== STATS =================== */

  /* subjects — the reference prototype's mock list, verbatim
     (references/index.html). Real stats endpoints don't exist yet;
     swap this list when the API can supply per-subject stats. */
  const SUBJ=[
    {name:'Mathematics',ico:`<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M5.5 5.5l3 3M8.5 5.5l-3 3"/><rect x="13" y="3" width="8" height="8" rx="2"/><path d="M15 7h4"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M7 15v4M5 17h4"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M15 17h4"/><circle class="f" cx="17" cy="15" r=".9"/><circle class="f" cx="17" cy="19" r=".9"/>`},
    {name:'English',ico:`<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8 13l2.5-6 2.5 6M8.8 11.2h3.4"/><path d="M14.5 7v6h1.8a1.5 1.5 0 0 0 0-3h-1.8 1.5a1.5 1.5 0 0 0 0-3z"/>`},
    {name:'Bahasa Melayu',ico:`<path d="M3 5h18v11h-9l-5 4v-4H3z"/><path d="M6.5 8v5h2a1.25 1.25 0 0 0 0-2.5h-2 1.6a1.25 1.25 0 0 0 0-2.5z"/><path d="M12 13V8l2.5 3L17 8v5"/>`},
    {name:'Science',ico:`<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/><circle class="f" cx="10.5" cy="17" r="1"/><circle class="f" cx="14" cy="18.2" r=".8"/>`}
  ];

  /* complexity twists (ported from the prototype's SETS.TW —
     the drill engine that logs real twist accuracy comes later) */
  const TW={
    long:{n:'Wordy',d:'Same skill, longer question to read',i:'<path d="M4 6h16M4 10h16M4 14h16M4 18h9"/>'},
    close:{n:'Close call',d:'Answers look almost the same',i:'<path d="M4 9c2.7-2.7 5.3 2.7 8 0s5.3-2.7 8 0M4 15c2.7-2.7 5.3 2.7 8 0s5.3-2.7 8 0"/>'},
    multi:{n:'Multi-step',d:'Two steps to reach the answer',i:'<path d="M4 19h5v-5h5V9h5V4"/>'},
    noise:{n:'Extra info',d:'Spot what matters, ignore the rest',i:'<circle cx="10.5" cy="10.5" r="6"/><path d="M20 20l-5-5M8 10.5h5"/>'}
  };
  const TWK=['long','close','multi','noise'];
  const NEED=6; // questions in the last 7 days a prize unlock needs (prototype: SETS.NEED)
  const ico=t=>`<svg viewBox="0 0 24 24">${TW[t].i}</svg>`;

  const SCOL=[{sc:'#e4f8a8',sd:'#8fc914',ed:'#c3e46a'},{sc:'#dff1ff',sd:'#4fb3f5',ed:'#bfe3ff'},{sc:'#fff0d6',sd:'#ffae2e',ed:'#f3d68a'},{sc:'#ece9ff',sd:'#8f7cff',ed:'#d5ceff'}];
  const CXC={long:{sc:'#dff1ff',sd:'#4fb3f5',ed:'#bfe3ff'},close:{sc:'#fff0d6',sd:'#ffae2e',ed:'#f3d68a'},multi:{sc:'#ece9ff',sd:'#8f7cff',ed:'#d5ceff'},noise:{sc:'#ffe4df',sd:'#ff6b5a',ed:'#ffc9bf'}};
  const ST={period:'week',view:'subj'};

  const lvl=a=>a==null?['NOT TRIED','st-n']:a>=85?['STRONG','st-s']:a>=70?['GOOD','st-g']:['NEEDS WORK','st-w'];
  const pc2=o=>o&&o.n?Math.round(o.ok/o.n*100):null;

  /* seeded mock stats — replaced when the accuracy/averages endpoints land
     (prototype: subjStats / chapStats / SETS demo history) */
  function subjStats(k){const r=rng(k*41+(ST.period==='all'?7:1));const acc=Math.round(62+r()*30),spd=+(7+r()*6).toFixed(1),qs=Math.round((ST.period==='all'?380:60)+r()*(ST.period==='all'?300:80)),tr=+(r()*2.4-.4).toFixed(1);return{acc,spd,qs,tr}}
  function cxAgg(period){const o={};TWK.forEach((t,k)=>{const r=rng(k*97+(period==='all'?13:5));const n=Math.round((period==='all'?140:20)+r()*(period==='all'?200:40));o[t]={ok:Math.round(n*(.55+r()*.35)),n}});return o}
  function weekCount(t){const r=rng(TWK.indexOf(t)*17+3);return Math.round(r()*(NEED+4))}

  /* twist strengths — real play-log lives in localStorage('qdSets') once the
     drill engine lands; until then the prototype's mock numbers are shown */
  function twistStore(){let S=null;try{S=JSON.parse(localStorage.getItem('qdSets')||'null')}catch(_){}
    return S&&S.tw?S.tw:{base:{ok:Math.round(.72*25),n:25},long:{ok:Math.round(.7*12),n:12},close:{ok:Math.round(.5*6),n:6},multi:{ok:Math.round(.75*12),n:12},noise:{ok:0,n:0}}}
  const pct=o=>o&&o.n?Math.round(o.ok/o.n*100):null;

  function renderStats(anim){
    const all=SUBJ.map((_,k)=>subjStats(k)),tq=all.reduce((s,x)=>s+x.qs,0),acc=Math.round(all.reduce((s,x)=>s+x.acc*x.qs,0)/tq),spd=(all.reduce((s,x)=>s+x.spd*x.qs,0)/tq).toFixed(1);
    const C=2*Math.PI*42;
    $('#ovw').innerHTML=`<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="#eef1e6" stroke-width="10"/><circle id="ovArc" cx="50" cy="50" r="42" fill="none" stroke="url(#ovg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,1,.3,1)"/><defs><linearGradient id="ovg"><stop offset="0" stop-color="#8fc914"/><stop offset="1" stop-color="#d7fb5c"/></linearGradient></defs></svg><div class="rv"><b><span data-count="${acc}">${acc}</span>%</b><small>ACCURACY</small></div></div>
      <div class="ovg"><div><small>AVG SPEED</small><b>${spd}<em>s</em></b><span class="tr">▼ 0.9s faster</span></div><div><small>QUESTIONS</small><b data-count="${tq}">${tq.toLocaleString()}</b></div><div><small>CHALLENGES WON</small><b>${ST.period==='all'?63:9}</b></div><div><small>BEST STREAK</small><b>${ST.period==='all'?12:5}<em>days</em></b></div></div>`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const a=$('#ovArc');if(a)a.style.strokeDashoffset=C*(1-acc/100)}));
    if(anim)countUpAll($('#ovw'),200);
    $('#sgrid').innerHTML=SUBJ.map((s,k)=>{const x=all[k],[lv]=lvl(x.acc),c=SCOL[k%SCOL.length];
      return`<button class="sr" data-k="${k}" style="--sc:${c.sc};--sd:${c.sd};--ed:${c.ed};--d:${(.1+k*.06).toFixed(2)}s"><span class="si2"><svg viewBox="0 0 24 24">${s.ico}</svg></span>
        <span class="sw"><b>${esc(s.name)}</b><div class="bar5" style="--dl:${(.25+k*.06).toFixed(2)}s"><i style="--p:${x.acc}%"></i></div><span class="sm">${x.spd}s avg · ${x.qs} Qs</span></span>
        <span class="sv"><b>${x.acc}%</b><span>${lv}</span></span><span class="sgo"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></button>`}).join('');
    $('#slCount').textContent=`${SUBJ.length} subjects`;
    if(ST.view==='cx')renderCxList();
    const days=['M','T','W','T','F','S','S'],td=(new Date().getDay()+6)%7,r=rng(ST.period==='all'?9:3),vals=days.map((_,i)=>i>td?0:Math.round(4+r()*26)),mx=Math.max(...vals,1),tot=vals.reduce((a,b)=>a+b,0);
    $('#wk').innerHTML=`<div class="wh"><b>Questions this week</b><span><em>${tot}</em> answered</span></div><div class="wbars">${days.map((d,i)=>`<div class="wb${vals[i]?' on':''}${i===td?' today':''}"><span class="bx"><i style="--h:${Math.max(6,vals[i]/mx*100)}%;--d:${(.35+i*.05).toFixed(2)}s"></i></span><small>${d}</small></div>`).join('')}</div>`;
    if(anim){replay($('#sgrid'),'anim');replay($('#wk'),'anim')}
  }

  /* ---- twist strength slide (prototype: SETS.statsCard) ---- */
  function statsCard(){const el=$('#tws');if(!el)return;const rows=[['base','Classic',null],...TWK.map(t=>[t,TW[t].n,t])],S=twistStore(),ov=pct(S.base);
    const tried=TWK.filter(t=>S[t]&&S[t].n).sort((a,b)=>(pct(S[b])||0)-(pct(S[a])||0));
    el.innerHTML=`<div class="wh"><b>Twist strength</b><span>${ov==null?'Try a twist to see this':tried.length>1&&pct(S[tried[0]])!==pct(S[tried[tried.length-1]])?`Best <em>${TW[tried[0]].n}</em> · work on <em style="color:#c23a2f">${TW[tried[tried.length-1]].n}</em>`:`<em>${ov}%</em> overall`}</span></div>
      <div class="twr">${rows.map(([k,n,t])=>{const o=S[k],v=pct(o);return`<div class="${v==null?'nt':''}"><span class="tl">${t?ico(t):'<svg viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h6.5L10 22l9.5-12H13z"/></svg>'}${n}</span><span class="tb"><i style="--p:${v||0}%"></i></span><b>${v==null?'—':v+'%'}</b></div>`}).join('')}</div>`}

  /* ---- complexity list: the 4 twist types (drill detail screens come later) ---- */
  function renderCxList(){const A=cxAgg(ST.period);
    $('#sgrid').innerHTML=TWK.map((t,k)=>{const o=A[t],a=pc2(o),[lv]=lvl(a),c=CXC[t],w=weekCount(t);
      return`<button class="sr" data-tw="${t}" style="--sc:${c.sc};--sd:${c.sd};--ed:${c.ed};--d:${(.1+k*.06).toFixed(2)}s"><span class="si2">${ico(t)}</span>
        <span class="sw"><b>${TW[t].n}</b><div class="bar5" style="--dl:${(.25+k*.06).toFixed(2)}s"><i style="--p:${a||0}%"></i></div><span class="sm">${o.n} Qs<span class="wk7${w>=NEED?' ok':''}" title="Questions in the last 7 days (prize unlocks need ${NEED})">🔓 ${Math.min(w,NEED)}/${NEED} this week</span></span></span>
        <span class="sv"><b>${a==null?'—':a+'%'}</b><span>${lv}</span></span><span class="sgo"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></button>`}).join('');
    $('#slCount').textContent='4 twist types';replay($('#sgrid'),'anim')}

  /* ---- period segment (THIS WEEK / ALL TIME) ---- */
  const stK=$('#stK'),stBtns=[...document.querySelectorAll('#stSeg button')];
  function moveStK(){const b=document.querySelector('#stSeg button.on');if(!b||!stK)return;stK.style.width=b.offsetWidth+'px';stK.style.transform=`translateX(${b.offsetLeft}px)`}
  stBtns.forEach(b=>b.addEventListener('click',()=>{if(b.classList.contains('on'))return;buzz();stBtns.forEach(x=>x.classList.toggle('on',x===b));ST.period=b.dataset.p;moveStK();renderStats(true)}));

  /* ---- subjects / complexity switch ---- */
  $('#stab').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.classList.contains('on'))return;buzz();ST.view=b.dataset.v;document.querySelectorAll('#stab button').forEach(x=>x.classList.toggle('on',x===b));renderStats(true)});

  /* ---- row taps — chapter / complexity-detail screens come next ---- */
  $('#sgrid').addEventListener('click',e=>{const c=e.target.closest('.sr');if(!c)return;buzz();
    if(c.dataset.tw){toast(`${TW[c.dataset.tw].n} — twist stats detail comes next in the build`);return}
    const s=SUBJ[+c.dataset.k];toast(`${s.name} — chapter stats come next in the build`)});

  /* ---- swipeable overview cards + dots ---- */
  let ovI=0;
  function ovGo(i){ovI=Math.max(0,Math.min(2,i));if(ovI===2){statsCard();replay($('#tws'),'anim')}$('#ovt').style.transform=`translateX(${-ovI*100}%)`;document.querySelectorAll('#ovd button').forEach((d,k)=>d.classList.toggle('on',k===ovI));if(ovI===1)replay($('#wk'),'anim')}
  document.querySelectorAll('#ovd button').forEach((d,k)=>d.addEventListener('click',()=>{buzz();ovGo(k)}));
  (function(){const el=$('#ovs'),tr=$('#ovt');let sx=null,sy=0,dx=0,w=1,mv=false;
    el.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;dx=0;mv=false;w=el.getBoundingClientRect().width});
    el.addEventListener('pointermove',e=>{if(sx===null)return;dx=e.clientX-sx;if(!mv){if(Math.abs(dx)<8)return;if(Math.abs(e.clientY-sy)>Math.abs(dx)){sx=null;return}mv=true;tr.classList.add('drag');try{el.setPointerCapture(e.pointerId)}catch(_){}}
      tr.style.transform=`translateX(calc(${-ovI*100}% + ${dx/(w/el.offsetWidth)}px))`});
    const up=()=>{if(sx===null)return;sx=null;tr.classList.remove('drag');if(mv&&Math.abs(dx)>40){buzz();ovGo(ovI+(dx<0?1:-1))}else ovGo(ovI)};
    el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up)})();

  /* ---- back to the dashboard (real navigation — this is its own page) ---- */
  // wait ~260ms after playing the whoosh so navigation doesn't cut it off
  $('#stBack').addEventListener('click',()=>{buzz();setTimeout(()=>{SFX.play('whoosh');setTimeout(()=>location.href='index.html',260)},180)});

  function openStats(){renderStats(true);ovGo(0);requestAnimationFrame(moveStK)}
  openStats();

}
