import * as C from './core.js';
// Short, original cues. These are exercise choices, not injury-specific prescriptions.
import {MOVEMENTS} from './movement-data.js';
export {MOVEMENTS};
export const findMovement=id=>MOVEMENTS.find(e=>e.id===id);
export function movement(id) {
 const item=findMovement(id);if(!item)throw new Error('Choose a named exercise.');
 const e=C.exercise(item.name,item.metric);e.catalogId=id;e.instructions=item.instructions;e.equipment=item.group;e.locations=['Home','Gym'];return e;
}
export const CONDITIONING = [
 {id:'running',type:'e',name:'Easy run / run-walk',mode:'Running',book:'TBII · Endurance #1'},
 {id:'cycling',type:'e',name:'Easy cycling',mode:'Cycling',book:'TBII · Endurance #1'},
 {id:'rowing',type:'e',name:'Easy rowing',mode:'Rowing',book:'TBII · Endurance #1'},
 {id:'swimming',type:'e',name:'Easy swimming',mode:'Swimming',book:'TBII · Endurance #1'},
 {id:'resets',type:'hic',name:'600 m resets',book:'TBII · HIC #3',base:true,variants:{basic:{count:4,distance:600,rest:180},standard:{count:6,distance:600,rest:180},advanced:{count:10,distance:600,rest:180}},instructions:'Warm up with 5–10 minutes of easy jogging. Complete the listed hard, maximal-effort 600 m runs from a recovered state. Recover for 3–5 minutes between them, starting each effort well rested. Record each effort’s time.'},
 {id:'tempo',type:'hic',name:'Fast 5 tempo run',book:'TBII · HIC #2',base:true,variants:{basic:{count:1,distance:2500,rest:0},standard:{count:1,distance:5000,rest:0}},instructions:'Run at a faster sustained effort than your easy endurance sessions. The basic version halves the standard 5 km distance. Record actual time and distance.'},
 {id:'hills',type:'hic',name:'Short hills',book:'TBII · HIC #10',base:true,variants:{basic:{count:5,seconds:15,rest:60},standard:{count:10,seconds:15,rest:60},advanced:{count:15,seconds:15,rest:60}},instructions:'Choose a short hill taking roughly 10–15 seconds to sprint up. Walk back down to recover, about 30–60 seconds, then repeat. The 15-second target describes hill length; record actual effort time. Basic: five efforts; standard: ten; advanced: fifteen to twenty.'}
];
export const LABELS={strength:'Strength + calisthenics',se:'Strength-endurance circuit',e:'Easy endurance',hic:'High-intensity conditioning',recovery:'Recovery',rest:'Rest'};
