import { useAppStore } from '../../store/app';

/* RI9 · PROFILE SCREEN logic — ported from the prototype
   (references/index.html, #s-prof IIFE). The prototype was a
   hash-navigated single document; here the profile is its own
   page, so nav('home') becomes a real redirect to index.html.

   Backend wiring (migrated from the Flutter dumo_drill app):
   - profile fields load from GET /api/v1/user/profile
   - country / year dropdowns load from /api/v1/countries and
     /api/v1/age-ranges
   - saving goes through PUT /api/v2/user/profile — the backend
     may answer "updated directly", ask for a verification
     channel, or send an OTP which we then verify via
     /api/v2/user/profile/verify (+ /resend-otp)
   - bundle redeem uses /api/v1/bundles/redeem/validate + /redeem

   Still mocked (no web endpoints yet): the DUMO account switch,
   the family code, and log out (once the auth UI lands,
   clearToken() + redirect replace the current confirm dialog). */
import {
  fetchProfile,
  updateProfileV2,
  verifyProfileV2,
  resendProfileOtpV2,
  fetchCountries,
  fetchAgeRanges,
  validateBundleCode,
  redeemBundleCode,
} from '../../api/profile';
import { logout } from '../../api/auth';
import { ApiError } from '../../api/client';
import { mountPullToRefresh } from '../../utils/pullToRefresh';

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
      whoosh(){nz({d:.24,v:.09,f:500,to:3200,q:.7})}, // screen-transition swoosh (dock nav) — same as reference
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
  // API failures surfaced from other modules go through the store's
  // showToast — repaint whenever the toastSeq counter ticks.
  let lastToastSeq=useAppStore.getState().toastSeq;
  useAppStore.subscribe(s=>{if(s.toastSeq!==lastToastSeq){lastToastSeq=s.toastSeq;toast(s.toastMsg||'')}});

  /* Set by the PROFILE boot IIFE below once the loaders exist —
     re-runs loadStatic() + loadProfile() for pull-to-refresh. */
  let pullRefresh=null;

  /* =================== PROFILE (student) =================== */
  (async function(){
    const scr=$('#s-prof'),form=$('#pfBody'),F=n=>form.elements[n];
    const KEYS=['username','name','email','mobile','country','address','school','year','pname','pmobile','pemail'];
    const LABEL={username:'Username',name:'Full name',email:'Email',mobile:'Mobile',country:'Country',address:'Address',school:'School',year:'Year',pname:'Parent name',pmobile:'Parent mobile',pemail:'Parent email',dumo:'DUMO account'};
    /* form key → v2 payload field (snake_case wire format). Mobile
       fields also carry a dial code — the web form has no picker,
       so it mirrors the Flutter app's default '+60'. */
    const FIELD={username:'username',name:'fullname',email:'email',mobile:'mobile_number',country:'country_id',address:'address',school:'school_name',year:'age_range_id',pname:'parent_name',pmobile:'parent_mobile_number',pemail:'parent_email'};
    const COUNTRY_CODE='+60';
    /* dropdown sources — loaded from the API, not hardcoded */
    let COUNTRIES=[]; /* [{ id, country_name }] */
    let YEARS=[];     /* [{ id, label }] (age ranges) */
    const pfEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&'+'amp;','<':'&'+'lt;','>':'&'+'gt;','"':'&'+'quot;',"'":'&'+'#39;'}[c]));

    /* local-only extras (mocked until dedicated endpoints land) */
    const LOCAL_DEF={dumo:'—',fam:'7QK2PA',bundles:[]};
    let LOCAL;try{LOCAL={...LOCAL_DEF,...JSON.parse(localStorage.getItem('qdLocal')||'null')}}catch(_){LOCAL={...LOCAL_DEF}}
    const persistLocal=()=>{try{localStorage.setItem('qdLocal',JSON.stringify(LOCAL))}catch(_){}};

    /* P = the profile the form edits; starts empty until the API answers */
    let P={...Object.fromEntries(KEYS.map(k=>[k,''])),...LOCAL};
    let dumoNew=null;

    /* ---- API mapping helpers ---- */
    function fromApi(p){return{
      username:p.username??'', name:p.fullname??'', email:p.email??'',
      mobile:p.mobileNumber??'', country:p.countryId!=null?String(p.countryId):'',
      address:p.address??'', school:p.schoolName??'',
      year:p.ageRangeId!=null?String(p.ageRangeId):'',
      pname:p.parentName??'', pmobile:p.parentMobileNumber??'', pemail:p.parentEmail??'',
      dumo:LOCAL.dumo, fam:LOCAL.fam, bundles:LOCAL.bundles};}
    function mergeApi(p){const next=fromApi(p);LOCAL.dumo=next.dumo;LOCAL.fam=next.fam;LOCAL.bundles=next.bundles;persistLocal();
      P={...P,...next};}
    /* camelCase keys mirroring ProfileUpdateInput (src/api/profile.ts) —
       updateProfileV2() converts them to snake_case for the wire */
    const API_FIELD={username:'username',name:'fullname',email:'email',mobile:'mobileNumber',country:'countryId',address:'address',school:'schoolName',year:'ageRangeId',pname:'parentName',pmobile:'parentMobileNumber',pemail:'parentEmail'};
    function toPayload(keys,vals){const b={};keys.forEach(k=>{if(k==='dumo')return;const api=API_FIELD[k],v=vals[k];
      if(api==='countryId'||api==='ageRangeId'){if(v!==''&&v!=null)b[api]=Number(v);return}
      if(v==='')return; /* mirrors Flutter: empty → field omitted */
      b[api]=v;if(api==='mobileNumber')b.countryCode=COUNTRY_CODE;if(api==='parentMobileNumber')b.parentCountryCode=COUNTRY_CODE;});return b}
    const pickErrMsg=(e,fallback)=>e instanceof ApiError&&e.message?e.message:fallback;
    function markFieldErrors(e){if(!(e instanceof ApiError)||!e.errors)return;
      Object.keys(e.errors).forEach(field=>{const k=Object.keys(FIELD).find(k=>FIELD[k]===field);if(!k)return;
        const f=form.querySelector(`.pf-f[data-k="${k}"]`);f&&f.classList.add('err')})}

    const LOCK_I='<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',MAIL_I='<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>';
    // fields are always editable; nothing is stored until the code is verified
    scr.classList.add('edit');
    function fill(){KEYS.forEach(k=>{F(k).value=P[k]??''});dumoNew=null;paintHero();paintBundles();$('#pfDumo').textContent=P.dumo;$('#pfFam').textContent=P.fam.slice(0,3)+'-'+P.fam.slice(3);
      form.querySelectorAll('.pf-f.err').forEach(f=>f.classList.remove('err'));paintChanges()}
    function paintHero(){const n=(P.name||P.username||'?').trim();$('#pfAv').textContent=(n[0]||'?').toUpperCase();$('#pfName').textContent=n;
      const y=YEARS.find(x=>String(x.id)===String(P.year));$('#pfSub').textContent=`@${P.username}${y?' · '+y.label:''}`}
    function paintBundles(){$('#pfBundles').innerHTML=(P.bundles||[]).map(b=>`<span><i></i>${pfEsc(b)}</span>`).join('')}
    const val=k=>k==='dumo'?(dumoNew||P.dumo):String(F(k).value).trim();
    function changes(){const c=KEYS.filter(k=>val(k)!==String(P[k]??'').trim());if(dumoNew&&dumoNew!==P.dumo)c.push('dumo');return c}
    function show(k,v){if(!v)return'<i>empty</i>';if(k==='country')return pfEsc((COUNTRIES.find(c=>String(c.id)===String(v))||{country_name:v}).country_name||v);if(k==='year')return pfEsc((YEARS.find(y=>String(y.id)===String(v))||{label:v}).label||v);
      if(k==='mobile'||k==='pmobile')return'+60 '+pfEsc(v);return pfEsc(v.length>26?v.slice(0,25)+'…':v)}
    function paintChanges(){const c=changes(),n=c.length;
      form.querySelectorAll('.pf-f[data-k]').forEach(f=>f.classList.toggle('pf-edited',c.includes(f.dataset.k)));$('.pf-dumo').classList.toggle('pf-edited',c.includes('dumo'));
      $('#pfSave').classList.toggle('show',n>0);scr.classList.toggle('pend',n>0);
      $('#pfSaveT').textContent=n?`${n} change${n>1?'s':''} · ${c.map(k=>LABEL[k]).join(', ')}`:'No changes';
      $('#pfLockI').innerHTML=n?MAIL_I:LOCK_I;
      $('#pfLockT').innerHTML=n?`<b>${n} change${n>1?'s':''} not saved yet</b>Tap Verify & save. We'll send a code to confirm it's you.`:'<b>Protected with a code</b>Edit anything below. Changes only apply after you verify the code we send you.'}
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
    function tickRs(){const r=$('#pfRs');if(rsLeft>0){r.textContent=`Resend code in ${rsLeft}s`;rsLeft--}else{clearInterval(rsT);r.innerHTML='Didn\'t get it? <button type="button" id="pfResend">Resend code</button>';$('#pfResend').onclick=()=>{buzz();startRs();resendOtp()}}}
    function startRs(){clearInterval(rsT);tickRs();rsT=setInterval(tickRs,1000)}
    async function resendOtp(){try{const res=await resendProfileOtpV2();if(res.maskedDestination)$('#pfOtpTo').textContent=res.maskedDestination;
        rsLeft=res.resendAfter??60;toast('New code sent')}catch(e){rsLeft=0;toast(pickErrMsg(e,'Could not resend the code'))}}
    function showOtp(res,payload,changed){pending={payload,changed};
      oi.value='';ob.classList.remove('bad','ok');$('#pfVerify').innerHTML='VERIFY & SAVE';paintOtp();
      $('#pfOtpTo').textContent=res.maskedDestination||res.otpSentTo||mask(P.email);
      $('#pfOtpN').textContent=`${changed.length} change${changed.length>1?'s':''}`;
      $('#pfChg').innerHTML=changed.slice(0,4).map(k=>`<div><span>${LABEL[k]}</span><s>${show(k,k==='dumo'?P.dumo:String(P[k]??''))}</s><b>${show(k,val(k))}</b></div>`).join('')+(changed.length>4?`<div class="more">+${changed.length-4} more</div>`:'');
      rsLeft=res.resendAfter??60;startRs();
      md($('#pfOtp'),()=>{pending=null;toast('Not saved · your changes are still waiting')});
      setTimeout(()=>oi.focus({preventScroll:true}),350);toast('Code sent to '+$('#pfOtpTo').textContent)}
    const mask=e=>{const[u,d]=String(e).split('@');return d?(u.length<=2?u[0]+'*':u[0]+'*'.repeat(Math.min(3,u.length-2))+u.slice(-1))+'@'+d:e};
    $('#pfVerify').addEventListener('click',async()=>{const v=oi.value,b=$('#pfVerify');if(v.length!==6||b.dataset.busy||!pending)return;buzz();b.dataset.busy=1;b.innerHTML='<span class="spin"></span>CHECKING';
      try{const profile=await verifyProfileV2(v);
        ob.classList.add('ok');b.innerHTML='VERIFIED ✓';SFX.play('right');
        setTimeout(()=>{const p=pending;pending=null;closeMd(true);apply(profile,p.changed)},550)}
      catch(e){b.innerHTML='VERIFY & SAVE';delete b.dataset.busy;
        ob.classList.remove('ok');void ob.offsetWidth;ob.classList.add('bad');SFX.play('wrong');
        toast(pickErrMsg(e,'That code doesn\'t match — try again'));oi.value='';paintOtp();oi.focus()}});

    /* ---- apply a server-confirmed profile back into the form ---- */
    function apply(profile,changed){mergeApi(profile);fill();replay($('.pf-hero'),'pf-ok');
      const n=changed?changed.length:0;
      toast(n?`Verified · ${n} change${n>1?'s':''} saved`:'Profile saved');SFX.play('unlock')}

    /* ---- the real save flow: PUT v2 → maybe channel → maybe OTP ---- */
    async function submitUpdate(payload,changed,verificationChannel){
      const btn=$('#pfSubmit');btn.disabled=true;
      try{const res=await updateProfileV2(payload,verificationChannel);
        if(res.kind==='success'){apply(res.profile,changed);closeMd(true)}
        else if(res.kind==='channelRequired'){
          if(!res.channels.length){toast(res.message||'No verification channel available');return}
          const rows=res.channels.map((ch,i)=>`<button type="button" class="pf-row" data-chan="${i}" style="border-color:var(--lime);background:#f1fcd2"><span class="ri" style="background:#eaf7d4;font-family:var(--f-display);color:#4c7a00">${pfEsc((ch.channel||'?').slice(0,2).toUpperCase())}</span><div><b>${pfEsc(ch.channel||'channel')}</b><small>${pfEsc(ch.masked_destination||'')}</small></div></button>`).join('');
          dialog('VERIFICATION','How should we send the code?',`<p>${pfEsc(res.message||'Pick where to send your verification code.')}</p><div style="display:flex;flex-direction:column;gap:7px">${rows}</div>`);
          $('#pfM2B').querySelectorAll('[data-chan]').forEach(b=>b.onclick=()=>{buzz();const ch=res.channels[Number(b.dataset.chan)];closeMd(true);
            submitUpdate(payload,changed,ch.channel||undefined)})}
        else showOtp(res,payload,changed)}
      catch(e){markFieldErrors(e);paintChanges();SFX.play('wrong');toast(pickErrMsg(e,'Failed to update profile'))}
      finally{btn.disabled=false}}

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
      const vals=Object.fromEntries(KEYS.map(k=>[k,val(k)]));
      const apiKeys=c.filter(k=>k!=='dumo'); /* DUMO switch is still mocked */
      if(!apiKeys.length){P.dumo=dumoNew||P.dumo;persistLocal();fill();toast('DUMO account switch saved');return}
      submitUpdate(toPayload(apiKeys,vals),apiKeys)});
    function cancelEdit(){const c=changes();if(!c.length)return;
      dialog('UNSAVED CHANGES','Discard changes?',`<p>You changed <b>${c.map(k=>LABEL[k]).join(', ')}</b>. These won't be saved.</p><button type="button" class="pf-mbtn dang" id="pfDisc">DISCARD</button><button type="button" class="pf-mbtn sec" id="pfKeep">Keep editing</button>`);
      $('#pfDisc').onclick=()=>{buzz();closeMd();fill();toast('Changes discarded')};$('#pfKeep').onclick=()=>{buzz();closeMd()}}
    $('#pfCancel').addEventListener('click',()=>{buzz();cancelEdit()});
    $('#pfEdit').hidden=true;

    /* ---- DUMO switch (mocked — no web endpoint yet) ---- */
    $('#pfDumoSw').addEventListener('click',e=>{e.stopPropagation();buzz();
      const cur=dumoNew||P.dumo,list=[...new Set([cur,P.dumo,'ri9_'+P.username,P.username+'_dumo'])];
      dialog('DUMO ACCOUNT','Switch account',`<div style="display:flex;flex-direction:column;gap:7px">${list.map(a=>`<button type="button" class="pf-row" data-dumo="${pfEsc(a)}" style="${a===cur?'border-color:var(--lime);background:#f1fcd2':''}"><span class="ri" style="background:#fff0d6;font-family:var(--f-display);color:#ff8a1e">DU</span><div><b>${pfEsc(a)}</b><small>${a===P.dumo?'Connected now':a===cur?'Selected · not saved yet':'Tap to select'}</small></div></button>`).join('')}</div><p class="pf-hint" style="margin-top:12px">The switch applies right away (demo).</p>`);
      $('#pfM2B').querySelectorAll('[data-dumo]').forEach(b=>b.onclick=()=>{buzz();dumoNew=b.dataset.dumo===P.dumo?null:b.dataset.dumo;$('#pfDumo').textContent=dumoNew||P.dumo;closeMd();paintChanges()})});

    /* ---- family code (mocked — no web endpoint yet) ---- */
    $('#pfFamCp').addEventListener('click',e=>{e.stopPropagation();buzz();const c=P.fam;
      (navigator.clipboard?navigator.clipboard.writeText(c):Promise.reject()).then(()=>toast('Family code copied'),()=>toast('Family code: '+c))});

    /* ---- bundle redeem (real: validate + redeem endpoints) ---- */
    $('#pfBundle').addEventListener('click',e=>{e.stopPropagation();buzz();
      dialog('BUNDLE','Redeem a code',`<p>Enter the code from your school, voucher or bundle card.</p><input class="pf-code" id="pfCode" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="RI9-XXXX-XXXX"><button type="button" class="pf-mbtn" id="pfRedeem" disabled>REDEEM</button>`);
      const ci=$('#pfCode'),rb=$('#pfRedeem');setTimeout(()=>ci.focus({preventScroll:true}),350);
      ci.oninput=()=>{ci.value=ci.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');rb.disabled=ci.value.replace(/-/g,'').length<6};
      ci.onkeydown=ev=>{if(ev.key==='Enter'&&!rb.disabled)rb.click()};
      rb.onclick=async()=>{buzz();const code=ci.value;rb.disabled=true;rb.innerHTML='<span class="spin"></span>CHECKING';
        try{const v=await validateBundleCode(code);
          if(!v.can_be_redeemed){rb.disabled=false;rb.innerHTML='REDEEM';toast(v.is_expired?'That code has expired':'That code can\'t be redeemed right now');return}
          const r=await redeemBundleCode(code);
          if(!P.bundles.includes(r.user_bundle.bundle_name)){P.bundles.push(r.user_bundle.bundle_name);LOCAL.bundles=P.bundles;persistLocal();paintBundles()}
          closeMd();SFX.play('right');toast(r.already_owned?'That bundle is already on your account':'Unlocked: '+r.user_bundle.bundle_name)}
        catch(err){rb.disabled=false;rb.innerHTML='REDEEM';markFieldErrors(err);SFX.play('wrong');toast(pickErrMsg(err,'That code doesn\'t look right — check it and try again'))}}});

    /* ---- log out (migrated from dumo_drill profile_screen + auth_provider) ---- */
    $('#pfOut').addEventListener('click',()=>{buzz();
      dialog('ACCOUNT','Log out?',`<p>You'll need your username and password to sign back in as <b>@${pfEsc(P.username)}</b>.</p><button type="button" class="pf-mbtn dang" id="pfOutOk">LOG OUT</button><button type="button" class="pf-mbtn sec" id="pfOutNo">Stay</button>`);
      const okBtn=$('#pfOutOk');
      const noBtn=$('#pfOutNo');
      okBtn.onclick=async()=>{
        buzz();
        okBtn.disabled=true;
        if(noBtn) noBtn.disabled=true;
        okBtn.innerHTML='<span class="spin"></span>LOGGING OUT...';
        try{
          await logout();
        }finally{
          useAppStore.setState({ role: null, meName: null, coinBalance: null, subjects: null });
          closeMd();
          toast('Logged out');
          setTimeout(()=>{location.href='auth.html'},400);
        }
      };
      if(noBtn) noBtn.onclick=()=>{buzz();closeMd()};
    });

    /* ---- back to the dashboard (prototype: data-back="home") ---- */
    scr.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>{buzz();
      // prototype's nav('home') plays the whoosh transition before switching screens;
      // wait ~260ms after playing so navigation doesn't cut the sound off
      setTimeout(()=>{SFX.play('whoosh');setTimeout(()=>location.href='index.html',260)},180)}));

    /* ---- boot: show a centered spinner, then load dropdowns + profile ---- */
    async function loadStatic(){
      try{COUNTRIES=await fetchCountries();
        $('#pfCountry').innerHTML='<option value="">Select your country</option>'+COUNTRIES.map(c=>`<option value="${c.id}">${pfEsc(c.country_name||'')}</option>`).join('')}
      catch(_){toast('Could not load countries')}
      try{YEARS=await fetchAgeRanges();
        $('#pfYear').innerHTML='<option value="">Select your year</option>'+YEARS.map(y=>`<option value="${y.id}">${pfEsc(y.label||'')}</option>`).join('')}
      catch(_){toast('Could not load years')}}
    async function loadProfile(){
      try{const p=await fetchProfile();if(p)mergeApi(p);else toast('No profile yet — fill it in below')}
      catch(e){toast(pickErrMsg(e,'Could not load your profile'))}
      scr.classList.remove('loading'); /* done — hide the spinner, reveal the form */
      fill();form.classList.add('anim')} /* staggered card entry once data is in */

    /* pull-to-refresh hook — re-pull the dropdowns + profile from the
       API behind the page's centered spinner. A refresh while the form
       has UNSAVED edits would clobber them, so bail with a hint. */
    pullRefresh=async()=>{
      if(changes().length){toast('Save or discard your changes first');return}
      if(openMd)closeMd(true);
      scr.classList.add('loading');
      await loadStatic();
      await loadProfile()};

    scr.classList.add('loading'); /* spinner shows while the API answers */
    await loadStatic();
    await loadProfile();
  })();

  /* ---------- pull-to-refresh (touch) ----------
     The page scrolls inside .pf-body, so the gesture only arms when
     that container is at scrollTop 0. Modals (pfBd backdrop) and an
     in-flight Verify & save opt out. */
  mountPullToRefresh({
    refresh:async()=>{if(pullRefresh)await pullRefresh()},
    scroller:()=>$('#pfBody'),
    disabled:()=>$('#pfBd').classList.contains('open')||$('#pfSubmit').disabled,
  });

}
