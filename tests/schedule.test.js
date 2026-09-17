import test from 'node:test';
import assert from 'node:assert/strict';
import { due, readSchedule } from '../js/schedule.js';
test('daily and legacy products remain due',()=>assert.equal(due({},'2026-09-17'),true));
test('fixed weekdays use local calendar date',()=>{
 const p={programacion:{tipo:'semana',dias:[1,3,5]}};
 assert.equal(due(p,'2026-09-16'),true);
 assert.equal(due(p,'2026-09-17'),false);
});
test('interval starts at anchor and crosses month boundaries',()=>{
 const p={programacion:{tipo:'intervalo',inicio:'2024-02-28',cada:2}};
 assert.equal(due(p,'2024-02-26'),false);
 assert.equal(due(p,'2024-02-28'),true);
 assert.equal(due(p,'2024-02-29'),false);
 assert.equal(due(p,'2024-03-01'),true);
});
test('frequency form rejects missing days and invalid interval',()=>{
 const f=new FormData();f.set('frecuencia','semana');
 assert.throws(()=>readSchedule(f));
 f.append('dias','1');f.set('solo_noche','on');
 assert.deepEqual(readSchedule(f).dias,[1]);
 assert.equal(readSchedule(f).solo_noche,true);
 f.set('frecuencia','intervalo');f.set('inicio_programa','2026-09-17');f.set('cada','0');
 assert.throws(()=>readSchedule(f));f.set('cada','3');assert.equal(readSchedule(f).cada,3);
});
