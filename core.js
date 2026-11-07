import {MOVEMENTS} from './movement-data.js';
// Pure data rules. Official training prescriptions deliberately live outside this module.
export const SCHEMA = 3;
export const uid = () => crypto.randomUUID();
export const copy = value => structuredClone(value);
export const iso = now => new Date(now ?? Date.now()).toISOString();
export const METRICS = ['strength', 'reps', 'hold', 'cardio'];
export const FORMATS = ['sets', 'ladder', 'pyramid', 'near-failure'];
export function blankState() {
  return { schemaVersion: SCHEMA, revision: 0, createdAt: iso(), updatedAt: iso(),
    settings: { location: 'Home', weightUnit: 'lb', lastExportAt: null, lastExportRevision: null, gapDays: null },
    templates: [], plan: { version: uid(), sequence: [], cursor: 0, cycle: 1 },
    workouts: [], activeId: null, profile: null, maxTests: [], favorites: [] };
}
export function exercise(name = '', metric = 'strength') {
  return { id: uid(), name, metric, format: 'sets', role: 'main', locations: ['Home', 'Gym'],
    equipment: '', instructions: '', rest: metric === 'strength' ? 120 : 30,
    distanceUnit: 'km', sets: [target(metric)] };
}
export function target(metric) {
  return { reps: metric === 'strength' ? 5 : metric === 'reps' ? 1 : null,
    weight: metric === 'strength' ? 0 : null,
    seconds: metric === 'hold' ? 30 : metric === 'cardio' ? 1200 : null,
    distance: null };
}
export function template(name = '') {
  return { id: uid(), version: 1, name, category: 'Strength', example: false, notes: '',
    reviewAfterCycles: null, reviewAcknowledgedCycle: 0, exercises: [] };
}
export function examples() {
  const a = template('Strength · example'); a.example = true;
  a.exercises = ['Back squat', 'Bench press', 'Shoulder press'].map(name => {
    const e = exercise(name); e.sets = Array.from({ length: 3 }, () => target('strength')); return e;
  });
  const b = template('Cycling · example'); b.example = true; b.category = 'Conditioning';
  const ride = exercise('Cycling', 'cardio'); ride.equipment = 'Bicycle or stationary bike';
  ride.instructions = 'Record the time and distance you actually complete. Change the example target to your own plan.';
  b.exercises = [ride];
  const c = template('Calisthenics · example'); c.example = true; c.category = 'Calisthenics';
  c.exercises = ['Pushups', 'Pullups'].map(name => {
    const e = exercise(name, 'reps'); e.format = 'ladder';
    e.sets = [1, 2, 3].map(reps => ({ ...target('reps'), reps }));
    e.instructions = 'Each row is one rung. These numbers demonstrate the format; edit them to match your chosen routine.';
    return e;
  });
  return [a, b, c];
}
export const pendingTemplate = s => s.plan.program?.completed ? undefined : s.templates.find(t => t.id === s.plan.sequence[s.plan.cursor]);
export const activeWorkout = s => s.workouts.find(w => w.id === s.activeId && w.status === 'active');
export function elapsed(timer, now = Date.now()) {
  return timer.elapsed + (timer.since === null ? 0 : Math.max(0, now - timer.since));
}
export function pause(timer, now = Date.now()) { timer.elapsed = elapsed(timer, now); timer.since = null; }
export function resume(timer, now = Date.now()) { if (timer.since === null) timer.since = now; }
export function restSeconds(w, now = Date.now()) {
  return w.rest.deadline === null ? w.rest.remaining : Math.max(0, (w.rest.deadline - now) / 1000);
}
export function startRest(w, seconds, now = Date.now()) {
  w.rest = { deadline: now + seconds * 1000, remaining: seconds };
}
export function extendRest(w, seconds, now = Date.now()) {
  const n = Math.max(0, restSeconds(w, now) + seconds);
  w.rest.remaining = n;
  // Adjusting a stopped timer starts it, so +30 s always counts down.
  w.rest.deadline = n > 0 ? now + n * 1000 : null;
}
// A session left open stops its clock at the last logged activity rather than counting for days.
export const IDLE_LIMIT = 4 * 3600000;
export function pauseIdle(s, now = Date.now()) {
  let paused = 0;
  for (const w of s.workouts.filter(w => w.status === 'active' && w.timer.since !== null)) {
    const last = Math.max(w.timer.since, Date.parse(w.updatedAt));
    if (now - last > IDLE_LIMIT) { pause(w.timer, last); w.rest = { deadline: null, remaining: 0 }; paused++; }
  }
  return paused;
}
export function completion(w) {
  const all = w.exercises.flatMap(e => e.sets.map(s => ({ e, s })));
  const required = all.filter(({ e, s }) => e.role === 'main' && s.required);
  const day = ['rest','recovery'].includes(w.guide?.type);
  if (day) return { done: w.acknowledged ? 1 : 0, total: 1, requiredDone: w.acknowledged ? 1 : 0, required: 1, full: !!w.acknowledged };
  return { done: all.filter(({ s }) => s.done).length, total: all.length,
    requiredDone: required.filter(({ s }) => s.done).length, required: required.length,
    full: required.length > 0 ? required.every(({ s }) => s.done) : all.some(({ s }) => s.done) };
}
export function createSession(s, t, kind = 'standalone', now = Date.now()) {
  if(kind==='planned' && pendingTemplate(s)?.id===t.id) {
    const prior=s.workouts.find(w=>w.status==='active' && w.planRef?.version===s.plan.version && w.planRef.position===s.plan.cursor && w.planRef.cycle===s.plan.cycle);
    if(prior) {const old=activeWorkout(s);if(old&&old.id!==prior.id)pause(old.timer,now);s.activeId=prior.id;resume(prior.timer,now);return prior;}
  }
  if (!t.exercises.length) throw new Error('Add at least one exercise before starting.');
  if(t.needsMax || t.exercises.some(e=>e.needsMax)) throw new Error('Set or test maximums for these movements before starting strength work.');
  const linked = t.calisthenicsId ? s.templates.find(r => r.id === t.calisthenicsId && r.category === 'Calisthenics') : null;
  if (t.calisthenicsId && !linked) throw new Error('The saved calisthenics routine is unavailable. Edit this routine’s association.');

  const current = activeWorkout(s);
  if (current) pause(current.timer, now);
  if (kind === 'planned') {
    if (pendingTemplate(s)?.id !== t.id) throw new Error('The next planned routine has changed.');
    const prior = s.workouts.find(w => w.status === 'active' && w.planRef?.version === s.plan.version &&
      w.planRef.position === s.plan.cursor && w.planRef.cycle === s.plan.cycle);
    if (prior) { s.activeId = prior.id; resume(prior.timer, now); return prior; }
  }
  const w = { id: uid(), status: 'active', completion: null, kind, title: t.name,
    templateId: t.id, templateVersion: t.version, example: t.example,
    planRef: kind === 'planned' ? { version: s.plan.version, position: s.plan.cursor, cycle: s.plan.cycle } : null,
    category: t.category, layout: t.layout || 'sets', guide: t.guide ? copy(t.guide) : null, instructions: t.notes, acknowledged: false,
    createdAt: iso(now), completedAt: null, updatedAt: iso(now), notes: '',
    timer: { elapsed: 0, since: now }, rest: { deadline: null, remaining: 0 }, autoRest: true,
    exercises: t.exercises.map(e => ({ ...copy(e), ...(t.guide?.type==='hic'?{timeUnit:'seconds'}:{}), sets: e.sets.map(v => ({ id: uid(),
      target: copy(v), actual: copy(v), done: false, required: e.role === 'main' })) })) };
  if (linked) { addExtra(w, linked, 'calisthenics'); w.calisthenics = { id: linked.id, version: linked.version, name: linked.name }; }
  s.workouts.push(w); s.activeId = w.id; return w;
}
export function addExtra(w, t, section = 'extra') {
  if (!t.exercises.length) throw new Error('This routine has no exercises.');
  for (const e of t.exercises) w.exercises.push({ ...copy(e), id: uid(), role: 'accessory', section, omitted: false,
    sets: e.sets.map(v => ({ id: uid(), target: copy(v), actual: copy(v), done: false, required: false })) });
}
export function finishSession(s, id, { partial = false, advancePartial = false } = {}, now = Date.now()) {
  const w = s.workouts.find(w => w.id === id);
  if (!w) throw new Error('Workout not found.');
  if (w.status === 'completed') return w; // Idempotent: never advance twice.
  const c = completion(w);
  if(['rest','recovery'].includes(w.guide?.type) && w.acknowledged) { const notice=recoveryNotice(s,{guide:w.guide},now);if(notice)throw new Error(notice); }
  if (!c.done) throw new Error('Complete at least one set before finishing.');
  if (!c.full && !partial) throw new Error('Required sets remain. Choose partial completion explicitly.');
  w.status = 'completed'; w.completion = c.full ? 'full' : 'partial'; w.completedAt = iso(now);
  pause(w.timer, now); w.rest.deadline = null; w.rest.remaining = 0; w.updatedAt = iso(now);
  if (w.planRef && (c.full || advancePartial) && w.planRef.version === s.plan.version &&
      w.planRef.position === s.plan.cursor && w.planRef.cycle === s.plan.cycle) {
    s.plan.cursor++;
    if (s.plan.cursor >= s.plan.sequence.length) {
      if (s.plan.program) { s.plan.cursor = s.plan.sequence.length - 1; s.plan.program.completed = true; }
      else { s.plan.cursor = 0; s.plan.cycle++; }
    }
  }
  if (s.activeId === w.id) s.activeId = null;
  return w;
}
export function replaceSequence(s, sequence) {
  if (s.workouts.some(w => w.status === 'active' && w.planRef?.version === s.plan.version))
    throw new Error('Finish the unfinished planned workout before changing the sequence. Alternatives can still be logged.');
  if (sequence.some(id => !s.templates.some(t => t.id === id))) throw new Error('Unknown routine in sequence.');
  s.plan = { version: uid(), sequence: [...sequence], cursor: 0, cycle: 1 };
  s.templates.forEach(t => t.reviewAcknowledgedCycle = 0);
}
export function exerciseKey(e) {
  return [e.name.trim().normalize('NFKC').toLowerCase(), e.metric, e.format, e.metric === 'cardio' ? e.distanceUnit : '', e.rest].join('|');
}
export function observations(s, key) {
  return s.workouts.filter(w => w.status === 'completed').flatMap(w => w.exercises
    .filter(e => exerciseKey(e) === key).map(e => ({ workout: w, exercise: e,
      sets: e.sets.filter(set => set.done), date: w.completedAt })))
    .filter(o => o.sets.length).sort((a, b) => a.date.localeCompare(b.date));
}
export function primaryValue(o) {
  const values = o.sets.map(s => s.actual);
  if (o.exercise.metric === 'strength') return Math.max(...values.map(v => v.weight ?? 0));
  if (o.exercise.metric === 'reps') return values.reduce((n, v) => n + (v.reps ?? 0), 0);
  return values.reduce((n, v) => n + (v.seconds ?? 0), 0);
}
export function sinceTraining(s, now = Date.now()) {
  const last = s.workouts.filter(w => w.status === 'completed' && w.kind === 'planned' && !['rest','recovery'].includes(w.guide?.type))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  return last ? Math.max(0, Math.floor((now - Date.parse(last.completedAt)) / 86400000)) : null;
}

