const R_AIR = 287.05;

const presets = [
  {id:'light',label:'1단계 · 가벼운 이물 / 예비 건조',short:'가벼운 이물',min:15,max:25,def:20,description:'헐거운 먼지, 잔수 제거를 위한 초기 검토 구간',examples:'가벼운 먼지, 작은 물방울, 표면 예비 건조'},
  {id:'standard-water',label:'2단계 · 일반 물방울 제거',short:'일반 수분',min:25,max:40,def:32,description:'도금 연속라인의 일반적인 물방울 제거를 시작하기 좋은 구간',examples:'수세 후 물방울, 얇은 수막 시작 구간'},
  {id:'water-film',label:'3단계 · 수막 / 강한 헹굼수 제거',short:'수막 제거',min:40,max:55,def:48,description:'연속적으로 남는 수막이나 홈 주변 수분을 밀어내는 초기 검토 구간',examples:'수막, 단차부 수분, 연속라인 드레인 보조'},
  {id:'debris',label:'4단계 · 칩 / 스케일 / 무거운 이물',short:'무거운 이물',min:45,max:65,def:55,description:'부착력이 더 큰 고형 이물을 제거하기 위한 강한 제트 구간',examples:'절삭칩, 스케일, 비교적 무거운 고형 이물'},
  {id:'viscous',label:'5단계 · 점성 액체 / 강력 제거',short:'점성 액체',min:55,max:80,def:65,description:'오일·쿨런트 등 점성이 큰 액체를 대상으로 한 높은 풍속 구간',examples:'오일, 쿨런트, 강한 액막 제거'}
];

const nozzleLabels = {'multi-hole':'다공 홀 노즐','slot':'슬롯 / 장공 노즐','rectangle':'사각 노즐','round':'원형 노즐','custom':'사용자 지정 면적'};
const defaultConfig = {
  projectName:'도금 연속라인 Air Blow 검토', lineName:'PLATING LINE #1', preparedBy:'',
  nozzleType:'slot', assemblyCount:2, holesPerAssembly:24, holeDiameterMm:3,
  slotLengthMm:600, slotGapMm:1.5, slotsPerAssembly:1,
  rectWidthMm:20, rectHeightMm:3, rectOpeningsPerAssembly:1,
  roundDiameterMm:20, roundOpeningsPerAssembly:1, customAreaMm2:900,
  dischargeCoefficient:0.9, presetId:'standard-water', targetMode:'velocity',
  targetVelocityMps:32, targetPressureKpa:1, airTempC:20, ambientPressureKpa:101.325,
  systemLossKpa:0.7, flowMarginPct:15, pressureMarginPct:20, blowerEfficiencyPct:55,
  motorMarginPct:15, reportTheme:'technical'
};
const defaultCandidates = [
  {id:'candidate-a',name:'후보 A',flowM3min:4.5,pressureKpa:3,motorKw:0.75},
  {id:'candidate-b',name:'후보 B',flowM3min:6,pressureKpa:5,motorKw:1.5}
];
const CONFIG_KEY='airflow-selector-config-v1', HISTORY_KEY='airflow-selector-history-v1', CANDIDATE_KEY='airflow-selector-candidates-v1', THEME_KEY='airflow-selector-theme-v1';
const $ = (id) => document.getElementById(id);
const safeParse = (raw,fallback) => {try{return raw?JSON.parse(raw):fallback}catch{return fallback}};
let config = {...defaultConfig,...safeParse(localStorage.getItem(CONFIG_KEY),{})};
let candidates = safeParse(localStorage.getItem(CANDIDATE_KEY),defaultCandidates);
let history = safeParse(localStorage.getItem(HISTORY_KEY),[]);
let theme = localStorage.getItem(THEME_KEY)||'system';
let result = null;

