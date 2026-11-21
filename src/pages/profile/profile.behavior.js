/* RI9 · PROFILE SCREEN logic — ported from the prototype
   (references/index.html, #s-prof IIFE). The prototype was a
   hash-navigated single document; here the profile is its own
   page, so nav('home') becomes a real redirect to index.html. */
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
    const SC=[523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.51,1567.98];
    const P={
      tap(){tone(1650,{d:.035,type:'triangle',v:.1,to:1100})},
      pop(){tone(380,{d:.1,v:.28,to:880})},
      right(){const b=SC[Math.min(2,SC.length-1)];tone(b,{d:.11,type:'triangle',v:.26});tone(b*1.5,{t:.06,d:.24,type:'triangle',v:.22})},
      wrong(){tone(220,{d:.18,type:'sawtooth',v:.14,to:130})},
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

  /* ---------- years (ported from the prototype) ---------- */
  const YEARS=[
    ...[1,2,3,4,5,6].map(n=>({id:'kssr'+n,n,label:`KSSR Year ${n}`,short:`Year ${n}`,cur:'KSSR · Malaysia'})),
    ...[4,5,6].map(n=>({id:'cam'+n,n,label:`Cambridge Primary Year ${n}`,short:`Cambridge Y${n}`,cur:'Cambridge Primary'})),
    ...[4,5,6].map(n=>({id:'ib'+n,n,label:`IB Primary Years Programme Year ${n}`,short:`IB PYP Y${n}`,cur:'IB Primary Years'}))
  ];
  function setYear(id){/* stats-screen hook — not on this page yet */}

  /* =================== PROFILE (student) =================== */
  (function(){
    const scr=$('#s-prof'),form=$('#pfBody'),F=n=>form.elements[n];
    const KEYS=['username','name','email','mobile','country','address','school','year','pname','pmobile','pemail'];
    const LABEL={username:'Username',name:'Full name',email:'Email',mobile:'Mobile',country:'Country',address:'Address',school:'School',year:'Year',pname:'Parent name',pmobile:'Parent mobile',pemail:'Parent email',dumo:'DUMO account'};
    const COUNTRIES=[['MY','Malaysia'],['SG','Singapore'],['BN','Brunei'],['ID','Indonesia'],['TH','Thailand'],['PH','Philippines'],['VN','Vietnam'],['IN','India'],['CN','China'],['AU','Australia'],['GB','United Kingdom'],['OT','Other']];
    const pfEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&'+'amp;','<':'&'+'lt;','>':'&'+'gt;','"':'&'+'quot;',"'":'&'+'#39;'}[c]));
    $('#pfCountry').innerHTML='<option value="">Select your country</option>'+COUNTRIES.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('');
    $('#pfYear').innerHTML=YEARS.map(y=>`<option value="${y.id}">${y.label}</option>`).join('');
    const DEF={username:'test4',name:'sean',email:'test4@gmail.com',mobile:'',country:'MY',address:'',school:'',year:'kssr4',pname:'',pmobile:'',pemail:'',dumo:'ri9_test4',fam:'7QK2PA',bundles:[]};
    let P;try{P={...DEF,...JSON.parse(localStorage.getItem('qdProfile')||'null')}}catch(_){P={...DEF}}
    const persist=()=>{try{localStorage.setItem('qdProfile',JSON.stringify(P))}catch(_){}};
    let dumoNew=null;
    const LOCK_I='<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',MAIL_I='<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>';
    // fields are always editable; nothing is stored until the emailed code is verified
    scr.classList.add('edit');
    function fill(){KEYS.forEach(k=>{F(k).value=P[k]??''});dumoNew=null;paintHero();paintBundles();$('#pfDumo').textContent=P.dumo;$('#pfFam').textContent=P.fam.slice(0,3)+'-'+P.fam.slice(3);
      form.querySelectorAll('.pf-f.err').forEach(f=>f.classList.remove('err'));paintChanges()}
    function paintHero(){const n=(P.name||P.username||'?').trim();$('#pfAv').textContent=(n[0]||'?').toUpperCase();$('#pfName').textContent=n;
      const y=YEARS.find(x=>x.id===P.year);$('#pfSub').textContent=`@${P.username}${y?' · '+y.label:''}`}
    function paintBundles(){$('#pfBundles').innerHTML=P.bundles.map(b=>`<span><i></i>${pfEsc(b)}</span>`).join('')}
    const val=k=>k==='dumo'?(dumoNew||P.dumo):String(F(k).value).trim();
    function changes(){const c=KEYS.filter(k=>val(k)!==String(P[k]??'').trim());if(dumoNew&&dumoNew!==P.dumo)c.push('dumo');return c}
    function show(k,v){if(!v)return'<i>empty</i>';if(k==='country')return pfEsc((COUNTRIES.find(c=>c[0]===v)||[,v])[1]);if(k==='year')return pfEsc((YEARS.find(y=>y.id===v)||{label:v}).label);
      if(k==='mobile'||k==='pmobile')return'+60 '+pfEsc(v);return pfEsc(v.length>26?v.slice(0,25)+'…':v)}
    function paintChanges(){const c=changes(),n=c.length;
      form.querySelectorAll('.pf-f[data-k]').forEach(f=>f.classList.toggle('pf-edited',c.includes(f.dataset.k)));$('.pf-dumo').classList.toggle('pf-edited',c.includes('dumo'));
      $('#pfSave').classList.toggle('show',n>0);scr.classList.toggle('pend',n>0);
      $('#pfSaveT').textContent=n?`${n} change${n>1?'s':''} · ${c.map(k=>LABEL[k]).join(', ')}`:'No changes';
      $('#pfLockI').innerHTML=n?MAIL_I:LOCK_I;
      $('#pfLockT').innerHTML=n?`<b>${n} change${n>1?'s':''} not saved yet</b>Tap Verify & save. We'll email a code to confirm it's you.`:'<b>Protected with a code</b>Edit anything below. Changes only apply after you verify the code we email you.'}
    form.addEventListener('input',e=>{const f=e.target.closest('.pf-f');f&&f.classList.remove('err');if(e.target.type==='tel')e.target.value=e.target.value.replace(/[^\d ]/g,'');paintChanges()});
    form.addEventListener('change',paintChanges);
    form.addEventListener('submit',e=>e.preventDefault());

    /* ---- modals ---- */
    const bd=$('#pfBd');let openMd=null,mdClose=null;
    function md(el,onClose){openMd&&openMd.classList.remove('open');openMd=el;mdClose=onClose||null;el.classList.add('open');bd.classList.add('open')}
    function closeMd(silent){if(!openMd)return;openMd.classList.remove('open');bd.classList.remove('open');openMd=null;clearInterval(rsT);const f=mdClose;mdClose=null;if(!silent&&f)f()}
    bd.addEventListener('click',()=>closeMd());scr.querySelectorAll('[data-pfx]').forEach(b=>b.addEventListener('click',()=>{buzz();closeMd()}));
    addEventListener('keydown',e=>{if(e.key==='Escape'&&openMd)closeMd()});
    function dialog(sub,title,body){$('#pfM2S').textContent=sub;$('#pfM2T').textContent=title;$('#pfM2B').innerHTML=body;md($('#pfMd2'))}

    /* ---- OTP: asked after the changes are made, applies them once verified ---- */
    const ob=$('#pfOtpBx'),oi=$('#pfOtpIn');let rsT,rsLeft=0,pending=null;
    ob.insertAdjacentHTML('afterbegin',[0,1,2,3,4,5].map(i=>`<span class="bx"></span>${i===2?'<span class="sep"></span>':''}`).join(''));
    const bxs=[...ob.querySelectorAll('.bx')];
    function paintOtp(){const v=oi.value,foc=document.activeElement===oi;bxs.forEach((b,i)=>{b.textContent=v[i]||'';b.classList.toggle('full',!!v[i]);b.classList.toggle('cur',foc&&v.length<6&&i===v.length)});$('#pfVerify').disabled=v.length!==6}
    oi.addEventListener('input',()=>{oi.value=oi.value.replace(/\D/g,'').slice(0,6);ob.classList.remove('bad');paintOtp();if(oi.value.length===6)setTimeout(()=>$('#pfVerify').click(),150)});
    oi.addEventListener('focus',paintOtp);oi.addEventListener('blur',paintOtp);
    const mask=e=>{const[u,d]=String(e).split('@');return d?(u.length<=2?u[0]+'*':u[0]+'*'.repeat(Math.min(3,u.length-2))+u.slice(-1))+'@'+d:e};
    function tickRs(){const r=$('#pfRs');if(rsLeft>0){r.textContent=`Resend code in ${rsLeft}s`;rsLeft--}else{clearInterval(rsT);r.innerHTML='Didn\'t get it? <button type="button" id="pfResend">Resend code</button>';$('#pfResend').onclick=()=>{buzz();startRs();toast('New code sent')}}}
    function startRs(){clearInterval(rsT);rsLeft=59;tickRs();rsT=setInterval(tickRs,1000)}
    function askOtp(c){pending={vals:Object.fromEntries(KEYS.map(k=>[k,val(k)])),dumo:dumoNew,c};
      oi.value='';ob.classList.remove('bad','ok');$('#pfVerify').innerHTML='VERIFY & SAVE';$('#pfOtpTo').textContent=mask(P.email);
      $('#pfOtpN').textContent=`${c.length} change${c.length>1?'s':''}`;
      $('#pfChg').innerHTML=c.slice(0,4).map(k=>`<div><span>${LABEL[k]}</span><s>${show(k,k==='dumo'?P.dumo:String(P[k]??''))}</s><b>${show(k,val(k))}</b></div>`).join('')+(c.length>4?`<div class="more">+${c.length-4} more</div>`:'');
      paintOtp();md($('#pfOtp'),()=>{pending=null;toast('Not saved · your changes are still waiting')});startRs();setTimeout(()=>oi.focus({preventScroll:true}),350);toast('Code sent to '+mask(P.email))}
    $('#pfVerify').addEventListener('click',()=>{const v=oi.value,b=$('#pfVerify');if(v.length!==6||b.dataset.busy||!pending)return;buzz();b.dataset.busy=1;b.innerHTML='<span class="spin"></span>CHECKING';
      setTimeout(()=>{delete b.dataset.busy;
        if(v==='000000'){b.innerHTML='VERIFY & SAVE';ob.classList.remove('bad');void ob.offsetWidth;ob.classList.add('bad');SFX.play('wrong');toast('That code doesn\'t match — try again');oi.value='';paintOtp();oi.focus();return}
        ob.classList.add('ok');b.innerHTML='VERIFIED ✓';SFX.play('right');
        setTimeout(()=>{const p=pending;pending=null;closeMd(true);apply(p)},550)},800)});
    function apply(p){const yearChanged=p.vals.year!==P.year;KEYS.forEach(k=>{P[k]=p.vals[k]});if(p.dumo)P.dumo=p.dumo;persist();
      if(yearChanged&&YEARS.some(y=>y.id===P.year))setYear(P.year);
      fill();replay($('.pf-hero'),'up');toast(`Verified · ${p.c.length} change${p.c.length>1?'s':''} saved`)}

    /* ---- save / cancel ---- */
    const RX={username:/^[a-z0-9_]{3,20}$/i,email:/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,phone:/^\d{8,11}$/};
    function validate(){const bad=[],v=k=>String(F(k).value).trim(),ph=k=>v(k).replace(/\s/g,'');
      if(!RX.username.test(v('username')))bad.push('username');if(!v('name'))bad.push('name');if(!RX.email.test(v('email')))bad.push('email');
      if(v('mobile')&&!RX.phone.test(ph('mobile').replace(/^0/,'')))bad.push('mobile');
      if(v('pmobile')&&!RX.phone.test(ph('pmobile').replace(/^0/,'')))bad.push('pmobile');
      if(v('pemail')&&!RX.email.test(v('pemail')))bad.push('pemail');
      form.querySelectorAll('.pf-f').forEach(f=>f.classList.toggle('err',bad.includes(f.dataset.k)));return bad}
    $('#pfSubmit').addEventListener('click',()=>{buzz();const c=changes();if(!c.length){toast('Nothing changed yet');return}
      const bad=validate();if(bad.length){const f=form.querySelector(`.pf-f[data-k="${bad[0]}"]`);f.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});SFX.play('wrong');toast(`Check ${LABEL[bad[0]].toLowerCase()}`);return}
      askOtp(c)});
    function cancelEdit(){const c=changes();if(!c.length)return;
      dialog('UNSAVED CHANGES','Discard changes?',`<p>You changed <b>${c.map(k=>LABEL[k]).join(', ')}</b>. These won't be saved.</p><button type="button" class="pf-mbtn dang" id="pfDisc">DISCARD</button><button type="button" class="pf-mbtn sec" id="pfKeep">Keep editing</button>`);
      $('#pfDisc').onclick=()=>{buzz();closeMd();fill();toast('Changes discarded')};$('#pfKeep').onclick=()=>{buzz();closeMd()}}
    $('#pfCancel').addEventListener('click',()=>{buzz();cancelEdit()});
    $('#pfEdit').hidden=true;

    /* ---- DUMO switch: picked here, applied with the other changes after the code ---- */
    $('#pfDumoSw').addEventListener('click',e=>{e.stopPropagation();buzz();
      const cur=dumoNew||P.dumo,list=[...new Set([cur,P.dumo,'ri9_'+P.username,P.username+'_dumo'])];
      dialog('DUMO ACCOUNT','Switch account',`<div style="display:flex;flex-direction:column;gap:7px">${list.map(a=>`<button type="button" class="pf-row" data-dumo="${pfEsc(a)}" style="${a===cur?'border-color:var(--lime);background:#f1fcd2':''}"><span class="ri" style="background:#fff0d6;font-family:var(--f-display);color:#ff8a1e">DU</span><div><b>${pfEsc(a)}</b><small>${a===P.dumo?'Connected now':a===cur?'Selected · not saved yet':'Tap to select'}</small></div></button>`).join('')}</div><p class="pf-hint" style="margin-top:12px">The switch is saved after you verify the code.</p>`);
      $('#pfM2B').querySelectorAll('[data-dumo]').forEach(b=>b.onclick=()=>{buzz();dumoNew=b.dataset.dumo===P.dumo?null:b.dataset.dumo;$('#pfDumo').textContent=dumoNew||P.dumo;closeMd();paintChanges()})});

    /* ---- family code ---- */
    $('#pfFamCp').addEventListener('click',e=>{e.stopPropagation();buzz();const c=P.fam;
      (navigator.clipboard?navigator.clipboard.writeText(c):Promise.reject()).then(()=>toast('Family code copied'),()=>toast('Family code: '+c))});

    /* ---- bundle redeem ---- */
    const PACKS=['SCIENCE PACK · 30 DAYS','MATHS BOOSTER · 60 DAYS','EXAM PREP BUNDLE','WRITING PRO · 30 DAYS','ALL SUBJECTS · 1 YEAR'];
    $('#pfBundle').addEventListener('click',e=>{e.stopPropagation();buzz();
      dialog('BUNDLE','Redeem a code',`<p>Enter the code from your school, voucher or bundle card.</p><input class="pf-code" id="pfCode" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="RI9-XXXX-XXXX"><button type="button" class="pf-mbtn" id="pfRedeem" disabled>REDEEM</button><div class="pf-hint">Demo: any 6+ letters / numbers</div>`);
      const ci=$('#pfCode'),rb=$('#pfRedeem');setTimeout(()=>ci.focus({preventScroll:true}),350);
      ci.oninput=()=>{ci.value=ci.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');rb.disabled=ci.value.replace(/-/g,'').length<6};
      ci.onkeydown=ev=>{if(ev.key==='Enter'&&!rb.disabled)rb.click()};
      rb.onclick=()=>{buzz();const code=ci.value.replace(/-/g,'');rb.disabled=true;rb.innerHTML='<span class="spin"></span>CHECKING';
        setTimeout(()=>{let h=0;for(const ch of code)h=(h*31+ch.charCodeAt(0))>>>0;const pack=PACKS[h%PACKS.length];
          if(P.bundles.includes(pack)){rb.disabled=false;rb.innerHTML='REDEEM';toast('That bundle is already on your account');return}
          P.bundles.push(pack);persist();paintBundles();closeMd();SFX.play('right');toast('Unlocked: '+pack)},900)}});

    /* ---- log out (prototype: nav('home') — here a real redirect) ---- */
    $('#pfOut').addEventListener('click',()=>{buzz();
      dialog('ACCOUNT','Log out?',`<p>You'll need your username and password to sign back in as <b>@${pfEsc(P.username)}</b>.</p><button type="button" class="pf-mbtn dang" id="pfOutOk">LOG OUT</button><button type="button" class="pf-mbtn sec" id="pfOutNo">Stay</button>`);
      $('#pfOutOk').onclick=()=>{buzz();closeMd();toast('Logged out');setTimeout(()=>{location.href='index.html'},400)};$('#pfOutNo').onclick=()=>{buzz();closeMd()}});

    /* ---- back to the dashboard (prototype: data-back="home") ---- */
    scr.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>{buzz();location.href='index.html'}));

    fill();
    form.classList.add('anim'); // staggered card entry on page load
  })();

}
