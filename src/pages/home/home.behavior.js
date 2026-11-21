/* RI9 · HOME SCREEN logic — ported verbatim from www/js/home.js.
   The original was an IIFE; mount() runs the exact same code after
   the DOM is ready (module scripts are deferred, same timing). */
export function mount() {/* ============================================================
   RI9 · HOME SCREEN logic — extracted from the prototype.
   UI only for now: all data stays in localStorage mocks and
   cross-screen navigation is stubbed with toasts.
   ============================================================ */

  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $=s=>document.querySelector(s), root=document.documentElement;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const replay=(el,c)=>{if(reduce)return;el.classList.remove(c);void el.offsetWidth;el.classList.add(c)};

  /* ===================== SFX ENGINE (synthesised, no files) ===================== */
  const SFX=(()=>{let ctx=null,out=null,on=true,nb=null,lastType=0;try{on=localStorage.getItem('sfx')!=='0'}catch(_){}
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
    const SC=[523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.51,1567.98];
    const P={
      tap(){tone(1650,{d:.035,type:'triangle',v:.1,to:1100})},
      pop(){tone(380,{d:.1,v:.28,to:880})},
      ok(n=0){const b=SC[Math.min(n,SC.length-1)];tone(b,{d:.11,type:'triangle',v:.26});tone(b*1.5,{t:.06,d:.24,type:'triangle',v:.22});tone(b*3,{t:.06,d:.3,v:.06})},
      win(){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,{t:i*.085,d:.2,type:'triangle',v:.24}));tone(1046.5,{t:.34,d:.7,v:.2});tone(1567.98,{t:.34,d:.7,v:.1});tone(2093,{t:.4,d:.6,v:.05});nz({t:.34,d:.7,v:.05,f:7000,type:'highpass'})},
      sparkle(){[2093,2637,3136,2637,3520,4186].forEach((f,i)=>tone(f,{t:i*.045,d:.14,v:.06}))},
      tick(){tone(1400,{d:.025,type:'square',v:.04})},
      unlock(){tone(523.25,{d:.08,type:'triangle',v:.2});tone(783.99,{t:.07,d:.08,type:'triangle',v:.2});tone(1046.5,{t:.14,d:.3,type:'triangle',v:.2});nz({t:.1,d:.3,v:.05,f:6000,type:'highpass'})}
    };
    return{play(k,...a){try{P[k]&&P[k](...a)}catch(_){}},get on(){return on},set(v){on=!!v;try{localStorage.setItem('sfx',on?'1':'0')}catch(_){}if(on){unlock();setTimeout(()=>P.unlock(),30)}}};
  })();
  window.SFX=SFX;
  const buzz=()=>{SFX.play('tap');try{navigator.vibrate&&navigator.vibrate(10)}catch(e){}};

  /* ---------- stage fit (390×820 scaled to viewport) ---------- */
  function fit(){const vp=$('#vp'),vw=vp.clientWidth,vh=vp.clientHeight;
    let s=Math.min(vw/390,vh/812,1.5);const W=Math.min(vw/s,520),H=vh/s;
    root.style.setProperty('--s',s.toFixed(4));root.style.setProperty('--W',W.toFixed(1));root.style.setProperty('--H',H.toFixed(1));
    root.style.setProperty('--ox',((vw-W*s)/2).toFixed(1)+'px');}
  fit();addEventListener('resize',fit);window.visualViewport&&visualViewport.addEventListener('resize',fit);

  /* ---------- speed streaks on the backdrop ---------- */
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

  /* ---------- sparkles on the prize banner ---------- */
  const star='<svg viewBox="0 0 12 12"><path d="M6 0l1.3 4.7L12 6 7.3 7.3 6 12 4.7 7.3 0 6l4.7-1.3z"/></svg>';
  [[250,58,0,12],[318,96,.9,9],[226,140,1.6,10],[300,160,2.1,8]].forEach(([x,y,d,w])=>{const t=document.createElement('i');t.className='tw';t.style.cssText=`right:${358-x}px;top:${y}px;animation-delay:${d}s;width:${w}px;height:${w}px`;t.innerHTML=star;$('#prize').appendChild(t)});

  /* ---------- prize tilt ---------- */
  const pz=$('#prize');
  pz.addEventListener('pointermove',e=>{if(reduce)return;const r=pz.getBoundingClientRect();pz.style.setProperty('--ry',(((e.clientX-r.left)/r.width-.5)*10).toFixed(2)+'deg');pz.style.setProperty('--rx',((.5-(e.clientY-r.top)/r.height)*8).toFixed(2)+'deg')});
  ['pointerleave','pointerup','pointercancel'].forEach(t=>pz.addEventListener(t,()=>{pz.style.setProperty('--rx','0deg');pz.style.setProperty('--ry','0deg')}));

  /* ---------- CHALLENGE letters ---------- */
  const h=$('#chalWord');
  h.innerHTML=[...h.textContent].map((c,i)=>`<span class="in" style="--a:letter .5s cubic-bezier(.2,1.4,.4,1);--d:${(.65+i*.04).toFixed(2)}s"><i style="--w:${(2.6+i*.06).toFixed(2)}s">${c}</i></span>`).join('');

  /* ---------- subjects ---------- */
  const SUBJ=[
    {name:'Mathematics',avg:10.0,q:17,tr:1.4,ico:`<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M5.5 5.5l3 3M8.5 5.5l-3 3"/><rect x="13" y="3" width="8" height="8" rx="2"/><path d="M15 7h4"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M7 15v4M5 17h4"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M15 17h4"/><circle class="f" cx="17" cy="15" r=".9"/><circle class="f" cx="17" cy="19" r=".9"/>`},
    {name:'English',avg:8.6,q:15,tr:0.8,ico:`<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8 13l2.5-6 2.5 6M8.8 11.2h3.4"/><path d="M14.5 7v6h1.8a1.5 1.5 0 0 0 0-3h-1.8 1.5a1.5 1.5 0 0 0 0-3z"/>`},
    {name:'Bahasa Melayu',avg:9.4,q:16,tr:2.1,ico:`<path d="M3 5h18v11h-9l-5 4v-4H3z"/><path d="M6.5 8v5h2a1.25 1.25 0 0 0 0-2.5h-2 1.6a1.25 1.25 0 0 0 0-2.5z"/><path d="M12 13V8l2.5 3L17 8v5"/>`},
    {name:'Science',avg:12.3,q:14,tr:0.6,ico:`<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/><circle class="f" cx="10.5" cy="17" r="1"/><circle class="f" cx="14" cy="18.2" r=".8"/>`}
  ];
  const N=SUBJ.length, car=$('#car'), cards=[], A0=-200, A1=20; // gauge sweep angles
  const P=(r,a)=>[102+r*Math.cos(a*Math.PI/180),104+r*Math.sin(a*Math.PI/180)];
  function arcPath(r,a,b){const[x1,y1]=P(r,a),[x2,y2]=P(r,b);return`M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${b-a>180?1:0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
  let ticks='';for(let i=0;i<=22;i++){const a=A0+(A1-A0)*i/22,big=i%5===0;const[x1,y1]=P(big?70:73,a),[x2,y2]=P(78,a);ticks+=`<line class="tk" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="${big?'stroke:#9da68e':''}"/>`}
  const score=s=>clamp((20-s.avg)/16,0.05,1); // faster = fuller gauge
  SUBJ.forEach((s,k)=>{
    const el=document.createElement('div');el.className='sc';el.dataset.k=k;
    el.innerHTML=`<div class="top"><span class="ic"><svg viewBox="0 0 24 24">${s.ico}</svg></span><div><div class="nm">${s.name}</div><div class="kssr">KSSR · ${s.q} MCQs</div></div></div>
      <div class="gauge"><svg viewBox="0 0 204 116">${ticks}<path class="trk" d="${arcPath(90,A0,A1)}"/><path class="val" d="${arcPath(90,A0,A1)}"/>
        <g class="needle"><circle r="13" fill="#c6f432" opacity=".35" class="halo"/><circle r="8.5" fill="#fff" stroke="#1b1c19" stroke-width="3"/></g></svg>
        <div class="read"><b><span class="v">${s.avg.toFixed(1)}</span><small>s</small></b><div>AVG SPEED</div></div></div>
      <div class="ft"><span class="trend"><svg viewBox="0 0 10 10"><path d="M5 9 1 3h8z" fill="#3d6b06"/></svg>${s.tr.toFixed(1)}s faster this week</span></div>`;
    car.appendChild(el);cards.push(el);
    const v=el.querySelector('.val'),L=v.getTotalLength();v.style.strokeDasharray=L;v.style.strokeDashoffset=L;el._val=v;el._L=L;el._needle=el.querySelector('.needle');el._num=el.querySelector('.v');
  });
  $('#dots').innerHTML=SUBJ.map(()=>'<i></i>').join('');
  const dots=[...document.querySelectorAll('#dots i')];
  // needle rotation pivot (102,104); needle drawn pointing up (-90°)
  function setGauge(el,p){const a=A0+(A1-A0)*p;const[nx,ny]=P(90,a);el._needle.setAttribute('transform',`translate(${nx.toFixed(1)} ${ny.toFixed(1)})`);el._val.style.strokeDashoffset=(el._L*(1-p)).toFixed(1)}
  cards.forEach(el=>setGauge(el,0));
  function animGauge(k,delay){
    const el=cards[k],s=SUBJ[k],target=score(s);if(reduce){setGauge(el,target);el._num.textContent=s.avg.toFixed(1);return}
    clearTimeout(el._t);cancelAnimationFrame(el._r);
    el._t=setTimeout(()=>{const t0=performance.now();(function f(t){const p=Math.min(1,(t-t0)/1100);
      const e=1+2.2*Math.pow(p-1,3)+1.2*Math.pow(p-1,2);setGauge(el,clamp(target*e,0,1));
      el._num.textContent=(s.avg*(0.4+0.6*Math.min(1,p*1.4))).toFixed(1); if(p>=.72)el._num.textContent=s.avg.toFixed(1);
      if(p<1)el._r=requestAnimationFrame(f)})(t0)},delay||0);
  }
  // layout from continuous position
  let pos=0, shown=0, raf=0, cur=0;
  function wrap(d){return((d%N)+N+N/2)%N-N/2}
  function layout(p){
    cards.forEach((el,k)=>{
      const d=wrap(k-p), ad=Math.abs(d);
      const x=d*152, sc=1-Math.min(ad,1.6)*.19, ry=-d*28, op=ad>1.6?0:1-Math.max(0,ad-1)*1.6;
      el.style.transform=`translateX(${x.toFixed(1)}px) translateZ(${(-ad*60).toFixed(1)}px) rotateY(${clamp(ry,-40,40).toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      el.style.opacity=clamp(op,0,1).toFixed(2);el.style.zIndex=String(10-Math.round(ad*3));
      el.style.filter=ad>.4?`saturate(${(1-ad*.4).toFixed(2)}) brightness(${(1-ad*.04).toFixed(2)})`:'none';
    });
  }
  const back=t=>1+2.2*Math.pow(t-1,3)+1.2*Math.pow(t-1,2);
  function spinTo(to,dur){cancelAnimationFrame(raf);const from=shown,t0=performance.now();dur=reduce?1:(dur||480);
    (function f(t){const p=Math.min(1,(t-t0)/dur);shown=from+(to-from)*back(p);layout(shown);if(p<1)raf=requestAnimationFrame(f)})(t0)}
  function activate(first){
    cur=((Math.round(pos)%N)+N)%N;
    cards.forEach((el,k)=>el.classList.toggle('on',k===cur));dots.forEach((d,k)=>d.classList.toggle('on',k===cur));
    animGauge(cur,first?1250:120);if(!first)buzz();
  }
  layout(0);activate(true);
  if(!reduce){cards.forEach((el,k)=>{el.animate([{opacity:0,translate:'0 60px'},{opacity:el.style.opacity,translate:'0 0'}],{duration:650,delay:850+Math.abs(wrap(k))*90,easing:'cubic-bezier(.2,1.3,.4,1)',fill:'backwards'})})}
  function go(step){pos+=step;spinTo(pos);activate()}

  // swipe / drag
  let drag=null;
  car.addEventListener('pointerdown',e=>{cancelAnimationFrame(raf);drag={id:e.pointerId,x:e.clientX,y:e.clientY,base:shown,moved:false,t:e.target,k:car.getBoundingClientRect().width/390};});
  car.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;
    if(!drag.moved){if(Math.abs(dx)<8)return;if(Math.abs(e.clientY-drag.y)>Math.abs(dx)){drag=null;return}drag.moved=true;car.classList.add('drag');try{car.setPointerCapture(e.pointerId)}catch(_){}}
    shown=drag.base-dx/(150*drag.k);layout(shown)});
  function end(e){if(!drag||e.pointerId!==drag.id)return;car.classList.remove('drag');const d=drag;drag=null;
    if(!d.moved){const c=d.t.closest&&d.t.closest('.sc');if(c){const k=+c.dataset.k;if(k===cur){buzz();toast(`${SUBJ[k].name} — drill screens come next in the build`);return}go(Math.round(wrap(k-shown)))}else spinTo(pos);return}
    const dx=e.clientX-d.x;let target=Math.round(shown);if(target===Math.round(d.base)&&Math.abs(dx)>30)target+=dx<0?1:-1;pos=target;spinTo(pos,420);activate()}
  car.addEventListener('pointerup',end);car.addEventListener('pointercancel',end);
  addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1)});

  /* ---------- balance ---------- */
  let on=false;
  $('#eye').addEventListener('click',()=>{on=!on;const b=$('#bal');b.classList.toggle('on',on);$('#slash').style.display=on?'none':'';
    $('#eye').setAttribute('aria-label',on?'Hide coin balance':'Show coin balance');if(!on){b.textContent='****';return}
    const t0=performance.now();(function f(t){const p=Math.min(1,(t-t0)/600);b.textContent=Math.round(1250*(1-Math.pow(1-p,3))).toLocaleString();if(p<1)requestAnimationFrame(f)})(t0)});

  /* ---------- toast ---------- */
  let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),1700)}
  window.toast=toast;

  /* ---------- dock nav (stubs — other screens come next) ---------- */
  const navBtns=[...document.querySelectorAll('.dnav button')],navInd=$('#navInd');
  function moveInd(){const b=document.querySelector('.dnav button.on');if(!b)return;navInd.style.transform=`translateX(${b.offsetLeft}px)`}
  navBtns.forEach(b=>b.addEventListener('click',()=>{buzz();
    navBtns.forEach(x=>{x.classList.toggle('on',x===b);x.toggleAttribute('aria-current',x===b)});
    requestAnimationFrame(()=>requestAnimationFrame(moveInd));
    const pg=b.dataset.page;
    if(pg!=='Home'){toast(`${pg} — next screen in the build`);clearTimeout(b._t);b._t=setTimeout(()=>navBtns[0].click(),1600)}}));
  function shapeDock(){const d=$('#dock'),W=d.offsetWidth,H=d.offsetHeight,c=W/2,r=30;
    $('#dockPath').setAttribute('d',`M0 ${r}Q0 0 ${r} 0L${c-70} 0C${c-50} 0 ${c-54} 50 ${c} 50C${c+54} 50 ${c+50} 0 ${c+70} 0L${W-r} 0Q${W} 0 ${W} ${r}L${W} ${H+80}L0 ${H+80}Z`)}
  shapeDock();moveInd();document.fonts&&document.fonts.ready.then(moveInd);addEventListener('resize',()=>requestAnimationFrame(()=>{shapeDock();moveInd()}));
  pz.addEventListener('click',()=>toast('Prizes — next screen in the build'));
  $('#sos').addEventListener('click',()=>toast('S.O.S — ask for help'));
  $('#help').addEventListener('click',()=>{buzz();toast('How it works — walkthrough comes next')});
  $('#pqTab').addEventListener('click',()=>{buzz();toast('Puzzle Quest — next screen in the build')});
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{buzz();
    toast(`${b.querySelector('b').textContent} — next screen in the build`)}));

  /* ---------- sound toggle + locked shell ---------- */
  (function(){const b=$('#sfxB'),st=document.querySelector('.streak');
    const sync=()=>{b.classList.toggle('off',!SFX.on);b.setAttribute('aria-pressed',SFX.on);b.setAttribute('aria-label',SFX.on?'Sound effects on':'Sound effects off')};
    const place=()=>{if(st&&st.offsetWidth)b.style.left=(st.offsetLeft+st.offsetWidth+8)+'px'};
    b.addEventListener('click',()=>{SFX.set(!SFX.on);sync();replay(b,'nudge');toast(SFX.on?'Sound on':'Sound off')});
    sync();place();setTimeout(place,600);document.fonts&&document.fonts.ready.then(place);
    ['gesturestart','gesturechange'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
    document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
    addEventListener('scroll',()=>{if(scrollX||scrollY)scrollTo(0,0)},{passive:true});
  })();

  /* ===================== DAILY GOAL RINGS ===================== */
  const GL=(()=>{
    const today=()=>new Date().toDateString();
    let goal=null,prog={d:today(),sec:0,q:0,won:false};
    try{goal=JSON.parse(localStorage.getItem('qdGoal')||'null')}catch(_){}
    try{const p=JSON.parse(localStorage.getItem('qdProg')||'null');if(p&&p.d===today())prog=p;else prog={d:today(),sec:372,q:18,won:false}}catch(_){prog={d:today(),sec:372,q:18,won:false}}
    const save=()=>{try{localStorage.setItem('qdProg',JSON.stringify(prog));if(goal)localStorage.setItem('qdGoal',JSON.stringify(goal))}catch(_){}};
    const G=()=>goal||{min:9,q:30};
    const pct=(g=G())=>({a:Math.min(1,prog.sec/60/g.min),b:Math.min(1,prog.q/g.q)});
    const ring=(a,b,center)=>`<div class="grg"><svg viewBox="0 0 100 100"><circle class="tk t1" cx="50" cy="50" r="44"/><circle class="tk t2" cx="50" cy="50" r="31"/>
      <circle class="r1" cx="50" cy="50" r="44" pathLength="100" data-p="${(a*100).toFixed(1)}"/><circle class="r2" cx="50" cy="50" r="31" pathLength="100" data-p="${(b*100).toFixed(1)}"/></svg><span class="ctr">${center}</span></div>`;
    const fill=(root,instant)=>{const go=()=>root.querySelectorAll('.r1,.r2').forEach(c=>c.style.strokeDasharray=`${c.dataset.p} 100`);instant?go():requestAnimationFrame(()=>requestAnimationFrame(go))};
    function card(anim){
      const g=G(),p=pct(g),c=$('#gcard'),minLeft=Math.max(0,Math.ceil(g.min-prog.sec/60)),qLeft=Math.max(0,g.q-prog.q),all=minLeft===0&&qLeft===0;
      c.classList.toggle('win',all);
      c.innerHTML=`${ring(p.a,p.b,all?'🔥':'')}<span class="bgs">
          <span class="r a${minLeft?'':' done'}"><i></i><b>${minLeft||'✓'}</b><small>${minLeft?'MIN LEFT':'TIME DONE'}</small></span>
          <span class="r b${qLeft?'':' done'}"><i></i><b>${qLeft||'✓'}</b><small>${qLeft?'QS LEFT':'QS DONE'}</small></span></span>`;
      fill(c,!anim);
    }
    let draft=null;
    function big(){const p=pct(draft);$('#gBig').innerHTML=ring(p.a,p.b,`<b>${Math.round((p.a+p.b)*50)}%</b><small>DONE TODAY</small>`);fill($('#gBig'))}
    function sync(bump){$('#gMin').textContent=draft.min;$('#gQ').textContent=draft.q;if(bump)replay($(bump),'bump');
      document.querySelectorAll('.gchips').forEach(ch=>ch.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.v===draft[ch.dataset.g])));big()}
    function open(first){draft={...G()};$('#gSub').textContent=first?'Like a fitness ring. Pick a daily target, then close both rings every day to keep your streak alive.':'Change your daily target any time. Your progress today stays.';
      $('#gGo').textContent=first?'LOCK IT IN':'SAVE GOAL';sync();$('#gbd').classList.add('open');$('#gsh').classList.add('open');$('#gsh').scrollTop=0;SFX.play('pop')}
    function close(){$('#gbd').classList.remove('open');$('#gsh').classList.remove('open')}
    $('#gsh').addEventListener('click',e=>{const s=e.target.closest('.gstep button');if(s){const k=s.dataset.g,d=+s.dataset.d;
        draft[k]=k==='min'?Math.max(3,Math.min(60,draft.min+d)):Math.max(10,Math.min(200,draft.q+d*5));SFX.play('tick');buzz();sync(k==='min'?'#gMin':'#gQ');return}
      const c=e.target.closest('.gchips button');if(c){const k=c.parentNode.dataset.g;draft[k]=+c.dataset.v;SFX.play('pop');sync(k==='min'?'#gMin':'#gQ')}});
    $('#gGo').addEventListener('click',()=>{goal={...draft};prog.won=pct().a>=1&&pct().b>=1;save();close();SFX.play('unlock');setTimeout(()=>{card(true);replay($('#gcard'),'nudge')},250);toast(`Daily goal: ${goal.min} min · ${goal.q} questions`)});
    $('#gbd').addEventListener('click',()=>{if(goal)close()});
    $('#gcard').addEventListener('click',e=>{e.stopPropagation();e.preventDefault();buzz();open(false)});
    $('#gcard').addEventListener('pointerdown',e=>e.stopPropagation());
    return{card,open,get first(){return!goal},home(){card(true)}};
  })();
  GL.home();
  // auto-open the "Set your target" goal sheet on first run — disabled for now
  // if(GL.first)setTimeout(()=>GL.open(true),1400);

}