export function localDay(value) { const d=new Date(value); return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) / 86400000; }
export function recoveryNotice(s,t,now=Date.now()) {
  if(!t?.guide) return '';
  const done=s.workouts.filter(w=>w.status==='completed');
  const strength=done.filter(w=>(!w.guide || w.guide.type==='strength') && w.exercises.some(e=>e.role==='main' && e.metric==='strength')).sort((a,b)=>b.completedAt.localeCompare(a.completedAt))[0];
  if(t.guide.type==='strength' && strength && localDay(now)-localDay(strength.completedAt)<(s.plan.configuration?.barbell==='Operator'&&s.plan.program?.id!=='tb2-standard-2015-v1'?2:s.plan.configuration?.barbell==='Zulu'&&s.plan.program?.id!=='tb2-standard-2015-v1'?0:3)) return 'The selected strength template needs more spacing between these sessions. Review your recovery before starting.';
  if(done.some(w=>w.guide?.type==='rest' && localDay(w.completedAt)===localDay(now)) && !['rest','recovery'].includes(t.guide.type)) return 'You recorded today as a complete rest day. Starting structured work today changes that plan.';
  if(['rest','recovery'].includes(t.guide.type) && done.some(w=>!['rest','recovery'].includes(w.guide?.type) && localDay(w.completedAt)===localDay(now))) return 'Structured work is already recorded today. Another workout does not count as a recovery or complete rest day.';
  return '';
}
export function acknowledgeDay(s,w,now=Date.now()) {
  if(!['rest','recovery'].includes(w.guide?.type)) throw new Error('Not a rest or recovery day.');
  const notice=recoveryNotice(s,{guide:w.guide},now); if(notice) throw new Error(notice);
  w.acknowledged=true;
}
export function restAfter(w,ei,si) {
  if(w.restOverride!==undefined) return w.restOverride;
  const main=w.exercises.filter(e=>e.role==='main');
  return w.layout==='circuit' && w.exercises[ei]===main.at(-1) ? 120 : w.exercises[ei].rest;
}
export function omitCalisthenics(w,omitted) {
  for(const e of w.exercises.filter(e=>e.section==='calisthenics')) e.omitted=omitted;
}
export function upgradeState(value) {
  const s=copy(value);
  if([1,2].includes(s?.schemaVersion)) { s.schemaVersion=SCHEMA;s.profile??=null;s.maxTests??=[];s.favorites??=[]; }
  return validateState(s);
}

