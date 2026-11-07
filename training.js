import * as C from './core.js';
import * as P from './programs.js';
import {movement,findMovement,CONDITIONING} from './catalog.js';
export const KG=2.2046226218487757;
export const toLb=(v,unit)=>unit==='kg'?v*KG:v;
export const fromLb=(v,unit)=>unit==='kg'?v/KG:v;
export const displayNumber=v=>Math.round(v*100)/100;
export const DEFAULT={barbell:'Operator',conditioning:'Black',baseFirst:true,cluster:['squat','bench'],circuit:['pushups','air-squat','ring-row','lunge','bicycle'],calis:['pushups','pullups'],calisFormat:'ladder',calisReps:[1,2,3],calisHold:30,calisRest:30,endurance:'cycling',hic:'resets',variant:'basic',displayUnit:'lb',inputUnit:'lb',increment:5,incrementUnit:'lb',factor:.9,retestWeeks:12,liftRest:120};
export function profile(s){return {...C.copy(DEFAULT),...(s.profile||{})};}
export function validateProfile(p) {
 if(!['Operator','Fighter','Zulu'].includes(p.barbell)||!['Black','Green'].includes(p.conditioning)||typeof p.baseFirst!=='boolean'||p.conditioning==='Green'&&p.barbell!=='Fighter')throw new Error('Green uses the two-day Fighter structure. Choose Fighter, or use Black with Operator/Zulu.');
 for(const [key,min,max]of[['cluster',2,6],['circuit',5,8],['calis',0,12]])if(!Array.isArray(p[key])||p[key].length<min||p[key].length>max||new Set(p[key]).size!==p[key].length||p[key].some(id=>!findMovement(id)))throw new Error(`Check your ${key} exercise selection.`);
 if(p.barbell==='Operator'&&p.cluster.length>3||p.barbell==='Zulu'&&p.cluster.length!==4)throw new Error('Operator uses up to three main exercises; this Zulu preset uses four.');
 if(p.cluster.some(id=>!['strength','reps'].includes(findMovement(id).metric))||p.circuit.some(id=>!['reps','strength'].includes(findMovement(id).metric)))throw new Error('Choose rep-based movements for the barbell cluster/circuit.');
 if(!['lb','kg','both'].includes(p.displayUnit)||!['lb','kg'].includes(p.inputUnit)||!['lb','kg'].includes(p.incrementUnit)||!(p.increment>0&&p.increment<=100)||![1,.9].includes(p.factor)||![6,12].includes(p.retestWeeks))throw new Error('Check units, plate increment or maximum settings.');
 if(!['sets','ladder','pyramid','near-failure'].includes(p.calisFormat)||!Array.isArray(p.calisReps)||!p.calisReps.length||p.calisReps.length>30||p.calisReps.some(r=>r!==null&&(!Number.isInteger(r)||r<0||r>10000))||!Number.isInteger(p.calisRest)||p.calisRest<0||p.calisRest>3600||!(p.calisHold>0&&p.calisHold<=3600))throw new Error('Check calisthenics targets/rest.');
 if(p.liftRest!==undefined&&(!Number.isInteger(p.liftRest)||p.liftRest<0||p.liftRest>3600))throw new Error('Enter a rest time from 0 to 3600 seconds.');
 if(!CONDITIONING.some(c=>c.id===p.endurance&&c.type==='e')||!CONDITIONING.some(c=>c.id===p.hic&&c.type==='hic'&&c.variants[p.variant]))throw new Error('Choose a supported conditioning workout and version.');
 return p;
}
export function latestMax(s,name){return (s.maxTests||[]).filter(t=>t.name.toLowerCase()===name.toLowerCase()).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))[0];}
function applyLoading(s,e,p,percent) {
 const r=latestMax(s,e.name);e.loading={templateReps:e.loading?.templateReps??e.sets[0].reps,percent,factor:e.metric==='strength'?p.factor:1,increment:p.increment,unit:p.incrementUnit};
 if(!r||r.metric!==e.metric){delete e.reference;e.needsMax=true;e.sets.forEach(v=>{if(e.metric==='strength')v.weight=0;else v.reps=null;});return e;}
 e.needsMax=false;
 if(e.metric==='reps') {e.sets.forEach(v=>v.reps=Math.max(1,Math.floor(r.maximum*percent)));return e;}
 // Weighted bodyweight maximums include bodyweight; the target is what to add, and never below zero (TB1 ch. 16).
 const bw=r.bodyweight||0,raw=Math.max(0,r.maximum*p.factor*percent-bw),inc=toLb(p.increment,p.incrementUnit),load=Math.floor((raw+1e-8)/inc)*inc;
 e.sets.forEach(v=>v.weight=load);e.reference={maximum:r.maximum,factor:p.factor,percent,raw,increment:inc,method:r.kind==='estimate'?'estimate':'direct',load:r.kind==='estimate'?r.load:null,reps:r.kind==='estimate'?r.reps:null,...(bw?{bodyweight:bw}:{})};return e;
}
// Owner-approved personal rule, not from the TB books: [percent of max, sets]. Weeks 3 and 6 ease off with the heavy lifting weeks.
export const CALIS_WAVE=[[.5,3],[.6,3],[.4,2],[.55,3],[.65,3],[.4,2]];
export function calisTargets(maximum,week,format='sets') {
 if(format==='near-failure')return null;
 const [percent,sets]=CALIS_WAVE[(week-1)%CALIS_WAVE.length],each=Math.max(1,Math.floor(maximum*percent+1e-8));
 if(format==='sets')return Array(sets).fill(each);
 let total=each*sets;const out=[];
 if(format==='ladder')for(let rung=1;total>0&&out.length<30;rung=rung>=each?1:rung+1){const r=Math.min(rung,total);out.push(r);total-=r;}
 else{const peak=Math.min(each,Math.max(1,Math.floor(Math.sqrt(total))));for(;total>=peak*peak&&out.length+peak*2<=30;total-=peak*peak)for(let r=1;r<peak*2;r++)out.push(r<=peak?r:peak*2-r);}
 return out;
}
function applyCalis(s,e,week) {
 const r=latestMax(s,e.name),targets=r&&r.metric===e.metric?calisTargets(r.maximum,week,e.metric==='hold'?'sets':e.format):null;
 if(!targets)return e;
 e.sets=targets.map(v=>({...C.target(e.metric),reps:e.metric==='hold'?null:v,seconds:e.metric==='hold'?v:null}));
 e.autoTarget={maximum:r.maximum,percent:CALIS_WAVE[(week-1)%CALIS_WAVE.length][0]};return e;
}
// The wave follows strength weeks, so Base Building's first Fighter week (program week 6) is wave week 1.
export function waveWeek(t){return t.guide.source==='TBII Standard Base Building'?t.guide.week-5:t.guide.week;}
export function calisthenics(p,s=null,week=1){return p.calis.map(id=>{const e=movement(id);e.role='accessory';e.section='calisthenics';e.format=p.calisFormat;e.rest=p.calisRest;e.sets=p.calisReps.map(reps=>({...C.target(e.metric),reps:e.metric==='hold'?null:reps,seconds:e.metric==='hold'?p.calisHold:null}));return s?applyCalis(s,e,week):e;});}
export function condition(id,variant='basic',minutes=30,easy=false) {
 const c=CONDITIONING.find(c=>c.id===id);if(!c)throw new Error('Choose a conditioning session.');
 if(c.type==='e'){const e=C.exercise(`${c.mode} · easy endurance`,'cardio');e.catalogId=id;e.rest=0;e.instructions='Maintain an easy conversational effort. Work for the prescribed time; distance is optional. For running, run-walk is allowed. Avoid turning this into intervals. Source: TBII Endurance #1.';e.sets=[{...C.target('cardio'),seconds:minutes*60}];return [e];}
 const v=c.variants[variant];if(!v)throw new Error('That workout version is unavailable.');
 const e=C.exercise(c.name,'cardio');e.catalogId=id;e.timeUnit='seconds';e.distanceUnit='m';e.rest=v.rest;e.instructions=c.instructions+` Source: ${c.book}, ${variant} version.${easy?(v.count>1?' Easy-week adaptation: fewer efforts.':' Easy-week adaptation: keep this single effort at easier intensity.'):''}`;
 e.sets=Array.from({length:easy?Math.max(1,Math.floor(v.count/2)):v.count},()=>({...C.target('cardio'),seconds:v.seconds||null,distance:v.distance||null}));return [e];
}
function circuit(p,rounds,reps){return p.circuit.map(id=>{const e=movement(id);e.rest=60;e.sets=Array.from({length:rounds},()=>({...C.target(e.metric),reps,weight:e.metric==='strength'?0:null}));return e;});}
function strength(s,p,week,day,kind='normal') {
 let percent,reps;
 if(p.barbell==='Operator') {percent=[.7,.8,.9,.75,.85,.95][(week-1)%6];reps=[5,5,3,5,3,1][(week-1)%6];}
 else if(p.barbell==='Fighter'){percent=[.75,.8,.9][(week-1)%3];reps=[5,5,3][(week-1)%3];}
 else {percent=(week-1)%3===2?.9:(day<3?[(.7),(.8)][(week-1)%3]:[.75,.85][(week-1)%3]);reps=(week-1)%3===2?3:5;}
 const ids=p.barbell==='Zulu'?p.cluster.filter((_,i)=>kind==='A'?i<2:i>=2):p.cluster;
 return ids.map(id=>{const e=movement(id);e.rest=p.liftRest??120;e.section='strength';e.sets=Array.from({length:id==='deadlift'?1:3},()=>({...C.target(e.metric),reps}));return applyLoading(s,e,p,percent);});
}
function slot(s,p,week,day,type,a,b,{base=false,green=false,zuluKind}={}) {
 const t=C.template();t.generated=true;t.guide={week,day,type,minMinutes:type==='e'?a||30:0,maxMinutes:type==='e'?b||a||30:0,source:base?'TBII Standard Base Building':green?'TBII Green standard':'TB1 third edition + TBII Black'};t.layout=type==='se'?'circuit':'sets';t.category=['se','e','hic'].includes(type)?'Conditioning':'Strength';
 if(type==='se'){t.name='Strength-endurance circuit';t.notes=`${a} rounds × ${b} reps per exercise, in circuit order. Rest-pause to accumulate reps if needed. Reps are totals across both sides for unilateral work. Light resistance, 30–120 seconds between exercises and 2 minutes between rounds. Your personal exercise selection follows the book’s circuit framework.`;t.exercises=circuit(p,a,b);}
 if(type==='e'){t.exercises=condition(p.endurance,'basic',a||30);t.name=t.exercises[0].name;t.notes=`Easy endurance · ${a===b||!b?a||30:`${a}–${b}`} minutes. ${t.exercises[0].instructions}`;}
 if(type==='hic'){const c=CONDITIONING.find(c=>c.id===p.hic);if(base&&!c.base)throw new Error('Base Building requires HIC #1–10.');t.exercises=condition(p.hic,p.variant,30,!base&&!green&&week%3===0);t.name=c.name+(week%3===0&&!base&&!green?' · easy week':'');t.notes=t.exercises[0].instructions;}
 if(type==='strength'){if(p.barbell==='Zulu'&&!base)t.split=zuluKind;const q=base?{...p,barbell:'Fighter',cluster:p.cluster.slice(0,3)}:p;t.exercises=strength(s,q,base?week-5:week,day,zuluKind);t.exercises.push(...calisthenics(p,s,base?week-5:week));t.name=(base?'Fighter':p.barbell)+(zuluKind?` ${zuluKind}`:'')+(p.calis.length?' + calisthenics':'');t.notes=`${base?'Fighter during Base Building':p.barbell+' strength'}. Three work sets per main lift; deadlifts use the book’s one-work-set-per-session option. Rest at least two minutes between sets. Avoid muscular failure during ordinary strength work. Your personal calisthenics follows the main work.`;}
 if(['rest','recovery'].includes(type)){t.name=type==='rest'?'Rest':'Recovery';t.notes=type==='rest'?'Take a day without structured training. Acknowledge after resting.':'Keep activity easy, or take another rest day. Record any gentle movement in the notes.';const e=C.exercise(t.name,'hold');e.sets=[{...C.target('hold'),seconds:0}];t.exercises=[e];}
 t.needsMax=t.exercises.some(e=>e.needsMax);return t;
}
export function buildPlan(s,p,base=p.baseFirst) {
 validateProfile(p);
 if(base)return P.BASE_WEEKS.flatMap((w,wi)=>w.map(([type,a,b],di)=>slot(s,p,wi+1,di+1,type,a,b,{base:true})));
 if(p.conditioning==='Green')return Array.from({length:9},(_,wi)=>Array.from({length:7},(_,di)=>{const w=wi+1,d=di+1;
  if(d===7)return slot(s,p,w,d,'rest',0,0,{green:true});
  if(w<=6&&[1,4].includes(d))return slot(s,p,w,d,'strength',0,0,{green:true});
  if(w>=7&&[1,3,5].includes(d)){const rounds=d===5?2:3,reps=(w-7)*10+30+(d===3?5:d===5?10:0);return slot(s,p,w,d,'se',rounds,reps,{green:true});}
  if(w>=5&&d===6)return slot(s,p,w,d,'hic',0,0,{green:true});
  if(w<=6&&d===3)return slot(s,p,w,d,'recovery',0,0,{green:true});
  return slot(s,p,w,d,'e',30,60,{green:true});})).flat();
 const weeks=p.retestWeeks;
 return Array.from({length:weeks},(_,wi)=>Array.from({length:7},(_,di)=>{const w=wi+1,d=di+1;
  const days=p.barbell==='Operator'?[1,3,5]:p.barbell==='Fighter'?[1,4]:[1,2,4,5];
  let type=days.includes(d)?'strength':d===7?'rest':p.barbell==='Fighter'&&d===6?'recovery':d===6&&p.barbell!=='Zulu'||p.barbell==='Fighter'&&d===3?'e':'hic';
  const t=slot(s,p,w,d,type,45,60,{zuluKind:p.barbell==='Zulu'?(d===1||d===4?'A':'B'):undefined});
  // Four short Zulu strength sessions allow one endurance session after day-5 lifting.
  if(p.barbell==='Zulu'&&d===5){t.exercises.push(...condition(p.endurance,'basic',30).map(e=>({...e,section:'conditioning'})));t.notes+=' Then complete 30 minutes of easy endurance. Source: TBII permits same-session conditioning after lifting.';}
  return t;})).flat();
}
export function enroll(s,p,now=Date.now()) {
 const ts=buildPlan(s,p); // All validation happens before replacing future work.
 for(const w of s.workouts.filter(w=>w.status==='active'&&w.planRef?.version===s.plan.version)){C.pause(w.timer,now);w.kind='standalone';w.planRef=null;w.notes+=(w.notes?'\n':'')+'Preserved unfinished work from the previous plan.';}
 s.templates=s.templates.filter(t=>!t.generated&&!t.guide&&!t.blockRoutine);s.templates.push(...ts);s.profile=C.copy(p);
 C.replaceSequence(s,ts.map(t=>t.id));s.plan.program={id:p.baseFirst?'tb2-standard-2015-v1':'tb-continuation-v1',startedAt:C.iso(now),completed:false};s.plan.configuration=C.copy(p);s.activeId=null;return ts;
}
export function saveMax(s,{catalogId,name,kind,value,reps,unit,date,bodyweight},now=Date.now()) {
 const m=catalogId?findMovement(catalogId):null;name=(m?.name||name||'').trim();const metric=m?.metric||'strength';
 if(!name||!['manual','estimate','rep-test'].includes(kind)||!['lb','kg'].includes(unit)||!(value>0)||!Number.isFinite(value)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||date>C.iso(now).slice(0,10))throw new Error('Enter a valid dated maximum or test result.');
 if(metric!=='strength'&&(!Number.isInteger(value)||value>10000)||metric==='strength'&&toLb(value,unit)>5000)throw new Error('Maximum is outside the supported range.');
 if(metric!=='strength'&&kind==='estimate')throw new Error('Bodyweight maximums use clean repetitions or seconds, not a load-based 1RM.');
 const bw=bodyweight===undefined||bodyweight===null?null:toLb(bodyweight,unit);if(bw!==null&&(metric!=='strength'||!(bw>0&&bw<=2000)))throw new Error('Enter a valid body weight.');
 const load=metric==='strength'?toLb(value,unit)+(kind==='estimate'&&bw?bw:0):null,maximum=kind==='estimate'?P.estimateMax(load,reps):metric==='strength'?load:value;
 const r={id:C.uid(),catalogId:catalogId||null,name,metric,kind,maximum,load:kind==='estimate'?load:null,reps:kind==='estimate'?reps:metric==='reps'?value:null,inputValue:value,inputUnit:metric==='reps'?'reps':metric==='hold'?'seconds':unit,date,createdAt:C.iso(now),method:kind==='estimate'?'brzycki-v1':metric==='reps'?'clean-reps':metric==='hold'?'clean-hold':'manual-reference',...(bw?{bodyweight:bw}:{})};
 s.maxTests.push(r);recalculate(s,name);return r;
}
function future(s){const locked=new Set(s.workouts.filter(w=>w.planRef?.version===s.plan.version&&(w.status==='active'||w.completion==='full')).map(w=>w.templateId));return s.plan.sequence.slice(s.plan.cursor).map(id=>s.templates.find(t=>t.id===id)).filter(t=>t&&!locked.has(t.id));}
export function recalculate(s,name){const p=s.plan.configuration||profile(s);for(const t of future(s)){for(const e of t.exercises){if(e.loading&&(!name||e.name===name))applyLoading(s,e,{...p,factor:e.loading.factor,increment:e.loading.increment,incrementUnit:e.loading.unit},e.loading.percent);if(e.section==='calisthenics'&&t.guide?.type==='strength'&&(!name||e.name===name))applyCalis(s,e,waveWeek(t));}t.needsMax=t.exercises.some(e=>e.needsMax);}}
export function editTargets(s,templateId,rows,{scope='day',programReps=true,saveRoutine=false}={}) {
 const selected=s.templates.find(t=>t.id===templateId);if(!selected||!Array.isArray(rows)||!rows.length)throw new Error('Choose at least one exercise.');
 const targets=future(s).filter(t=>scope==='day'?t.id===templateId:t.guide?.type===selected.guide?.type&&(!selected.split||t.split===selected.split));
 if(!targets.some(t=>t.id===selected.id))throw new Error('This day is already recorded or in progress. Its snapshot is preserved; edit a later day.');
 const p=s.plan.configuration||profile(s);
 if(rows.some(r=>!findMovement(r.id)||!['reps','strength'].includes(findMovement(r.id).metric)))throw new Error('Use rep-based movements here. Timed holds can be saved in calisthenics or added separately.');
 let saved=null;if(saveRoutine){saved=profile(s);if(selected.guide.type==='se')saved.circuit=rows.map(r=>r.id);else if(selected.split){if(rows.length!==2)throw new Error('A saved Zulu split needs two exercises in this preset.');saved.cluster=selected.split==='A'?[...rows.map(r=>r.id),...saved.cluster.slice(2)]:[...saved.cluster.slice(0,2),...rows.map(r=>r.id)];}else saved.cluster=rows.map(r=>r.id);validateProfile(saved);}
 for(const t of targets){const originals=t.exercises.filter(e=>e.section!=='calisthenics'&&e.section!=='conditioning');const extras=t.exercises.filter(e=>e.section==='calisthenics'||e.section==='conditioning');
  t.exercises=rows.map((r,i)=>{const old=originals[i]||originals[0],e=movement(r.id);const sourceSets=old.sets, reps=programReps?(old.loading?.templateReps??sourceSets[0].reps):r.reps,count=programReps?sourceSets.length:r.sets;
   if(!Number.isInteger(count)||count<1||count>30||reps!==null&&(!Number.isInteger(reps)||reps<0||reps>10000))throw new Error('Check set and repetition targets.');
   e.sets=Array.from({length:count},()=>({...C.target(e.metric),reps:e.metric==='hold'?null:reps,seconds:e.metric==='hold'?r.seconds||30:null}));e.rest=old.rest;
   if(t.guide?.type==='strength'){e.section='strength';applyLoading(s,e,p,old.loading?.percent||old.reference?.percent||.75);}else if(e.metric==='strength')e.sets.forEach(v=>v.weight=toLb(r.weight||0,p.inputUnit));return e;});
  t.exercises.push(...extras);t.needsMax=t.exercises.some(e=>e.needsMax);t.custom=true;t.version++;
 }
 if(saved){s.profile=saved;if(s.plan.configuration)Object.assign(s.plan.configuration,{cluster:saved.cluster,circuit:saved.circuit});}
 s.plan.editRevision=(s.plan.editRevision||0)+1;return targets.length;
}
export function swapCondition(s,templateId,id,variant,scope='day') {
 const original=s.templates.find(t=>t.id===templateId),choice=CONDITIONING.find(c=>c.id===id);if(!original||!choice||!['e','hic'].includes(original.guide?.type)||choice.type!==original.guide.type)throw new Error('Choose a compatible session category.');
 if(s.plan.program?.id==='tb2-standard-2015-v1'&&choice.type==='hic'&&!choice.base)throw new Error('Base Building permits HIC #1–10 only.');
 const ts=future(s).filter(t=>scope==='day'?t.id===templateId:t.guide?.type===choice.type);if(!ts.some(t=>t.id===templateId))throw new Error('Choose a future day, not an unfinished or completed session.');
 for(const t of ts){t.exercises=condition(id,variant,t.guide.minMinutes||30,s.plan.program?.id==='tb-continuation-v1'&&s.plan.configuration?.conditioning==='Black'&&t.guide.week%3===0);t.name=choice.name;t.notes=t.exercises[0].instructions;t.custom=true;t.version++;}s.plan.editRevision=(s.plan.editRevision||0)+1;return ts.length;
}
export function updateCalis(s,p){validateProfile(p);s.profile={...profile(s),calis:p.calis,calisFormat:p.calisFormat,calisReps:p.calisReps,calisHold:p.calisHold,calisRest:p.calisRest};if(s.plan.configuration)Object.assign(s.plan.configuration,{calis:p.calis,calisFormat:p.calisFormat,calisReps:p.calisReps,calisHold:p.calisHold,calisRest:p.calisRest});let n=0;for(const t of future(s).filter(t=>t.guide?.type==='strength')){t.exercises=t.exercises.filter(e=>e.section!=='calisthenics');t.exercises.push(...calisthenics(p,s,waveWeek(t)));t.name=t.name.replace(/ \+ calisthenics$/,'')+(p.calis.length?' + calisthenics':'');t.version++;n++;}return n;}
export function retestMessage(s){const p=s.plan.program;if(!p)return '';if(p.id==='tb2-standard-2015-v1')return p.completed?'Base Building complete. Review your maximums before starting continuation.':'';const weeks=s.plan.configuration?.conditioning==='Green'?9:s.plan.configuration?.retestWeeks||12;if(!p.completed&&Math.floor(s.plan.cursor/7)<weeks)return '';return `Review maximums after this ${weeks}-program-week strength phase. You can test, repeat with the same numbers or postpone. New results change future targets only.`;}
export function graphPoints(s,key){return C.observations(s,key).map(o=>({...o,x:Date.parse(o.date),value:C.primaryValue(o)}));}

export function repeatWeek(s,week){
 const max=Math.ceil(s.plan.sequence.length/7);if(!s.plan.program||!Number.isInteger(week)||week<1||week>max)throw new Error('Choose an existing program week.');
 if(s.workouts.some(w=>w.status==='active'&&w.planRef?.version===s.plan.version))throw new Error('Finish the in-progress planned workout before repeating a week. Its recorded work is preserved.');
 s.plan.version=C.uid();s.plan.cursor=(week-1)*7;s.plan.program.completed=false;s.plan.cycle=1;
}
