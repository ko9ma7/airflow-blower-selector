const R_AIR = 287.05;
const MM_AQ_PER_KPA = 101.971621;

const presets = [
  {id:'light',label:'1단계 · 가벼운 이물 / 예비 건조',min:15,max:25,def:20},
  {id:'standard-water',label:'2단계 · 일반 물방울 제거',min:25,max:40,def:32},
  {id:'water-film',label:'3단계 · 수막 / 강한 헹굼수 제거',min:40,max:55,def:48},
  {id:'debris',label:'4단계 · 스케일 / 무거운 이물',min:45,max:65,def:55},
  {id:'viscous',label:'5단계 · 점성 액체 / 강력 제거',min:55,max:80,def:65}
];
const nozzleLabels = {'multi-hole':'다공 홀','slot':'슬롯 / 장공','rectangle':'사각','round':'원형','custom':'지정 면적'};

const defaultConfig = {
  projectName:'도금 연속라인 Air Blow 검토', lineName:'PLATING LINE #1', preparedBy:'',
  presetId:'standard-water', globalVelocityMps:32, airTempC:20, ambientPressureKpa:101.325,
  mainLossKpa:0.5, flowMarginPct:15, pressureMarginPct:20, blowerEfficiencyPct:55, motorMarginPct:15,
  reportTheme:'technical'
};
const defaultNozzles = [
  {id:'n1',name:'상부 Air Knife',type:'slot',qty:2,cd:0.90,velocityMps:32,branchLossKpa:0.20,slotLengthMm:600,slotGapMm:1.5,openingsPerNozzle:1,holeDiameterMm:3,widthMm:20,heightMm:2,diameterMm:12,customAreaMm2:900},
  {id:'n2',name:'측면 다공 노즐',type:'multi-hole',qty:2,cd:0.88,velocityMps:32,branchLossKpa:0.25,slotLengthMm:300,slotGapMm:1.0,openingsPerNozzle:24,holeDiameterMm:3,widthMm:15,heightMm:2,diameterMm:10,customAreaMm2:250}
];
const defaultCandidates = [
  {id:'c1',name:'후보 A',flowM3min:4.5,pressureKpa:3.0,motorKw:0.75},
  {id:'c2',name:'후보 B',flowM3min:6.0,pressureKpa:5.0,motorKw:1.5}
];

const CONFIG_KEY='airflow-selector-config-v2';
const NOZZLE_KEY='airflow-selector-nozzles-v2';
const HISTORY_KEY='airflow-selector-history-v2';
const CANDIDATE_KEY='airflow-selector-candidates-v2';
const THEME_KEY='airflow-selector-theme-v1';
const $ = id => document.getElementById(id);
const safeParse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback}catch{return fallback}};
const clone=x=>JSON.parse(JSON.stringify(x));
let config={...defaultConfig,...safeParse(localStorage.getItem(CONFIG_KEY),{})};
let nozzles=safeParse(localStorage.getItem(NOZZLE_KEY),clone(defaultNozzles));
let candidates=safeParse(localStorage.getItem(CANDIDATE_KEY),clone(defaultCandidates));
let history=safeParse(localStorage.getItem(HISTORY_KEY),[]);
let theme=localStorage.getItem(THEME_KEY)||'system';
let result=null;

