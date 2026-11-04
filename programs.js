// Versioned, bounded prescriptions. Source locators: docs/BOOK_REVIEW.md.
import * as C from './core.js';
export const BASE_ID = 'tb2-standard-2015-v1';
export const BASE_WEEKS = [
  [['se',3,20],['e',30,30],['e',30,30],['se',2,20],['recovery'],['e',35,120],['rest']],
  [['se',3,30],['e',40,40],['e',40,40],['se',2,30],['recovery'],['e',45,120],['rest']],
  [['se',3,40],['e',50,50],['e',50,50],['se',2,40],['recovery'],['e',55,120],['rest']],
  [['se',1,50],['e',60,60],['e',60,60],['se',1,50],['recovery'],['e',60,120],['rest']],
  [['se',3,50],['e',45,60],['e',45,60],['se',2,50],['recovery'],['e',45,120],['rest']],
  ...Array.from({length:3},()=>[['strength'],['hic'],['recovery'],['strength'],['hic'],['e',30,60],['rest']])
];
export const HICS = {
  resets: { name:'600 m resets · basic', instructions:'Warm up with 5–10 minutes of easy jogging. Complete four 600 m efforts. Rest 3–5 minutes between efforts so the next starts well rested. Log each effort’s time and distance. These are hard efforts, not continuous easy running.', rest:180, count:4, distance:600, seconds:null, source:'TBII Part II, HIC #3, Basic version' },
  tempo: { name:'Fast 5 tempo run · basic', instructions:'Complete 2.5 km at a faster, sustained effort than your easy endurance sessions. The book’s basic version halves the standard 5 km distance. Log actual time and distance. Warm up before starting.', rest:0, count:1, distance:2.5, seconds:null, source:'TBII Part II, HIC #2, Basic version (half of 5 km)' }
};
export function estimateMax(load, reps) {
  if (!(load > 0 && load <= 5000 && Number.isInteger(reps) && reps >= 3 && reps <= 5)) throw new Error('Use a genuine 3–5 rep test with a positive load.');
  return 36 * load / (37 - reps); // App choice, consistent with the book's example; not a mandated TB formula.
}
export function roundedLoad(maximum, percent, trainingMax, increment) {
  if (!(maximum > 0 && maximum <= 5000 && percent > 0 && percent <= 1 && [1,.9].includes(trainingMax) && increment > 0 && increment <= 100)) throw new Error('Invalid maximum, percentage or plate increment.');
  const raw = maximum * trainingMax * percent;
  return { raw, load: Math.round(Math.floor((raw + 1e-9) / increment) * increment * 1000) / 1000 };
}
export function buildBase(s, config) {
  const circuit = s.templates.find(t=>t.id===config.circuitId && !t.guide);
  if (!circuit || circuit.blockRoutine || circuit.exercises.length < 5 || circuit.exercises.length > 8 || circuit.exercises.some(e=>!['reps','strength'].includes(e.metric))) throw new Error('Choose a saved SE circuit with 5–8 rep-based exercises.');
  if (!['Running','Cycling','Rowing','Swimming'].includes(config.endurance)) throw new Error('Choose an endurance mode.');
  if (!['km','mi','m'].includes(config.distanceUnit) || !HICS[config.hic]) throw new Error('Choose distance units and a supported HIC session.');
  if (!Array.isArray(config.lifts) || config.lifts.length < 2 || config.lifts.length > 3) throw new Error('Configure 2–3 main lifts for Fighter.');
  if (new Set(config.lifts.map(l=>l.name.trim().toLowerCase())).size!==config.lifts.length) throw new Error('Use distinct lift names.');
  const calis = config.calisthenicsId ? s.templates.find(t=>t.id===config.calisthenicsId && t.category==='Calisthenics' && !t.guide && !t.blockRoutine) : null;
  if (config.calisthenicsId && !calis) throw new Error('Choose a saved calisthenics routine.');
  const lifts = config.lifts.map(l=>{
    if (!l.name.trim() || l.name.length>160) throw new Error('Name each lift / variation.');
    const maximum=l.method==='estimate' ? estimateMax(l.load,l.reps) : l.maximum;
    if (!['estimate','direct'].includes(l.method) || !(maximum>0 && maximum<=5000)) throw new Error('Enter a positive reference maximum for every lift.');
    roundedLoad(maximum,.75,config.trainingMax,config.increment);
    return {...l,maximum};
  });
  return BASE_WEEKS.flatMap((week,wi)=>week.map((slot,di)=>{
    const [type,a,b]=slot, t=C.template(); t.category=['se','e','hic'].includes(type)?'Conditioning':'Strength';
    t.guide={week:wi+1,day:di+1,type,minMinutes:type==='e'?a:0,maxMinutes:type==='e'?b:0,source:'TBII Part I · Standard Base Building · p38 table'};
    t.name=`Week ${wi+1} · ${ {se:'Strength-endurance',e:config.endurance,hic:HICS[config.hic].name,strength:'Fighter strength',recovery:'Recovery',rest:'Rest'}[type]}`;
    t.layout=type==='se'?'circuit':'sets';
    if (type==='se') {
      t.notes=`${a} rounds × ${b} reps per exercise. Work down the circuit once per round. Rest-pause within an exercise if needed, adding to its completed reps. Rest 30–120 seconds between exercises and 2 minutes between rounds. For unilateral exercises the target is total reps across both sides; split it evenly. Use light resistance. This is SE, separate from personal ladders.`;
      t.exercises=circuit.exercises.map(e=>({...C.copy(e),id:C.uid(),role:'main',format:'sets',rest:60,sets:Array.from({length:a},()=>({...C.target(e.metric),reps:b,weight:e.metric==='strength'?e.sets[0].weight:null}))}));
    }
    if (type==='e') {
      const e=C.exercise(`${config.endurance} · LSS`,'cardio');e.rest=0;e.distanceUnit=config.distanceUnit;e.sets=[{...C.target('cardio'),seconds:a*60}];
      e.instructions=`Maintain an easy conversational effort for ${a===b?a:`${a}–${b}`} minutes. Target starts at the lower bound; distance is optional. Work for time. Running may alternate with walking; avoid turning this into intervals. Source: TBII Part II E #1 and Standard Base Building table.`;
      t.exercises=[e];t.notes=e.instructions;
    }
    if (type==='hic') {
      const h=HICS[config.hic],e=C.exercise(h.name,'cardio');e.rest=h.rest;e.timeUnit='seconds';e.distanceUnit=config.hic==='resets'?'m':'km';e.instructions=h.instructions;
      e.sets=Array.from({length:h.count},()=>({...C.target('cardio'),seconds:h.seconds,distance:h.distance}));t.exercises=[e];t.notes=`${h.source}. Eligible HIC #1–10 only during this block. ${h.instructions}`;
    }
    if (type==='strength') {
      const percent=[.75,.8,.9][wi-5], reps=[5,5,3][wi-5];
      t.notes='Fighter: two strength sessions in this source week. Keep at least two intervening days between them. Three work sets per lift; rest at least two minutes. Stop before failure. These are weeks 1–3 of Fighter within Base Building, not a completed six-week Fighter block. Source: TB third edition, chapter 14.';
      t.exercises=lifts.map(l=>{const e=C.exercise(l.name);const v=roundedLoad(l.maximum,percent,config.trainingMax,config.increment);e.sets=Array.from({length:3},()=>({...C.target('strength'),reps,weight:v.load}));
        e.reference={maximum:l.maximum,factor:config.trainingMax,percent,raw:v.raw,increment:config.increment,method:l.method,load:l.method==='estimate'?l.load:null,reps:l.method==='estimate'?l.reps:null};return e;});
      if(calis)t.calisthenicsId=calis.id;
    }
    if (['rest','recovery'].includes(type)) {
      t.notes=type==='rest'?'No structured training today. Acknowledge after taking the rest day. Another hard workout does not count as rest.':'Keep activity easy, or take another rest day. Optional gentle movement is not a required exercise prescription.';
      const e=C.exercise(type==='rest'?'Rest day':'Recovery day','hold');e.sets=[{...C.target('hold'),seconds:0}];t.exercises=[e];
    }
    return t;
  }));
}
export function enrollBase(s,config,now=Date.now()) {
  const generated=buildBase(s,config); // Validate every phase before changing the plan.
  if(s.workouts.some(w=>w.status==='active' && w.planRef?.version===s.plan.version)) throw new Error('Finish the unfinished planned workout before starting a new block.');
  s.templates=s.templates.filter(t=>!t.guide&&!t.blockRoutine);
  if(config.calisthenicsId) { const snapshot=C.copy(s.templates.find(t=>t.id===config.calisthenicsId));snapshot.id=C.uid();snapshot.blockRoutine=true;snapshot.calisthenicsId=null;s.templates.push(snapshot);for(const t of generated)if(t.calisthenicsId)t.calisthenicsId=snapshot.id; }
  s.templates.push(...generated);
  C.replaceSequence(s,generated.map(t=>t.id));
  s.plan.program={id:BASE_ID,startedAt:C.iso(now),completed:false};
  return generated;
}
export function restartWeek(s,week) {
  if(!s.plan.program || !Number.isInteger(week) || week<1 || week>8) throw new Error('Choose a program week from 1 to 8.');
  if(s.workouts.some(w=>w.status==='active' && w.planRef?.version===s.plan.version)) throw new Error('Finish the unfinished planned workout before changing weeks.');
  s.plan.version=C.uid();s.plan.cursor=(week-1)*7;s.plan.cycle=1;s.plan.program.completed=false;
}