function areaPerAssemblyMm2(){
  switch(config.nozzleType){
    case 'multi-hole': return config.holesPerAssembly*Math.PI*config.holeDiameterMm**2/4;
    case 'slot': return config.slotsPerAssembly*config.slotLengthMm*config.slotGapMm;
    case 'rectangle': return config.rectOpeningsPerAssembly*config.rectWidthMm*config.rectHeightMm;
    case 'round': return config.roundOpeningsPerAssembly*Math.PI*config.roundDiameterMm**2/4;
    case 'custom': return config.customAreaMm2;
    default:return 0;
  }
}
function calculate(){
  const warnings=[];
  const tempK=config.airTempC+273.15, ambientPa=Math.max(config.ambientPressureKpa,1)*1000;
  const rho=ambientPa/(R_AIR*tempK), areaOne=Math.max(areaPerAssemblyMm2(),0), areaTotalMm2=areaOne*Math.max(config.assemblyCount,0), area=areaTotalMm2/1e6;
  const cd=Math.min(Math.max(config.dischargeCoefficient,0.1),1);
  let v=0, nozzlePa=0;
  if(config.targetMode==='velocity'){v=Math.max(config.targetVelocityMps,0);nozzlePa=.5*rho*(v/cd)**2}else{nozzlePa=Math.max(config.targetPressureKpa,0)*1000;v=cd*Math.sqrt(2*nozzlePa/rho)}
  const dynPa=.5*rho*v*v, qM3s=area*v, qM3min=qM3s*60, designFlow=qM3min*(1+Math.max(config.flowMarginPct,0)/100);
  const designPressure=(nozzlePa/1000+Math.max(config.systemLossKpa,0))*(1+Math.max(config.pressureMarginPct,0)/100);
  const designQ=designFlow/60, airPower=designPressure*designQ, eta=Math.min(Math.max(config.blowerEfficiencyPct/100,.1),1), shaft=airPower/eta, motor=shaft*(1+Math.max(config.motorMarginPct,0)/100);
  const pressureRatio=(ambientPa+designPressure*1000)/ambientPa;
  if(areaOne<=0||config.assemblyCount<=0)warnings.push('노즐 개구 면적 또는 노즐 수량이 0입니다. 형상 값을 확인하세요.');
  if(config.dischargeCoefficient<.6||config.dischargeCoefficient>1)warnings.push('Cd 값이 일반적인 초기 설계 범위를 벗어났습니다. 제조사 시험값 또는 실측값을 권장합니다.');
  if(designPressure>=20)warnings.push('설계 압력이 20 kPa 이상입니다. 압축성 유동 계산 또는 제조사 성능곡선을 추가 확인하세요.');
  if(v>=100)warnings.push('제트 풍속이 100 m/s 이상입니다. 소음·진동·제품 손상 및 압축성 효과를 검토하세요.');
  if(config.systemLossKpa===0)warnings.push('시스템 손실이 0 kPa입니다. 실제 배관·필터·밸브·매니폴드 손실을 반영하세요.');
  return {airDensityKgM3:rho,areaPerAssemblyMm2:areaOne,totalAreaMm2:areaTotalMm2,totalAreaM2:area,equivalentVelocityMps:v,nozzleDeltaPKpa:nozzlePa/1000,dynamicPressureKpa:dynPa/1000,rawFlowM3s:qM3s,rawFlowM3min:qM3min,designFlowM3min:designFlow,designPressureKpa:designPressure,airPowerKw:airPower,shaftPowerKw:shaft,recommendedMotorKw:motor,pressureRatio,warnings};
}
function fmt(v,d=2){return Number.isFinite(v)?v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'-'}
function motorFrame(kW){const frames=[.2,.4,.75,1.5,2.2,3.7,5.5,7.5,11,15,18.5,22,30,37,45,55,75,90,110];return frames.find(x=>x>=kW)||Math.ceil(kW/10)*10}
function assess(c){return c.flowM3min>=result.designFlowM3min&&c.pressureKpa>=result.designPressureKpa&&(c.motorKw<=0||c.motorKw>=result.recommendedMotorKw)}
function persist(){localStorage.setItem(CONFIG_KEY,JSON.stringify(config));localStorage.setItem(CANDIDATE_KEY,JSON.stringify(candidates))}
function toast(msg){const el=$('toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2200)}

const numberIds=['assemblyCount','holesPerAssembly','holeDiameterMm','slotLengthMm','slotGapMm','slotsPerAssembly','rectWidthMm','rectHeightMm','rectOpeningsPerAssembly','roundDiameterMm','roundOpeningsPerAssembly','customAreaMm2','dischargeCoefficient','targetVelocityMps','targetPressureKpa','airTempC','ambientPressureKpa','systemLossKpa','flowMarginPct','pressureMarginPct','blowerEfficiencyPct','motorMarginPct'];
const textIds=['projectName','lineName','preparedBy'];

function populatePreset(){
  $('presetId').innerHTML=''; presets.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.label;$('presetId').append(o)});
}
function syncInputs(){
  numberIds.forEach(id=>{$(id).value=config[id]}); textIds.forEach(id=>{$(id).value=config[id]}); $('presetId').value=config.presetId; $('reportTheme').value=config.reportTheme;
  document.querySelectorAll('.nozzle-option').forEach(b=>b.classList.toggle('active',b.dataset.nozzle===config.nozzleType));
  document.querySelectorAll('.geometry').forEach(el=>el.hidden=el.dataset.geometry!==config.nozzleType);
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===config.targetMode));
  $('velocityField').hidden=config.targetMode!=='velocity'; $('pressureField').hidden=config.targetMode!=='pressure';
  const p=presets.find(x=>x.id===config.presetId)||presets[1]; $('presetRange').textContent=`${p.min}–${p.max} m/s 권장 시작 구간`; $('presetDescription').textContent=p.description; $('presetExamples').textContent=p.examples;
}
function renderResults(){
  result=calculate(); persist();
  $('dutyFlow').textContent=fmt(result.designFlowM3min,2); $('dutyPressure').textContent=fmt(result.designPressureKpa,2);
  $('metricVelocity').textContent=fmt(result.equivalentVelocityMps,1); $('metricVelocityNote').textContent=config.targetMode==='velocity'?'입력 기준값':'차압으로 역산';
  $('metricNozzleDp').textContent=fmt(result.nozzleDeltaPKpa,2); $('metricDynamicP').textContent=fmt(result.dynamicPressureKpa,2); $('metricMotor').textContent=fmt(motorFrame(result.recommendedMotorKw),2); $('metricMotorNote').textContent=`계산 요구 ${fmt(result.recommendedMotorKw,2)} kW`;
  const rows=[['Ass’y당 개구 면적',fmt(result.areaPerAssemblyMm2,1),'mm²'],['전체 개구 면적',fmt(result.totalAreaMm2,1),'mm²'],['계산 풍량',fmt(result.rawFlowM3min,3),'m³/min'],['풍량 여유 반영',fmt(result.designFlowM3min,3),'m³/min'],['공기 밀도',fmt(result.airDensityKgM3,3),'kg/m³'],['공기동력',fmt(result.airPowerKw,3),'kW'],['축동력 추정',fmt(result.shaftPowerKw,3),'kW'],['압력비',fmt(result.pressureRatio,3),'P₂/P₁']];
  $('dataList').innerHTML=rows.map(r=>`<div><dt>${r[0]}</dt><dd>${r[1]} <small>${r[2]}</small></dd></div>`).join('');
  $('warningBox').hidden=result.warnings.length===0; $('warningList').innerHTML=result.warnings.map(w=>`<p>${escapeHtml(w)}</p>`).join('');
  renderCandidates(); updateReport();
}
function renderCandidates(){
  const body=$('candidateBody');body.innerHTML='';
  candidates.forEach(c=>{
    const tr=document.createElement('tr');
    const name=document.createElement('input'); name.value=c.name; name.className='table-input'; name.addEventListener('input',e=>{c.name=e.target.value;persist();updateReport()});
    const tdName=document.createElement('td');tdName.append(name);tr.append(tdName);
    [['flowM3min','m³/min'],['pressureKpa','kPa'],['motorKw','kW']].forEach(([key,unit])=>{const td=document.createElement('td'), wrap=document.createElement('div');wrap.className='table-number';const input=document.createElement('input');input.type='number';input.step='.1';input.value=c[key];input.addEventListener('change',e=>{c[key]=Number(e.target.value);persist();renderCandidates();updateReport()});const span=document.createElement('span');span.textContent=unit;wrap.append(input,span);td.append(wrap);tr.append(td)});
    const tdStatus=document.createElement('td');const status=document.createElement('span');const ok=assess(c);status.className=`status-pill ${ok?'pass':'fail'}`;status.textContent=ok?'적합':'부족';tdStatus.append(status);tr.append(tdStatus);
    const tdDel=document.createElement('td');const del=document.createElement('button');del.className='delete-btn';del.textContent='×';del.title='삭제';del.addEventListener('click',()=>{candidates=candidates.filter(x=>x.id!==c.id);persist();renderCandidates();updateReport()});tdDel.append(del);tr.append(tdDel);body.append(tr);
  });
}
function updateReport(){
  if(!result)result=calculate(); const p=presets.find(x=>x.id===config.presetId)||presets[1], now=new Date();
  $('reportSheet').className=`report-sheet report-${config.reportTheme}`; $('rProject').textContent=config.projectName||'-';$('rLine').textContent=config.lineName||'-';$('rPrepared').textContent=config.preparedBy||'-';$('rDate').textContent=now.toLocaleDateString('ko-KR');
  $('rFlow').textContent=fmt(result.designFlowM3min,2);$('rPressure').textContent=fmt(result.designPressureKpa,2);$('rMotor').textContent=fmt(motorFrame(result.recommendedMotorKw),2);
  const inRows=[['노즐 타입',nozzleLabels[config.nozzleType]],['노즐 Ass’y 수',`${config.assemblyCount} EA`],['방출계수 Cd',config.dischargeCoefficient],['제거 강도',p.short],['계산 기준',config.targetMode==='velocity'?`풍속 ${config.targetVelocityMps} m/s`:`노즐 차압 ${config.targetPressureKpa} kPa`],['배관/필터 손실',`${config.systemLossKpa} kPa`],['풍량 / 압력 여유',`${config.flowMarginPct}% / ${config.pressureMarginPct}%`]];
  const outRows=[['Ass’y당 개구 면적',`${fmt(result.areaPerAssemblyMm2,1)} mm²`],['전체 개구 면적',`${fmt(result.totalAreaMm2,1)} mm²`],['공기 밀도',`${fmt(result.airDensityKgM3,3)} kg/m³`],['등가 출구 풍속',`${fmt(result.equivalentVelocityMps,2)} m/s`],['노즐 차압',`${fmt(result.nozzleDeltaPKpa,3)} kPa`],['동압',`${fmt(result.dynamicPressureKpa,3)} kPa`],['계산 풍량',`${fmt(result.rawFlowM3min,3)} m³/min`],['축동력 추정',`${fmt(result.shaftPowerKw,3)} kW`]];
  $('rInputs').innerHTML=inRows.map(r=>`<tr><th>${escapeHtml(String(r[0]))}</th><td>${escapeHtml(String(r[1]))}</td></tr>`).join('');$('rResults').innerHTML=outRows.map(r=>`<tr><th>${escapeHtml(String(r[0]))}</th><td>${escapeHtml(String(r[1]))}</td></tr>`).join('');
  $('rCandidates').innerHTML=candidates.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${fmt(c.flowM3min,2)} m³/min</td><td>${fmt(c.pressureKpa,2)} kPa</td><td>${fmt(c.motorKw,2)} kW</td><td>${assess(c)?'적합':'부족'}</td></tr>`).join('');
  $('rWarnings').innerHTML=result.warnings.map(w=>`<p class="report-warning">• ${escapeHtml(w)}</p>`).join(''); $('rGenerated').textContent=`Generated ${now.toLocaleString('ko-KR')}`;
}
function renderHistory(){
  const root=$('historyList');root.innerHTML=''; if(!history.length){root.innerHTML='<div class="empty-state"><b>저장된 계산이 없습니다.</b><span>“계산 저장”을 누르면 현재 조건을 기록합니다.</span></div>';return}
  history.forEach(item=>{const row=document.createElement('article');row.className='history-item';const info=document.createElement('div');const b=document.createElement('b');b.textContent=item.config.projectName||'이름 없는 계산';const s=document.createElement('span');s.textContent=new Date(item.savedAt).toLocaleString('ko-KR');info.append(b,s);const vals=document.createElement('div');vals.className='history-values';vals.innerHTML=`<span>${fmt(item.result.designFlowM3min,2)} m³/min</span><span>${fmt(item.result.designPressureKpa,2)} kPa</span>`;const btn=document.createElement('button');btn.className='btn secondary';btn.textContent='불러오기';btn.addEventListener('click',()=>{config={...defaultConfig,...item.config};syncInputs();renderResults();activateTab('calculator');toast('저장된 계산을 불러왔습니다.')});row.append(info,vals,btn);root.append(row)})
}
function activateTab(name){document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`tab-${name}`);document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));if(name==='report')updateReport();if(name==='history')renderHistory()}
function applyTheme(){const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem(THEME_KEY,theme)}
function cycleTheme(){theme=theme==='light'?'dark':theme==='dark'?'system':'light';applyTheme();toast(`테마: ${theme}`)}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function saveCurrent(){const item={id:crypto.randomUUID(),savedAt:new Date().toISOString(),config:{...config},result:{...result}};history=[item,...history].slice(0,20);localStorage.setItem(HISTORY_KEY,JSON.stringify(history));toast('현재 계산을 저장했습니다.')}
function encodeState(data){const bytes=new TextEncoder().encode(JSON.stringify(data));let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function decodeState(s){s=s.replaceAll('-','+').replaceAll('_','/');while(s.length%4)s+='=';const binary=atob(s),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}
async function shareState(){const url=new URL(location.href);url.hash=`s=${encodeState({config,candidates})}`;try{await navigator.clipboard.writeText(url.toString());toast('공유 링크를 복사했습니다.')}catch{prompt('아래 링크를 복사하세요.',url.toString())}}
function loadShared(){try{if(location.hash.startsWith('#s=')){const x=decodeState(location.hash.slice(3));config={...defaultConfig,...x.config};if(Array.isArray(x.candidates))candidates=x.candidates;toast('공유된 계산 조건을 불러왔습니다.')}}catch{toast('공유 링크를 해석하지 못했습니다.')}}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportJson(){downloadBlob(new Blob([JSON.stringify({config,result,candidates,generatedAt:new Date().toISOString()},null,2)],{type:'application/json'}),'airflow-calculation.json')}
async function exportPng(){
  updateReport();const el=$('reportSheet'),width=Math.ceil(el.scrollWidth),height=Math.ceil(el.scrollHeight);let css='';for(const sheet of document.styleSheets){try{css+=[...sheet.cssRules].map(r=>r.cssText).join('\n')}catch{}}
  const clone=el.cloneNode(true);const xml=`<div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${clone.outerHTML}</div>`;const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();
  try{await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});const scale=2,canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.drawImage(img,0,0);const out=await new Promise(res=>canvas.toBlob(res,'image/png',1));if(out)downloadBlob(out,'airflow-blower-report.png');toast('PNG를 저장했습니다.')}catch{toast('PNG 생성에 실패했습니다. 브라우저 인쇄/PDF를 이용해 주세요.')}finally{URL.revokeObjectURL(url)}
}
function addCandidate(){candidates.push({id:crypto.randomUUID(),name:`후보 ${String.fromCharCode(65+candidates.length)}`,flowM3min:Math.ceil(result.designFlowM3min*1.1*10)/10,pressureKpa:Math.ceil(result.designPressureKpa*1.1*10)/10,motorKw:motorFrame(result.recommendedMotorKw)});persist();renderCandidates();updateReport()}

function bind(){
  numberIds.forEach(id=>$(id).addEventListener('input',e=>{config[id]=Number(e.target.value);renderResults()}));
  textIds.forEach(id=>$(id).addEventListener('input',e=>{config[id]=e.target.value;persist();updateReport()}));
  document.querySelectorAll('.nozzle-option').forEach(b=>b.addEventListener('click',()=>{config.nozzleType=b.dataset.nozzle;syncInputs();renderResults()}));
  document.querySelectorAll('.mode-btn').forEach(b=>b.addEventListener('click',()=>{config.targetMode=b.dataset.mode;syncInputs();renderResults()}));
  document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));
  $('presetId').addEventListener('change',e=>{config.presetId=e.target.value;const p=presets.find(x=>x.id===config.presetId);if(p){config.targetMode='velocity';config.targetVelocityMps=p.def}syncInputs();renderResults()});
  $('reportTheme').addEventListener('change',e=>{config.reportTheme=e.target.value;persist();updateReport()});
  $('themeBtn').addEventListener('click',cycleTheme);$('shareBtn').addEventListener('click',shareState);$('saveBtn').addEventListener('click',saveCurrent);$('addCandidateBtn').addEventListener('click',addCandidate);$('jsonBtn').addEventListener('click',exportJson);$('pngBtn').addEventListener('click',exportPng);$('pdfBtn').addEventListener('click',()=>{activateTab('report');setTimeout(()=>window.print(),50)});
  $('clearHistoryBtn').addEventListener('click',()=>{history=[];localStorage.setItem(HISTORY_KEY,'[]');renderHistory();toast('이력을 삭제했습니다.')});$('resetBtn').addEventListener('click',()=>{config={...defaultConfig};candidates=structuredClone(defaultCandidates);syncInputs();renderResults();toast('기본값으로 초기화했습니다.')});
}

populatePreset();loadShared();applyTheme();syncInputs();bind();renderResults();
