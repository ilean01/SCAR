import { cycleInfo, dayDiff, addDays } from "./core.js";

const skinRecorded = r => r.estado_piel != null || r.sintomas?.length || r.zonas?.length;
const used = (r, id) => ["mañana", "noche"].some(m => r.productosUsados?.[m]?.includes(id)) || r.sesiones?.cuidados?.some(c => c.productos?.some(p => p.id === id));
const applications = (r, id) => ["mañana", "noche"].filter(m => r.productosUsados?.[m]?.includes(id)).length + (r.sesiones?.cuidados || []).filter(c => c.productos?.some(p => p.id === id)).length;
const mean = rows => rows.length ? rows.reduce((n, r) => n + r.estado_piel, 0) / rows.length : null;

export function phaseName(cycles, r) {
  const title = cycleInfo(cycles, r.fecha, r.sangrado).title;
  if (!title.startsWith("Día ")) return null;
  return title.split(" · ").slice(1).join(" · ") || null;
}

export function cycleObservations(records, cycles, symptoms, zoneName, minimum = 5) {
  const eligible = records.filter(r => !r.eliminado && skinRecorded(r)).map(r => ({...r, phase: phaseName(cycles, r)})).filter(r => r.phase);
  const groups = new Map();
  for (const r of eligible) for (const z of r.zonas || []) {
    if (!z.sintoma_id || z.intensidad === 0) continue;
    const key = `${z.zona_id}:${z.sintoma_id}:${r.phase}`;
    if (!groups.has(key)) groups.set(key, {zone: zoneName(z.zona_id), symptom: symptoms.find(s => s.id === z.sintoma_id)?.nombre || "Síntoma archivado", phase: r.phase, dates: new Set()});
    groups.get(key).dates.add(r.fecha);
  }
  return [...groups.values()].map(g => {
    const denominator = eligible.filter(r => r.phase === g.phase).length;
    return {...g, count: g.dates.size, n: denominator, visible: denominator >= minimum};
  }).filter(x => x.count).sort((a,b) => b.count / b.n - a.count / a.n);
}

export function productObservations(records, products, symptoms, today, minimum = 5) {
  return products.filter(p => !p.eliminado && p.fecha_inicio_prueba).map(p => {
    const end = p.fecha_fin_prueba && p.fecha_fin_prueba < today ? p.fecha_fin_prueba : today;
    const afterAll = records.filter(r => !r.eliminado && r.fecha >= p.fecha_inicio_prueba && r.fecha <= end && skinRecorded(r));
    const window = Math.max(1, dayDiff(end, p.fecha_inicio_prueba) + 1);
    const beforeStart = addDays(p.fecha_inicio_prueba, -window);
    const beforeAll = records.filter(r => !r.eliminado && r.fecha >= beforeStart && r.fecha < p.fecha_inicio_prueba && skinRecorded(r));
    const beforeSkin = beforeAll.filter(r => r.estado_piel != null), afterSkin = afterAll.filter(r => r.estado_piel != null);
    const symptomRows = symptoms.map(s => ({name:s.nombre,before:beforeAll.filter(r => r.sintomas?.includes(s.id) || r.zonas?.some(z => z.sintoma_id === s.id)).length,after:afterAll.filter(r => r.sintomas?.includes(s.id) || r.zonas?.some(z => z.sintoma_id === s.id)).length})).sort((a,b) => (b.before+b.after)-(a.before+a.after));
    return {product:p, before:beforeSkin, after:afterSkin, beforeN:beforeAll.length, afterN:afterAll.length, beforeMean:mean(beforeSkin), afterMean:mean(afterSkin), symptom:symptomRows[0], enough:beforeSkin.length >= minimum && afterSkin.length >= minimum, useDays:afterAll.filter(r => used(r,p.id)).length};
  });
}

export function inventoryObservations(records, products, packs, today) {
  const year = today.slice(0,4), spending = {};
  for (const e of packs.filter(e => !e.eliminado && e.fecha_compra?.startsWith(year) && e.precio != null)) spending[e.moneda || "PYG"] = (spending[e.moneda || "PYG"] || 0) + Number(e.precio);
  const details = packs.filter(e => !e.eliminado && e.fecha_apertura).map(e => {
    const p = products.find(p => p.id === e.producto_id), end = e.fecha_fin || (e.estado === "terminado" ? null : today);
    const days = end ? dayDiff(end,e.fecha_apertura)+1 : null;
    const overlapping = packs.some(other => other.id !== e.id && !other.eliminado && other.producto_id === e.producto_id && other.fecha_apertura && other.fecha_apertura <= (end || today) && (other.fecha_fin || today) >= e.fecha_apertura);
    const uses = end && !overlapping ? records.filter(r => !r.eliminado && r.fecha >= e.fecha_apertura && r.fecha <= end).reduce((n,r) => n + applications(r,e.producto_id), 0) : 0;
    return {pack:e, product:p, days, uses, costPerUse:e.precio != null && uses ? Number(e.precio)/uses : null};
  });
  for (const d of details.filter(x => !x.pack.fecha_fin && x.pack.estado !== "terminado")) {
    const history = details.filter(x => x.pack.producto_id === d.pack.producto_id && x.pack.fecha_fin && x.days > 0).map(x => x.days).sort((a,b)=>a-b);
    if (history.length) d.estimatedEnd = addDays(d.pack.fecha_apertura, history[Math.floor(history.length/2)]-1);
  }
  return {spending, details};
}