function uid(prefix='x'){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}
function num(v,min=0){v=Number(v);return Number.isFinite(v)?Math.max(v,min):min}
function clamp(v,a,b){return Math.min(Math.max(Number(v)||0,a),b)}
function fmt(v,d=2){return Number.isFinite(v)?v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'-'}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function motorFrame(kW){const frames=[.2,.4,.75,1.5,2.2,3.7,5.5,7.5,11,15,18.5,22,30,37,45,55,75,90,110];return frames.find(x=>x>=kW)||Math.ceil(kW/10)*10}
function persist(){localStorage.setItem(CONFIG_KEY,JSON.stringify(config));localStorage.setItem(NOZZLE_KEY,JSON.stringify(nozzles));localStorage.setItem(CANDIDATE_KEY,JSON.stringify(candidates))}
function toast(msg){const el=$('toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2200)}

function airDensity(){const tK=config.airTempC+273.15;return num(config.ambientPressureKpa,1)*1000/(R_AIR*Math.max(tK,1))}
function openingAreaMm2(n){
  switch(n.type){
    case 'multi-hole': return Math.PI*num(n.holeDiameterMm)**2/4;
    case 'slot': return num(n.slotLengthMm)*num(n.slotGapMm);
    case 'rectangle': return num(n.widthMm)*num(n.heightMm);
    case 'round': return Math.PI*num(n.diameterMm)**2/4;
    case 'custom': return num(n.customAreaMm2);
    default:return 0;
  }
}
function nozzleSpec(n){
  const count=Math.max(1,Math.round(num(n.openingsPerNozzle,1)));
  if(n.type==='multi-hole') return `Ø${fmt(n.holeDiameterMm,1)} mm × ${count}공/노즐`;
  if(n.type==='slot') return `${fmt(n.slotLengthMm,0)} × ${fmt(n.slotGapMm,2)} mm × ${count} slot/노즐`;
  if(n.type==='rectangle') return `${fmt(n.widthMm,1)} × ${fmt(n.heightMm,1)} mm × ${count}개/노즐`;
  if(n.type==='round') return `Ø${fmt(n.diameterMm,1)} mm × ${count}개/노즐`;
  return `${fmt(n.customAreaMm2,1)} mm²/노즐`;
}
function calcNozzle(n,rho){
  const openings=n.type==='custom'?1:Math.max(1,Math.round(num(n.openingsPerNozzle,1)));
  const areaSingleOpening=openingAreaMm2(n);
  const areaPerNozzle=n.type==='custom'?areaSingleOpening:areaSingleOpening*openings;
  const qty=Math.max(0,Math.round(num(n.qty)));
  const totalAreaMm2=areaPerNozzle*qty;
  const v=num(n.velocityMps);
  const cd=clamp(n.cd,.1,1);
  const qPerNozzleM3min=(areaPerNozzle/1e6)*v*60;
  const groupFlowM3min=qPerNozzleM3min*qty;
  const dynamicPressureKpa=.5*rho*v*v/1000;
  const nozzleDeltaPKpa=.5*rho*(v/cd)**2/1000;
  const branchLossKpa=num(n.branchLossKpa);
  const branchRequiredKpa=nozzleDeltaPKpa+branchLossKpa;
  return {...n,openings,areaSingleOpening,areaPerNozzle,totalAreaMm2,qPerNozzleM3min,groupFlowM3min,dynamicPressureKpa,nozzleDeltaPKpa,branchRequiredKpa,cd,v,qty};
}
function calculate(){
  const rho=airDensity();
  const groups=nozzles.map(n=>calcNozzle(n,rho));
  const rawFlow=groups.reduce((s,g)=>s+g.groupFlowM3min,0);
  const designFlow=rawFlow*(1+num(config.flowMarginPct)/100);
  const critical=groups.reduce((a,b)=>!a||b.branchRequiredKpa>a.branchRequiredKpa?b:a,null);
  const criticalBranch=critical?critical.branchRequiredKpa:0;
  const designPressure=(criticalBranch+num(config.mainLossKpa))*(1+num(config.pressureMarginPct)/100);
  const airPower=designPressure*(designFlow/60);
  const eta=clamp(config.blowerEfficiencyPct/100,.1,1);
  const shaft=airPower/eta;
  const motorReq=shaft*(1+num(config.motorMarginPct)/100);
  const warnings=[];
  if(!groups.length) warnings.push('노즐이 없습니다. 최소 1개 노즐군을 추가하세요.');
  groups.forEach((g,i)=>{
    if(g.areaPerNozzle<=0||g.qty<=0) warnings.push(`${g.name||`노즐 #${i+1}`}: 규격 또는 수량이 0입니다.`);
    if(g.v>=100) warnings.push(`${g.name||`노즐 #${i+1}`}: 출구 풍속이 100 m/s 이상입니다. 압축성·소음·제품 손상을 검토하세요.`);
    if(g.cd<.6) warnings.push(`${g.name||`노즐 #${i+1}`}: Cd가 0.60 미만입니다. 제조사/실측값인지 확인하세요.`);
  });
  if(designPressure>=20) warnings.push('설계 풍압이 20 kPa 이상입니다. 단순 비압축성 모델 외에 압축성 유동 검토를 권장합니다.');
  if(groups.length>1){const ps=groups.map(g=>g.branchRequiredKpa).filter(x=>x>0);if(ps.length>1){const pMax=Math.max(...ps),pMin=Math.min(...ps);if(pMax-pMin>Math.max(.2,pMax*.2)) warnings.push('노즐군별 요구 분기압 차이가 큽니다. 하나의 매니폴드에서 목표 풍속을 맞추려면 저저항 분기에 밸런싱 밸브/오리피스가 필요할 수 있습니다.');}}
  return {rho,groups,rawFlowM3min:rawFlow,designFlowM3min:designFlow,designFlowM3h:designFlow*60,critical,criticalBranchKpa:criticalBranch,designPressureKpa:designPressure,designPressureMbar:designPressure*10,designPressureMmAq:designPressure*MM_AQ_PER_KPA,airPowerKw:airPower,shaftPowerKw:shaft,motorRequiredKw:motorReq,recommendedMotorKw:motorFrame(motorReq),warnings};
}
function assess(c){return result&&c.flowM3min>=result.designFlowM3min&&c.pressureKpa>=result.designPressureKpa&&(num(c.motorKw)===0||c.motorKw>=result.motorRequiredKw)}

function geometryFields(n){
  const commonCount=`<label class="mini-field"><span>${n.type==='multi-hole'?'홀 수/노즐':n.type==='slot'?'슬롯 수/노즐':'개구 수/노즐'}</span><div class="unit-input"><input data-k="openingsPerNozzle" type="number" min="1" step="1" value="${n.openingsPerNozzle}"><em>EA</em></div></label>`;
  if(n.type==='multi-hole') return `<label class="mini-field"><span>홀 직경</span><div class="unit-input"><input data-k="holeDiameterMm" type="number" min="0" step="0.1" value="${n.holeDiameterMm}"><em>mm</em></div></label>${commonCount}`;
  if(n.type==='slot') return `<label class="mini-field"><span>슬롯 길이</span><div class="unit-input"><input data-k="slotLengthMm" type="number" min="0" step="1" value="${n.slotLengthMm}"><em>mm</em></div></label><label class="mini-field"><span>Gap</span><div class="unit-input"><input data-k="slotGapMm" type="number" min="0" step="0.05" value="${n.slotGapMm}"><em>mm</em></div></label>${commonCount}`;
  if(n.type==='rectangle') return `<label class="mini-field"><span>폭</span><div class="unit-input"><input data-k="widthMm" type="number" min="0" step="0.1" value="${n.widthMm}"><em>mm</em></div></label><label class="mini-field"><span>높이</span><div class="unit-input"><input data-k="heightMm" type="number" min="0" step="0.1" value="${n.heightMm}"><em>mm</em></div></label>${commonCount}`;
  if(n.type==='round') return `<label class="mini-field"><span>직경</span><div class="unit-input"><input data-k="diameterMm" type="number" min="0" step="0.1" value="${n.diameterMm}"><em>mm</em></div></label>${commonCount}`;
  return `<label class="mini-field"><span>노즐 1개 총 개구면적</span><div class="unit-input"><input data-k="customAreaMm2" type="number" min="0" step="1" value="${n.customAreaMm2}"><em>mm²</em></div></label>`;
}
function renderNozzles(){
  if(!result) result=calculate();
  const root=$('nozzleList');
  if(!nozzles.length){root.innerHTML='<div class="empty-state nozzle-empty"><b>노즐 구성이 비어 있습니다.</b><span>“노즐 추가”를 눌러 실제 설치할 노즐을 입력하세요.</span></div>';return}
  root.innerHTML=nozzles.map((n,i)=>{
    const g=result.groups[i]||calcNozzle(n,result.rho);
    return `<article class="nozzle-card" data-id="${n.id}">
      <header class="nozzle-card-head"><div class="nozzle-index">N${String(i+1).padStart(2,'0')}</div><input class="nozzle-name" data-k="name" value="${escapeHtml(n.name)}" aria-label="노즐군 이름"><select class="nozzle-type" data-k="type">${Object.entries(nozzleLabels).map(([v,l])=>`<option value="${v}" ${n.type===v?'selected':''}>${l}</option>`).join('')}</select><div class="nozzle-actions"><button data-action="duplicate" title="복제">복제</button><button data-action="delete" class="danger" title="삭제">삭제</button></div></header>
      <div class="nozzle-input-grid geometry-inputs">${geometryFields(n)}</div>
      <div class="nozzle-input-grid common-inputs">
        <label class="mini-field strong"><span>노즐 수량</span><div class="unit-input"><input data-k="qty" type="number" min="0" step="1" value="${n.qty}"><em>EA</em></div></label>
        <label class="mini-field"><span>적용 풍속</span><div class="unit-input"><input data-k="velocityMps" type="number" min="0" step="1" value="${n.velocityMps}"><em>m/s</em></div></label>
        <label class="mini-field"><span>방출계수 Cd</span><input data-k="cd" type="number" min="0.1" max="1" step="0.01" value="${n.cd}"></label>
        <label class="mini-field"><span>분기 배관 손실</span><div class="unit-input"><input data-k="branchLossKpa" type="number" min="0" step="0.05" value="${n.branchLossKpa}"><em>kPa</em></div></label>
      </div>
      <div class="nozzle-result-strip">
        <div><span>노즐 1개 개구면적</span><b>${fmt(g.areaPerNozzle,1)}</b><em>mm²</em></div>
        <div><span>총 개구면적</span><b>${fmt(g.totalAreaMm2,1)}</b><em>mm²</em></div>
        <div><span>1개당 풍량</span><b>${fmt(g.qPerNozzleM3min,3)}</b><em>m³/min</em></div>
        <div class="accent"><span>그룹 풍량</span><b>${fmt(g.groupFlowM3min,3)}</b><em>m³/min</em></div>
        <div><span>노즐 차압</span><b>${fmt(g.nozzleDeltaPKpa,3)}</b><em>kPa</em></div>
        <div class="pressure"><span>분기 요구압</span><b>${fmt(g.branchRequiredKpa,3)}</b><em>kPa</em></div>
      </div>
    </article>`;
  }).join('');
  root.querySelectorAll('.nozzle-card').forEach(card=>{
    const id=card.dataset.id;
    card.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',e=>updateNozzle(id,e.target.dataset.k,e.target.value,e.target)));
    card.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>nozzleAction(id,btn.dataset.action)));
  });
}
function updateNozzle(id,key,value,el){
  const n=nozzles.find(x=>x.id===id);if(!n)return;
  n[key]=['name','type'].includes(key)?value:Number(value);
  persist();
  if(key==='type'){renderAll();return}
  result=calculate();renderSummary();renderNozzleResultsOnly();updateReport();
}
function renderNozzleResultsOnly(){
  document.querySelectorAll('.nozzle-card').forEach((card,i)=>{
    const g=result.groups[i]; if(!g)return;
    const vals=[fmt(g.areaPerNozzle,1),fmt(g.totalAreaMm2,1),fmt(g.qPerNozzleM3min,3),fmt(g.groupFlowM3min,3),fmt(g.nozzleDeltaPKpa,3),fmt(g.branchRequiredKpa,3)];
    card.querySelectorAll('.nozzle-result-strip b').forEach((b,j)=>b.textContent=vals[j]);
  });
}
function nozzleAction(id,action){
  const ix=nozzles.findIndex(x=>x.id===id);if(ix<0)return;
  if(action==='delete'){nozzles.splice(ix,1)}
  if(action==='duplicate'){const copy={...clone(nozzles[ix]),id:uid('n'),name:`${nozzles[ix].name} 복제`};nozzles.splice(ix+1,0,copy)}
  persist();renderAll();
}
function addNozzle(){nozzles.push({id:uid('n'),name:`노즐군 ${nozzles.length+1}`,type:'slot',qty:1,cd:.9,velocityMps:config.globalVelocityMps,branchLossKpa:.2,slotLengthMm:500,slotGapMm:1.5,openingsPerNozzle:1,holeDiameterMm:3,widthMm:20,heightMm:2,diameterMm:12,customAreaMm2:500});persist();renderAll();setTimeout(()=>document.querySelector('.nozzle-card:last-child')?.scrollIntoView({behavior:'smooth',block:'center'}),0)}

function renderSummary(){
  result=calculate();persist();
  $('dutyFlow').textContent=fmt(result.designFlowM3min,2);$('dutyPressure').textContent=fmt(result.designPressureKpa,2);$('dutyMotor').textContent=fmt(result.recommendedMotorKw,2);
  $('metricRawFlow').textContent=fmt(result.rawFlowM3min,2);$('metricFlowHour').textContent=fmt(result.designFlowM3h,0);$('metricMbar').textContent=fmt(result.designPressureMbar,1);$('metricMmAq').textContent=fmt(result.designPressureMmAq,0);$('metricCritical').textContent=result.critical?.name||'-';$('metricShaft').textContent=fmt(result.shaftPowerKw,3);$('metricPowerNote').textContent=`계산 모터 요구 ${fmt(result.motorRequiredKw,3)} kW`;
  $('warningBox').hidden=!result.warnings.length;$('warningList').innerHTML=result.warnings.map(w=>`<p>${escapeHtml(w)}</p>`).join('');renderCandidates();
}
function renderAll(){result=calculate();renderNozzles();renderSummary();updateReport()}

function renderCandidates(){
  const body=$('candidateBody');body.innerHTML='';
  candidates.forEach(c=>{
    const tr=document.createElement('tr');
    const name=document.createElement('input');name.value=c.name;name.className='table-input';name.addEventListener('input',e=>{c.name=e.target.value;persist();updateReport()});const td0=document.createElement('td');td0.append(name);tr.append(td0);
    [['flowM3min','m³/min'],['pressureKpa','kPa'],['motorKw','kW']].forEach(([key,unit])=>{const td=document.createElement('td'),w=document.createElement('div');w.className='table-number';const input=document.createElement('input');input.type='number';input.step='.1';input.value=c[key];input.addEventListener('input',e=>{c[key]=Number(e.target.value);persist();renderCandidates();updateReport()});const sp=document.createElement('span');sp.textContent=unit;w.append(input,sp);td.append(w);tr.append(td)});
    const ok=assess(c),tdS=document.createElement('td'),pill=document.createElement('span');pill.className=`status-pill ${ok?'pass':'fail'}`;pill.textContent=ok?'적합':'부족';tdS.append(pill);tr.append(tdS);
    const tdD=document.createElement('td'),del=document.createElement('button');del.className='delete-btn';del.textContent='×';del.addEventListener('click',()=>{candidates=candidates.filter(x=>x.id!==c.id);persist();renderCandidates();updateReport()});tdD.append(del);tr.append(tdD);body.append(tr);
  });
}
function addCandidate(){candidates.push({id:uid('c'),name:`후보 ${String.fromCharCode(65+candidates.length)}`,flowM3min:Math.ceil(result.designFlowM3min*1.1*10)/10,pressureKpa:Math.ceil(result.designPressureKpa*1.1*10)/10,motorKw:result.recommendedMotorKw});persist();renderCandidates();updateReport()}

function populatePreset(){ $('presetId').innerHTML=presets.map(p=>`<option value="${p.id}">${p.label}</option>`).join('') }
function syncInputs(){
  ['globalVelocityMps','airTempC','ambientPressureKpa','mainLossKpa','flowMarginPct','pressureMarginPct','blowerEfficiencyPct','motorMarginPct'].forEach(id=>$(id).value=config[id]);
  ['projectName','lineName','preparedBy'].forEach(id=>$(id).value=config[id]);$('presetId').value=config.presetId;$('reportTheme').value=config.reportTheme;
  const p=presets.find(x=>x.id===config.presetId)||presets[1];$('presetHint').textContent=`권장 시작구간 ${p.min}–${p.max} m/s`;
}
function updateReport(){
  if(!result)result=calculate();const now=new Date();$('reportSheet').className=`report-sheet report-${config.reportTheme}`;$('rProject').textContent=config.projectName||'-';$('rLine').textContent=config.lineName||'-';$('rPrepared').textContent=config.preparedBy||'-';$('rDate').textContent=now.toLocaleDateString('ko-KR');$('rFlow').textContent=fmt(result.designFlowM3min,2);$('rPressure').textContent=fmt(result.designPressureKpa,2);$('rMotor').textContent=fmt(result.recommendedMotorKw,2);
  $('rNozzles').innerHTML=result.groups.map((g,i)=>`<tr><td>${escapeHtml(g.name||`N${i+1}`)}</td><td>${escapeHtml(nozzleLabels[g.type])} · ${escapeHtml(nozzleSpec(g))}</td><td>${g.qty} EA</td><td>${fmt(g.v,1)} m/s</td><td>${fmt(g.totalAreaMm2,1)} mm²</td><td>${fmt(g.groupFlowM3min,3)} m³/min</td><td>${fmt(g.nozzleDeltaPKpa,3)} kPa</td><td>${fmt(g.branchRequiredKpa,3)} kPa</td></tr>`).join('');
  const p=presets.find(x=>x.id===config.presetId)||presets[1];
  const inRows=[['제거 강도',p.label],['공기 밀도',`${fmt(result.rho,3)} kg/m³`],['메인 배관/필터 손실',`${fmt(config.mainLossKpa,2)} kPa`],['풍량 / 풍압 여유',`${config.flowMarginPct}% / ${config.pressureMarginPct}%`],['블로워 효율 추정',`${config.blowerEfficiencyPct}%`]];
  const outRows=[['총 계산 풍량 ΣQ',`${fmt(result.rawFlowM3min,3)} m³/min`],['설계 풍량',`${fmt(result.designFlowM3min,3)} m³/min (${fmt(result.designFlowM3h,0)} m³/h)`],['지배 노즐군',result.critical?.name||'-'],['지배 분기압',`${fmt(result.criticalBranchKpa,3)} kPa`],['설계 풍압',`${fmt(result.designPressureKpa,3)} kPa / ${fmt(result.designPressureMbar,1)} mbar / ${fmt(result.designPressureMmAq,0)} mmAq`],['축동력 추정',`${fmt(result.shaftPowerKw,3)} kW`]];
  $('rInputs').innerHTML=inRows.map(r=>`<tr><th>${escapeHtml(r[0])}</th><td>${escapeHtml(String(r[1]))}</td></tr>`).join('');$('rResults').innerHTML=outRows.map(r=>`<tr><th>${escapeHtml(r[0])}</th><td>${escapeHtml(String(r[1]))}</td></tr>`).join('');
  $('rCandidates').innerHTML=candidates.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${fmt(c.flowM3min,2)} m³/min</td><td>${fmt(c.pressureKpa,2)} kPa</td><td>${fmt(c.motorKw,2)} kW</td><td>${assess(c)?'적합':'부족'}</td></tr>`).join('');$('rWarnings').innerHTML=result.warnings.map(w=>`<p class="report-warning">• ${escapeHtml(w)}</p>`).join('');$('rGenerated').textContent=`Generated ${now.toLocaleString('ko-KR')}`;
}

function renderHistory(){const root=$('historyList');root.innerHTML='';if(!history.length){root.innerHTML='<div class="empty-state"><b>저장된 계산이 없습니다.</b><span>현재 노즐 구성을 “계산 저장”으로 기록할 수 있습니다.</span></div>';return}history.forEach(item=>{const row=document.createElement('article');row.className='history-item';row.innerHTML=`<div><b>${escapeHtml(item.config.projectName||'이름 없는 계산')}</b><span>${new Date(item.savedAt).toLocaleString('ko-KR')} · 노즐군 ${item.nozzles.length}개</span></div><div class="history-values"><span>${fmt(item.result.designFlowM3min,2)} m³/min</span><span>${fmt(item.result.designPressureKpa,2)} kPa</span></div>`;const btn=document.createElement('button');btn.className='btn secondary';btn.textContent='불러오기';btn.addEventListener('click',()=>{config={...defaultConfig,...item.config};nozzles=clone(item.nozzles);candidates=clone(item.candidates||defaultCandidates);syncInputs();renderAll();activateTab('calculator');toast('저장된 계산을 불러왔습니다.')});row.append(btn);root.append(row)})}
function saveCurrent(){result=calculate();const item={id:uid('h'),savedAt:new Date().toISOString(),config:clone(config),nozzles:clone(nozzles),candidates:clone(candidates),result:{designFlowM3min:result.designFlowM3min,designPressureKpa:result.designPressureKpa}};history=[item,...history].slice(0,20);localStorage.setItem(HISTORY_KEY,JSON.stringify(history));toast('현재 노즐 구성과 계산을 저장했습니다.')}
function activateTab(name){document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`tab-${name}`);document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));if(name==='report')updateReport();if(name==='history')renderHistory()}
function applyTheme(){const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem(THEME_KEY,theme)}
function cycleTheme(){theme=theme==='light'?'dark':theme==='dark'?'system':'light';applyTheme();toast(`테마: ${theme}`)}
function encodeState(data){const bytes=new TextEncoder().encode(JSON.stringify(data));let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function decodeState(s){s=s.replaceAll('-','+').replaceAll('_','/');while(s.length%4)s+='=';const binary=atob(s),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}
async function shareState(){const url=new URL(location.href);url.hash=`s=${encodeState({config,nozzles,candidates})}`;try{await navigator.clipboard.writeText(url.toString());toast('공유 링크를 복사했습니다.')}catch{prompt('아래 링크를 복사하세요.',url.toString())}}
function loadShared(){try{if(location.hash.startsWith('#s=')){const x=decodeState(location.hash.slice(3));config={...defaultConfig,...x.config};if(Array.isArray(x.nozzles))nozzles=x.nozzles;if(Array.isArray(x.candidates))candidates=x.candidates;toast('공유된 노즐 구성을 불러왔습니다.')}}catch{toast('공유 링크를 해석하지 못했습니다.')}}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportJson(){downloadBlob(new Blob([JSON.stringify({config,nozzles,result,candidates,generatedAt:new Date().toISOString()},null,2)],{type:'application/json'}),'airflow-multi-nozzle-calculation.json')}
async function exportPng(){updateReport();const el=$('reportSheet'),width=Math.ceil(el.scrollWidth),height=Math.ceil(el.scrollHeight);let css='';for(const sheet of document.styleSheets){try{css+=[...sheet.cssRules].map(r=>r.cssText).join('\n')}catch{}}const cloneEl=el.cloneNode(true);const xml=`<div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${cloneEl.outerHTML}</div>`;const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();try{await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});const scale=2,canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.drawImage(img,0,0);const out=await new Promise(res=>canvas.toBlob(res,'image/png',1));if(out)downloadBlob(out,'airflow-ring-blower-report.png');toast('PNG를 저장했습니다.')}catch{toast('PNG 생성에 실패했습니다. PDF/인쇄를 이용해 주세요.')}finally{URL.revokeObjectURL(url)}}

function bind(){
  ['globalVelocityMps','airTempC','ambientPressureKpa','mainLossKpa','flowMarginPct','pressureMarginPct','blowerEfficiencyPct','motorMarginPct'].forEach(id=>$(id).addEventListener('input',e=>{config[id]=Number(e.target.value);renderAll()}));
  ['projectName','lineName','preparedBy'].forEach(id=>$(id).addEventListener('input',e=>{config[id]=e.target.value;persist();updateReport()}));
  $('presetId').addEventListener('change',e=>{config.presetId=e.target.value;const p=presets.find(x=>x.id===config.presetId);if(p)config.globalVelocityMps=p.def;syncInputs();persist()});
  $('applyVelocityBtn').addEventListener('click',()=>{nozzles.forEach(n=>n.velocityMps=config.globalVelocityMps);persist();renderAll();toast(`${config.globalVelocityMps} m/s를 전체 노즐에 적용했습니다.`)});
  $('addNozzleBtn').addEventListener('click',addNozzle);$('addCandidateBtn').addEventListener('click',addCandidate);
  document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));$('themeBtn').addEventListener('click',cycleTheme);$('shareBtn').addEventListener('click',shareState);$('saveBtn').addEventListener('click',saveCurrent);
  $('reportTheme').addEventListener('change',e=>{config.reportTheme=e.target.value;persist();updateReport()});$('jsonBtn').addEventListener('click',exportJson);$('pngBtn').addEventListener('click',exportPng);$('pdfBtn').addEventListener('click',()=>{activateTab('report');setTimeout(()=>window.print(),50)});
  $('clearHistoryBtn').addEventListener('click',()=>{history=[];localStorage.setItem(HISTORY_KEY,'[]');renderHistory();toast('이력을 삭제했습니다.')});$('resetBtn').addEventListener('click',()=>{config=clone(defaultConfig);nozzles=clone(defaultNozzles);candidates=clone(defaultCandidates);syncInputs();renderAll();toast('기본 다중 노즐 예제로 초기화했습니다.')});
}

populatePreset();loadShared();applyTheme();syncInputs();bind();renderAll();
