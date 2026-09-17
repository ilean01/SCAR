import { dateISO, escapeHTML as esc } from './core.js';
import { due } from './schedule.js';
export const remaining = (wait, now=Date.now()) => !wait ? 0 : Math.max(0,wait.deadline==null?wait.left:wait.deadline-now);
export const clock = ms => {const n=Math.ceil(ms/1000);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
let A, current;
const $=s=>document.querySelector(s);
export function initRunner(api) {
  A=api;
  $('#quickCard').insertAdjacentHTML('afterend','<article class="tarjeta" id="routineRunner" hidden></article>');
  setInterval(tick,250);
  document.addEventListener('visibilitychange',tick);
}
export async function startRoutine(routine) {
  const date=A.date();
  if(date!==dateISO()) throw Error('El modo paso a paso es para hoy. Podés registrar días anteriores desde el diario.');
  const r=await A.record(date);
  if(r.sesiones?.guiada) {$('#routineRunner').scrollIntoView({behavior:'smooth',block:'center'});return;}
  const products=await A.all('productos');
  const plan=(routine.productos||[]).map(id=>products.find(p=>p.id===id)).filter(p=>p&&!p.eliminado&&due(p,date)).map(p=>({id:p.id,nombre:p.nombre,solo_noche:p.programacion?.solo_noche||p.momento==='noche',espera:Number(routine.esperas?.[p.id])||0}));
  if(!plan.length) throw Error('Esta rutina no tiene productos programados para hoy. Editá sus pasos o elegí otra.');
  await A.mutate(d=>{d.sesiones||={};d.sesiones.guiada={id:crypto.randomUUID(),rutina_id:routine.id,nombre:routine.nombre,plan,indice:0,productos:[],inicio:new Date().toISOString()};},true,date);
  $('#routineRunner').scrollIntoView({behavior:'smooth',block:'center'});
}
function tick() {
  if(!current || current.owner!==A.owner() || !$('#runnerClock')) return;
  const wait=current.session.espera,left=remaining(wait),duration=wait?.duration||1;
  $('#runnerClock').textContent=clock(left);
  $('#runnerCircle').style.setProperty('--progress',`${360*(1-left/duration)}deg`);
  $('#runnerNext').disabled=left>0;
  $('#runnerPause').disabled=!left;
  $('#runnerStatus').textContent=left?(wait.deadline==null?'En pausa':'Tiempo de espera'):'Espera terminada. Podés seguir al próximo paso.';
}
export function renderRunner(record) {
  const panel=$('#routineRunner'),s=record.sesiones?.guiada;
  current=s?{session:s,owner:A.owner(),date:record.fecha}:null;
  panel.hidden=!s;if(!s)return;
  const owner=A.owner(),date=record.fecha,sessionId=s.id;
  const change=fn=>A.action(async()=>{
    if(owner!==A.owner())throw Error('La cuenta cambió. Volvé a abrir tu rutina.');
    await A.mutate(d=>{const active=d.sesiones?.guiada;if(active?.id!==sessionId)throw Error('Esta rutina cambió. Volvé a abrir el día.');fn(active,d);},true,date);
  });
  const step=s.plan[s.indice];
  panel.innerHTML=`<span class="eyebrow">TU RUTINA, PASO A PASO</span><h2>${esc(s.nombre)}</h2><p>${s.indice} de ${s.plan.length} productos aplicados</p>${s.productos.map(p=>`<p>✓ ${esc(p.nombre)}</p>`).join('')}${s.espera?`<div class="wait-ring" id="runnerCircle"><output id="runnerClock" aria-label="Tiempo restante"></output></div><p id="runnerStatus" role="status"></p><div class="form-actions"><button class="boton secundario auto" id="runnerPause">${s.espera.deadline==null?'Continuar contador':'Pausar'}</button><button class="texto" id="runnerSkip">Saltar espera</button><button class="boton auto" id="runnerNext">Siguiente producto</button></div>`:step?`<p class="eyebrow">PASO ${s.indice+1}</p><h3>${esc(step.nombre)}</h3><p>${step.espera&&s.indice<s.plan.length-1?`Después de aplicarlo: ${step.espera} minuto(s) de espera.`:'Sin espera programada después de este paso.'}</p><button class="boton" id="runnerApply">Ya me lo puse</button>`:'<p>Todos los pasos están marcados.</p><button class="boton" id="runnerFinish">Terminé mi rutina</button>'}<p class="fineprint">Las esperas las elegís al editar tu rutina. El progreso queda guardado y el tiempo se actualiza al volver; no envía notificaciones con la app cerrada.</p>`;
  if(s.espera){
    $('#runnerPause').onclick=()=>change(a=>{const w=a.espera;if(!w)return;const left=remaining(w);a.espera={...w,left,deadline:w.deadline==null?Date.now()+left:null};});
    $('#runnerSkip').onclick=()=>change(a=>{a.espera=null;});
    $('#runnerNext').onclick=()=>change(a=>{if(remaining(a.espera)>0)throw Error('Todavía queda tiempo de espera.');a.espera=null;});
    tick();
  }else if(step){
    $('#runnerApply').onclick=()=>change(a=>{
      if(a.indice!==s.indice||a.espera)return;
      const p=a.plan[a.indice],hour=new Date().getHours();
      if(p.solo_noche&&hour>=6&&hour<20&&!confirm('Este producto está marcado solo de noche. ¿Registrar que lo usaste igualmente?'))return;
      a.productos.push({id:p.id,nombre:p.nombre,hora:new Date().toTimeString().slice(0,5)});a.indice++;
      if(p.espera>0&&a.indice<a.plan.length){const duration=p.espera*60000;a.espera={duration,left:duration,deadline:Date.now()+duration};}
    });
  }else $('#runnerFinish').onclick=()=>change((a,d)=>{
    if(a.indice<a.plan.length||remaining(a.espera)>0)return;
    d.sesiones.cuidados||=[];
    d.sesiones.cuidados.push({...a,estado:'terminada',hora:new Date().toTimeString().slice(0,5),registrado_en:new Date().toISOString()});
    delete d.sesiones.guiada;
  });
}
