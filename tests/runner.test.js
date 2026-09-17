import test from 'node:test';
import assert from 'node:assert/strict';
import {remaining,clock,initRunner,startRoutine,renderRunner} from '../js/runner.js';
import {dateISO} from '../js/core.js';
test('routine timer uses deadline, including time away from app',()=>{
 assert.equal(remaining({deadline:120000,left:60000},90000),30000);
 assert.equal(remaining({deadline:120000,left:60000},130000),0);
});
test('paused timer preserves remaining duration',()=>{
 assert.equal(remaining({deadline:null,left:45000},9999999),45000);
 assert.equal(remaining(null),0);
});
test('circular countdown rounds up to whole seconds',()=>{
 assert.equal(clock(120000),'02:00');
 assert.equal(clock(1),'00:01');
 assert.equal(clock(0),'00:00');
});
test('guided routine saves applied steps, pause, skipped wait and completion',async()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{style:{setProperty(){}},insertAdjacentHTML(){},scrollIntoView(){}});return nodes.get(id);};
 const originalDocument=globalThis.document, originalInterval=globalThis.setInterval;
 globalThis.document={querySelector:node,addEventListener(){}};
 globalThis.setInterval=()=>0;
 let record={fecha:dateISO(),sesiones:{}};
 const products=[{id:'a',nombre:'Crema'},{id:'b',nombre:'Sérum'}];
 try {
   initRunner({date:()=>record.fecha,owner:()=> 'test',record:async()=>structuredClone(record),all:async()=>products,action:fn=>fn(),mutate:async fn=>{fn(record);renderRunner(structuredClone(record));}});
   await startRoutine({id:'r',nombre:'Noche',productos:['a','b'],esperas:{a:2}});
   assert.equal(record.sesiones.guiada.indice,0);
   await node('#runnerApply').onclick();
   assert.equal(record.sesiones.guiada.productos.length,1);
   assert.equal(record.sesiones.guiada.espera.duration,120000);
   await node('#runnerPause').onclick();
   assert.equal(record.sesiones.guiada.espera.deadline,null);
   await node('#runnerPause').onclick();
   assert.ok(record.sesiones.guiada.espera.deadline>Date.now());
   await node('#runnerSkip').onclick();
   await node('#runnerApply').onclick();
   await node('#runnerFinish').onclick();
   assert.equal(record.sesiones.guiada,undefined);
   assert.equal(record.sesiones.cuidados[0].estado,'terminada');
   assert.equal(record.sesiones.cuidados[0].productos.length,2);
   assert.match(record.sesiones.cuidados[0].hora,/^\d{2}:\d{2}$/);
 } finally {globalThis.document=originalDocument;globalThis.setInterval=originalInterval;}
});
