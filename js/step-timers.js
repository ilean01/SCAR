import {remaining,clock} from './runner.js';
import {escapeHTML as esc} from './core.js';
let A, mounted=[];
export function setStepTimer(record,moment,id,checked,minutes,now=Date.now()) {
  record.sesiones||={};record.sesiones[moment]||={nombre:moment,plan:[]};
  const session=record.sesiones[moment];session.temporizadores||={};
  if(!checked){delete session.temporizadores[id];return;}
  if(session.temporizadores[id])return;
  const duration=Math.max(0,Math.min(180,Number(minutes)||0))*60000;
  session.temporizadores[id]={duration,left:duration,deadline:duration?now+duration:null};
}
export function initStepTimers(api){A=api;setInterval(tick,250);document.addEventListener('visibilitychange',tick);}
function tick(){
  for(const x of mounted){
    if(!x.panel.isConnected||x.owner!==A.owner())continue;
    const left=remaining(x.wait);
    x.panel.querySelector('output').textContent=clock(left);
    x.panel.querySelector('.wait-ring').style.setProperty('--progress',`${x.wait.duration?360*(1-left/x.wait.duration):360}deg`);
    x.panel.querySelector('[data-pause]').disabled=!left;
    x.panel.querySelector('[role=status]').textContent=left?(x.wait.deadline==null?'En pausa':'Esperando después de aplicar el producto'):x.wait.duration?'Espera terminada':'Sin espera configurada para este paso';
  }
}
export function renderStepTimers(record){
  mounted=[];
  document.querySelectorAll('.inline-step-timer').forEach(n=>n.remove());
  for(const input of document.querySelectorAll('[data-prod]')){
    const moment=input.dataset.momento,id=input.dataset.prod,session=record.sesiones?.[moment],wait=session?.temporizadores?.[id];
    if(!input.checked||!wait||session.estado==='terminada')continue;
    const panel=document.createElement('div');panel.className='inline-step-timer';
    const name=input.closest('label').querySelector('.prod-name').textContent;
    panel.innerHTML=`<p>Tiempo después de ${esc(name)}</p><div class="wait-ring"><output aria-label="Tiempo restante"></output></div><p role="status"></p><div class="form-actions"><button type="button" class="boton secundario auto" data-pause>${wait.deadline==null?'Continuar':'Pausar'}</button><button type="button" class="texto" data-reset>Reiniciar</button><button type="button" class="texto" data-skip>Saltar espera</button></div>`;
    input.closest('label').after(panel);
    const owner=A.owner(),date=record.fecha;
    const change=fn=>A.action(async()=>{
      if(owner!==A.owner())throw Error('La cuenta cambió. Volvé a abrir el día.');
      await A.mutate(d=>{const w=d.sesiones?.[moment]?.temporizadores?.[id];if(w)fn(w);},true,date);
    });
    panel.querySelector('[data-pause]').onclick=()=>change(w=>{const left=remaining(w);w.left=left;w.deadline=w.deadline==null?Date.now()+left:null;});
    panel.querySelector('[data-reset]').onclick=()=>change(w=>{w.left=w.duration;w.deadline=Date.now()+w.duration;});
    panel.querySelector('[data-skip]').onclick=()=>change(w=>{w.left=0;w.deadline=null;});
    mounted.push({panel,wait,owner});
  }
  tick();
}
