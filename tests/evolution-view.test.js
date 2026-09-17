import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../js/core.js';
import * as analytics from '../js/analytics.js';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function renderEvolution()'),app.indexOf('function clean(r)'));
async function render(data,fail=false){
 const nodes=new Map();
 const context=vm.createContext({...core,...analytics,esc:core.escapeHTML,db:{},cloud:{user:null},friendly:e=>e.message,zoneName:()=> 'Mentón',all:async(_,t)=>{if(fail)throw Error('Lectura interrumpida');return data[t]||[];},$:s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:''});return nodes.get(s);}});
 await vm.runInContext(source+'\nrenderSettings()',context);
 return nodes;
}
test('Mi espacio contains evolution before account settings, with no separate evolution tab',()=>{
 const section=html.slice(html.indexOf('id="vista-ajustes"'));
 assert.ok(section.indexOf('id="evolucion"')<section.indexOf('id="ajustes"'));
 assert.equal(html.includes('data-nav="evolucion"'),false);
});
test('all five analysis panels render inside Mi espacio even with no records',async()=>{
 const nodes=await render({}),content=nodes.get('#evolucion').innerHTML;
 for(const heading of ['Así se sintió tu piel','Lo que te acompañó','Lo que observaste en cada fase','Productos que estás evaluando','Plata y duración de envases'])assert.ok(content.includes(heading),heading);
 assert.ok(nodes.get('#ajustes').innerHTML.includes('Una copia para vos'));
});
test('existing skin data produces actual graph and counts, not just introductory text',async()=>{
 const nodes=await render({registros:[{fecha:'2026-09-16',estado_piel:4,productosUsados:{mañana:['p']},fotos:[]}],productos:[{id:'p',nombre:'Crema'}]});
 const content=nodes.get('#evolucion').innerHTML;
 assert.ok(content.includes('<svg class="trend"'));
 assert.ok(content.includes('2026-09-16: 4/5'));
 assert.ok(content.includes('1/1 días (n = 1)'));
});
test('removed standalone timer and old migration banner stay absent; guided timer remains',()=>{
 const extras=readFileSync(new URL('../js/extras.js',import.meta.url),'utf8');
 assert.ok(!extras.includes('initCareTimer'));
 assert.ok(!app.includes('Actualización V6 · análisis de envases'));
 assert.ok(extras.includes('initRunner(A)'));
});
