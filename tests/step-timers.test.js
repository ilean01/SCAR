import test from 'node:test';
import assert from 'node:assert/strict';
import {setStepTimer} from '../js/step-timers.js';
import {remaining} from '../js/runner.js';
test('checking a product creates its configured wait without restarting an existing wait',()=>{
 const r={};setStepTimer(r,'noche','cleanser',true,10,1000);
 const wait=r.sesiones.noche.temporizadores.cleanser;
 assert.equal(wait.duration,600000);assert.equal(wait.deadline,601000);
 setStepTimer(r,'noche','cleanser',true,10,5000);
 assert.equal(wait.deadline,601000);
 assert.equal(remaining(wait,61000),540000);
});
test('unchecking removes only that product timer and morning and night are independent',()=>{
 const r={};setStepTimer(r,'mañana','p',true,2,0);setStepTimer(r,'noche','p',true,10,0);
 setStepTimer(r,'noche','p',false,10);
 assert.equal(r.sesiones.noche.temporizadores.p,undefined);
 assert.equal(r.sesiones.mañana.temporizadores.p.duration,120000);
});
test('zero wait does not invent a duration and saved deadlines survive serialization',()=>{
 const r={};setStepTimer(r,'noche','p',true,0);
 assert.equal(remaining(r.sesiones.noche.temporizadores.p),0);
 setStepTimer(r,'noche','other',true,1,1000);
 const restored=JSON.parse(JSON.stringify(r));
 assert.equal(remaining(restored.sesiones.noche.temporizadores.other,62000),0);
});
