import { dayDiff } from './core.js';
export function due(p, date) {
  const s = p.programacion || {};
  if (s.tipo === 'semana') return (s.dias || []).includes(new Date(date + 'T12:00:00').getDay());
  if (s.tipo === 'intervalo') return !!s.inicio && dayDiff(date,s.inicio) >= 0 && dayDiff(date,s.inicio) % s.cada === 0;
  return true;
}
export function scheduleFields(p, date) {
  const s=p.programacion || {};
  return `<details><summary>Frecuencia y cuidados de uso</summary><label class="check"><input type="checkbox" name="solo_noche" ${s.solo_noche?'checked':''}>Solo de noche · avisarme si lo uso por la mañana</label><label>Frecuencia<select name="frecuencia">${[['diaria','Todos los días'],['semana','Días de la semana'],['intervalo','Cada X días']].map(([v,n])=>`<option value="${v}" ${(s.tipo||'diaria')===v?'selected':''}>${n}</option>`).join('')}</select></label><p>Días · solo para frecuencia semanal</p>${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((n,i)=>`<label class="check"><input type="checkbox" name="dias" value="${i}" ${s.dias?.includes(i)?'checked':''}>${n}</label>`).join('')}<label>Cada cuántos días<input type="number" name="cada" min="1" max="365" value="${Number(s.cada)||2}"></label><label>Fecha de referencia<input type="date" name="inicio_programa" value="${/^\d{4}-\d{2}-\d{2}$/.test(s.inicio||'')?s.inicio:date}"></label><p class="ayuda">Cada X días se cuenta desde esa fecha, no desde el último uso. Elegí la pauta indicada para tu producto.</p></details>`;
}
export function readSchedule(f) {
  const s={tipo:f.get('frecuencia'),dias:f.getAll('dias').map(Number),cada:Number(f.get('cada')),inicio:f.get('inicio_programa'),solo_noche:f.has('solo_noche')};
  if(s.tipo==='semana'&&!s.dias.length) throw Error('Elegí al menos un día de la semana.');
  if(s.tipo==='intervalo'&&(!s.inicio||!Number.isInteger(s.cada)||s.cada<1||s.cada>365)) throw Error('Indicá una fecha y un intervalo de 1 a 365 días.');
  return s;
}
