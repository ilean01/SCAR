import test from "node:test";
import assert from "node:assert/strict";
import { cycleObservations, productObservations, inventoryObservations } from "../js/analytics.js";

const symptom = {id:"granitos",nombre:"Granitos"};
const cycles = [
  {fechaInicio:"2026-07-07",fechaFin:"2026-07-11"},
  {fechaInicio:"2026-08-04",fechaFin:"2026-08-08"},
  {fechaInicio:"2026-09-01",fechaFin:"2026-09-05"},
];

test("el cruce piel-ciclo solo revela porcentajes desde n = 5", () => {
  const records = [18,19,20,21,22].map((d,i)=>({fecha:`2026-09-${d}`,estado_piel:3,zonas:i<3?[{zona_id:5,sintoma_id:"granitos"}]:[]}));
  const result = cycleObservations(records,cycles,[symptom],()=>"Mentón");
  assert.equal(result[0].count,3);
  assert.equal(result[0].n,5);
  assert.equal(result[0].visible,true);
});

test("compara ventanas equivalentes antes y después de probar un producto", () => {
  const records = [...[5,6,7,8,9].map(d=>({fecha:`2026-09-0${d}`,estado_piel:3})),...[10,11,12,13,14].map(d=>({fecha:`2026-09-${d}`,estado_piel:4,productosUsados:{mañana:["p1"],noche:[]}}))];
  const result = productObservations(records,[{id:"p1",nombre:"Sérum",fecha_inicio_prueba:"2026-09-10"}],[],"2026-09-19")[0];
  assert.equal(result.beforeMean,3);
  assert.equal(result.afterMean,4);
  assert.equal(result.enough,true);
});

test("calcula gasto, duración y costo por uso sin convertir monedas", () => {
  const records = [1,2,3,4].map(d=>({fecha:`2026-09-0${d}`,productosUsados:{mañana:["p1"],noche:[]}}));
  const packs=[{id:"e1",producto_id:"p1",fecha_compra:"2026-08-30",fecha_apertura:"2026-09-01",fecha_fin:"2026-09-04",precio:40000,moneda:"PYG",estado:"terminado"}];
  const result=inventoryObservations(records,[{id:"p1",nombre:"Crema"}],packs,"2026-09-16");
  assert.equal(result.spending.PYG,40000);
  assert.equal(result.details[0].days,4);
  assert.equal(result.details[0].costPerUse,10000);
});