// Strict, bounded validation before both persistence and import. Never partially restore.
const fail = message => { throw new Error(message); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 300) => typeof v === 'string' && v.length <= max;
const id = v => text(v, 100) && v.length > 0;
const num = (v, max, integer = false) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v));
const stamp = v => typeof v === 'string' && v.length < 50 && Number.isFinite(Date.parse(v));
function unique(items, label) {
  if (items.some(i => !object(i) || !id(i.id))) fail(`Invalid ${label} record.`);
  if (new Set(items.map(i => i.id)).size !== items.length) fail(`Duplicate ${label} IDs.`);
}
function validateTarget(v) {
  if (!object(v)) fail('Invalid target/result.');
  for (const [k, max] of [['reps', 10000], ['weight', 5000], ['seconds', 604800], ['distance', 100000]])
    if (v[k] !== null && !num(v[k], max, k === 'reps')) fail(`Invalid ${k} value.`);
}
function validateExercise(e, logged = false) {
  if (!object(e) || !id(e.id) || !text(e.name, 160) || !e.name.trim() || !METRICS.includes(e.metric) ||
      !FORMATS.includes(e.format) || !['main', 'accessory', 'warmup'].includes(e.role) ||
      !text(e.equipment, 500) || !text(e.instructions, 10000) || !num(e.rest, 3600, true) ||
      !['km', 'mi', 'm'].includes(e.distanceUnit) || !Array.isArray(e.locations) || !e.locations.length ||
      e.locations.length > 2 || e.locations.some(l => !['Home', 'Gym'].includes(l)) ||
      !Array.isArray(e.sets) || !e.sets.length || e.sets.length > 100) fail('Invalid exercise or set structure.');
  if(e.needsMax!==undefined&&typeof e.needsMax!=='boolean')fail('Invalid maximum requirement.');
  if(e.loading!==undefined&&(!object(e.loading)||!num(e.loading.percent,1)||e.loading.percent<=0||![1,.9].includes(e.loading.factor)||!num(e.loading.increment,100)||e.loading.increment<=0||!['lb','kg'].includes(e.loading.unit)))fail('Invalid loading rule.');
  if(e.timeUnit!==undefined && !['seconds','minutes'].includes(e.timeUnit)) fail('Invalid time display unit.');
  if (e.section !== undefined && !['calisthenics','extra','strength','conditioning'].includes(e.section) || e.omitted !== undefined && typeof e.omitted !== 'boolean') fail('Invalid workout section.');
  if (e.reference !== undefined) { const r=e.reference; if(!object(r) || !num(r.maximum,5000) || r.maximum<=0 || ![1,.9].includes(r.factor) || !num(r.percent,1) || r.percent<=0 || !num(r.raw,5000) || !num(r.increment,500) || r.increment<=0 || r.bodyweight!==undefined && !num(r.bodyweight,2000) || !['estimate','direct'].includes(r.method) || r.method==='estimate' && (!num(r.load,5000) || r.load<=0 || ![3,4,5].includes(r.reps))) fail('Invalid reference maximum.'); }
  if (logged) {
    unique(e.sets, 'set');
    for (const s of e.sets) {
      if (!object(s) || !id(s.id) || typeof s.done !== 'boolean' || typeof s.required !== 'boolean') fail('Invalid logged set.');
      validateTarget(s.target); validateTarget(s.actual);
      if (s.done && (e.metric === 'strength' && (s.actual.reps === null || s.actual.weight === null) ||
          e.metric === 'reps' && s.actual.reps === null ||
          ['hold', 'cardio'].includes(e.metric) && s.actual.seconds === null)) fail('Enter completed values before marking a set done.');
    }
  } else e.sets.forEach(validateTarget);
}
function validateGuide(g) {
  if(g===undefined || g===null) return;
  if(!object(g) || !num(g.week,12,true) || g.week<1 || !num(g.day,7,true) || g.day<1 || !['se','e','hic','strength','rest','recovery'].includes(g.type) || !num(g.minMinutes,120) || !num(g.maxMinutes,120) || g.maxMinutes<g.minMinutes || !text(g.source,300)) fail('Invalid program prescription.');
}
function validateProfileData(p) {
 if(!object(p)||!['Operator','Fighter','Zulu'].includes(p.barbell)||!['Black','Green'].includes(p.conditioning)||p.conditioning==='Green'&&p.barbell!=='Fighter'||typeof p.baseFirst!=='boolean'||!['lb','kg','both'].includes(p.displayUnit)||!['lb','kg'].includes(p.inputUnit)||!['lb','kg'].includes(p.incrementUnit)||!num(p.increment,100)||p.increment<=0||![1,.9].includes(p.factor)||![6,12].includes(p.retestWeeks)||!['sets','ladder','pyramid','near-failure'].includes(p.calisFormat)||!num(p.calisRest,3600,true)||!num(p.calisHold,3600)||p.calisHold<=0||!id(p.endurance)||!id(p.hic)||!['basic','standard','advanced'].includes(p.variant)||p.liftRest!==undefined&&!num(p.liftRest,3600,true))fail('Invalid training configuration.');
 for(const key of ['cluster','circuit','calis'])if(!Array.isArray(p[key])||p[key].length>12||p[key].some(v=>!id(v)||!MOVEMENTS.some(m=>m.id===v)))fail('Invalid exercise choices.');
 if(!Array.isArray(p.calisReps)||!p.calisReps.length||p.calisReps.length>30||p.calisReps.some(v=>v!==null&&!num(v,10000,true)))fail('Invalid calisthenics targets.');
}
export function validateState(s) {
  if (!object(s) || s.schemaVersion !== SCHEMA) fail('Unsupported backup/data version.');
  if (!num(s.revision, Number.MAX_SAFE_INTEGER, true) || !stamp(s.createdAt) || !stamp(s.updatedAt)) fail('Invalid data metadata.');
  const settings = s.settings;
  if (!object(settings) || !['Home', 'Gym'].includes(settings.location) || settings.weightUnit !== 'lb' ||
      (settings.lastExportAt !== null && !stamp(settings.lastExportAt)) ||
      (settings.lastExportRevision !== undefined && settings.lastExportRevision !== null && !num(settings.lastExportRevision, Number.MAX_SAFE_INTEGER, true)) ||
      (settings.gapDays !== null && (!num(settings.gapDays, 365, true) || settings.gapDays < 1))) fail('Invalid settings.');
  if (!Array.isArray(s.templates) || s.templates.length > 500 || !Array.isArray(s.workouts) || s.workouts.length > 20000) fail('Invalid collection sizes.');
  unique(s.templates, 'routine'); unique(s.workouts, 'workout');
  for (const t of s.templates) {
    if (!object(t) || !id(t.id) || !text(t.name, 160) || !t.name.trim() || !num(t.version, 100000, true) || t.version < 1 ||
        !['Strength', 'Conditioning', 'Calisthenics', 'Custom'].includes(t.category) || typeof t.example !== 'boolean' ||
        !text(t.notes, 10000) || (t.reviewAfterCycles !== null && (!num(t.reviewAfterCycles, 100, true) || t.reviewAfterCycles < 1)) ||
        (t.reviewAcknowledgedCycle !== undefined && !num(t.reviewAcknowledgedCycle, 1000000, true)) ||
        !Array.isArray(t.exercises) || !t.exercises.length || t.exercises.length > 50) fail('Invalid routine.');
    validateGuide(t.guide);
    if(t.layout !== undefined && !['sets','circuit'].includes(t.layout)) fail('Invalid routine layout.');
    if(t.calisthenicsId !== undefined && t.calisthenicsId !== null && (!id(t.calisthenicsId) || t.calisthenicsId===t.id || !s.templates.some(r=>r.id===t.calisthenicsId && r.category==='Calisthenics' && !r.calisthenicsId))) fail('Invalid linked calisthenics routine.');
    unique(t.exercises, 'exercise'); t.exercises.forEach(e => validateExercise(e));
  }
  const p = s.plan;
  if (!object(p) || !id(p.version) || !Array.isArray(p.sequence) || p.sequence.length > 100 ||
      p.sequence.some(i => !s.templates.some(t => t.id === i)) || !num(p.cursor, Math.max(0, p.sequence.length - 1), true) ||
      !num(p.cycle, 1000000, true) || p.cycle < 1) fail('Invalid plan sequence.');
  if(p.program!==undefined) {
    if(!object(p.program)||!['tb2-standard-2015-v1','tb-continuation-v1'].includes(p.program.id)||!stamp(p.program.startedAt)||typeof p.program.completed!=='boolean'||p.program.id==='tb2-standard-2015-v1'&&p.sequence.length!==56||p.program.id==='tb-continuation-v1'&&![42,63,84].includes(p.sequence.length)||p.sequence.some((tid,i)=>{const g=s.templates.find(t=>t.id===tid)?.guide;return !g||g.week!==Math.floor(i/7)+1||g.day!==i%7+1;}))fail('Invalid guided block.');
  }
  if(s.profile!==null)validateProfileData(s.profile);
  if(p.configuration!==undefined)validateProfileData(p.configuration);
  if(!Array.isArray(s.favorites)||s.favorites.length>200||s.favorites.some(v=>!id(v))||!Array.isArray(s.maxTests)||s.maxTests.length>10000)fail('Invalid preferences or maximum history.');
  unique(s.maxTests,'maximum');
  for(const m of s.maxTests)if(!text(m.name,160)||!m.name.trim()||!['strength','reps','hold'].includes(m.metric)||!['manual','estimate','rep-test'].includes(m.kind)||!num(m.maximum,m.metric==='strength'?5000:10000)||m.maximum<=0||!stamp(m.createdAt)||!stamp(m.date)||!text(m.method,80)||!num(m.inputValue,10000)||!['lb','kg','reps','seconds'].includes(m.inputUnit)||m.kind==='estimate'&&(!num(m.load,5000)||![3,4,5].includes(m.reps))||m.bodyweight!==undefined&&(!num(m.bodyweight,2000)||m.bodyweight<=0))fail('Invalid maximum/test record.');
  for (const w of s.workouts) {
    if (!object(w) || !id(w.id) || !['active', 'completed'].includes(w.status) ||
        !['planned', 'standalone'].includes(w.kind) || !text(w.title, 160) || !w.title.trim() || !id(w.templateId) ||
        !num(w.templateVersion, 100000, true) || w.templateVersion < 1 || typeof w.example !== 'boolean' ||
        !text(w.notes, 10000) || !stamp(w.createdAt) || !stamp(w.updatedAt) ||
        !Array.isArray(w.exercises) || !w.exercises.length || w.exercises.length > 100 ||
        !object(w.timer) || !num(w.timer.elapsed, 315360000000) ||
        (w.timer.since !== null && !num(w.timer.since, 9999999999999)) ||
        !object(w.rest) || !num(w.rest.remaining, 86400) ||
        (w.rest.deadline !== null && !num(w.rest.deadline, 9999999999999)) || typeof w.autoRest !== 'boolean') fail('Invalid workout.');
    validateGuide(w.guide);
    if(w.layout!==undefined && !['sets','circuit'].includes(w.layout) || w.acknowledged!==undefined && typeof w.acknowledged!=='boolean' || w.instructions!==undefined && !text(w.instructions,10000) || w.category!==undefined && !['Strength','Conditioning','Calisthenics','Custom'].includes(w.category) || w.restOverride!==undefined && !num(w.restOverride,3600,true)) fail('Invalid workout display metadata.');
    if(w.calisthenics!==undefined && (!object(w.calisthenics) || !id(w.calisthenics.id) || !num(w.calisthenics.version,100000,true) || !text(w.calisthenics.name,160))) fail('Invalid calisthenics snapshot.');
    if (w.status === 'completed' && (!stamp(w.completedAt) || !['full', 'partial'].includes(w.completion) || w.timer.since !== null)) fail('Invalid completed workout.');
    if (w.status === 'active' && (w.completedAt !== null || w.completion !== null)) fail('Invalid unfinished workout.');
    if (w.planRef !== null && (!object(w.planRef) || !id(w.planRef.version) || !num(w.planRef.position, 99, true) ||
        !num(w.planRef.cycle, 1000000, true) || w.planRef.cycle < 1 || w.kind !== 'planned')) fail('Invalid workout plan link.');
    if (w.kind === 'planned' && w.planRef === null) fail('Planned workout missing its link.');
    unique(w.exercises, 'workout exercise'); w.exercises.forEach(e => validateExercise(e, true));
  }
  if (s.activeId !== null && !s.workouts.some(w => w.id === s.activeId && w.status === 'active')) fail('Invalid active workout link.');
  return s;
}
export function backupText(s, now = Date.now()) {
  validateState(s);
  const text = JSON.stringify({ format: 'forge-fuel-backup', version: 1, exportedAt: iso(now), data: s }, null, 2);
  if (new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024) fail('Backup exceeds the supported 20 MB limit.');
  return text;
}
export function parseBackup(textValue) {
  if (new TextEncoder().encode(textValue).byteLength > 20 * 1024 * 1024) fail('Backup exceeds the 20 MB limit.');
  let b; try { b = JSON.parse(textValue); } catch { fail('This file is not valid JSON.'); }
  if (!object(b) || b.format !== 'forge-fuel-backup' || b.version !== 1 || !stamp(b.exportedAt)) fail('Not a supported Forge&Fuel backup.');
  return { data: upgradeState(b.data), exportedAt: b.exportedAt };
}
export function restoreBackup(current, backup) {
  validateState(current); validateState(backup.data);
  if (!stamp(backup.exportedAt)) fail('Invalid backup date.');
  const restored = blankState();
  // Only schema-owned fields are copied; unknown input keys never become state properties.
  for (const key of Object.keys(restored)) restored[key] = copy(backup.data[key]);
  restored.revision = current.revision;
  const at = Date.parse(backup.exportedAt);
  for (const w of restored.workouts.filter(w => w.status === 'active')) {
    pause(w.timer, at); w.rest.remaining = restSeconds(w, at); w.rest.deadline = null;
  }
  return validateState(restored);
}
