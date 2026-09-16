import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseRoutine,
  newRecord,
  cycleInfo,
  validateCycle,
  expiry,
  dayDiff,
} from "../js/core.js";
test("elegir una plantilla no registra productos como usados y conserva el plan histórico", () => {
  const r = newRecord("2026-09-15"),
    routine = { id: "r1", nombre: "Suave", productos: ["p1"] },
    products = [{ id: "p1", nombre: "Crema" }];
  const next = chooseRoutine(r, "noche", routine, products);
  assert.deepEqual(next.productosUsados.noche, []);
  routine.productos.push("p2");
  products[0].nombre = "Otro";
  assert.deepEqual(next.sesiones.noche.plan, [{ id: "p1", nombre: "Crema" }]);
});
test("el día 29 sigue contando y no se inventa una fase", () => {
  const c = [{ id: "c", fechaInicio: "2026-08-01", fechaFin: "2026-08-05" }];
  assert.match(cycleInfo(c, "2026-08-29").title, /Día 29/);
  assert.match(cycleInfo(c, "2026-08-29").title, /indeterminada/);
});
test("el inicio abierto se muestra como período y fechas previas no ven el futuro", () => {
  const c = [{ id: "c", fechaInicio: "2026-08-01", fechaFin: null }];
  assert.match(cycleInfo(c, "2026-08-01").title, /Período registrado/);
  assert.equal(cycleInfo(c, "2026-07-31").title, "Conocé tu ritmo");
});
test("rechaza ciclos solapados, invertidos y futuros", () => {
  assert.throws(() =>
    validateCycle(
      { id: "2", fechaInicio: "2026-08-04", fechaFin: null },
      [{ id: "1", fechaInicio: "2026-08-01", fechaFin: "2026-08-05" }],
      "2026-09-15",
    ),
  );
  assert.throws(() =>
    validateCycle(
      { fechaInicio: "2026-08-05", fechaFin: "2026-08-01" },
      [],
      "2026-09-15",
    ),
  );
  assert.throws(() =>
    validateCycle({ fechaInicio: "2026-09-16" }, [], "2026-09-15"),
  );
});
test("PAO respeta fin de mes y vence primero la fecha más temprana", () => {
  assert.equal(
    expiry({ fecha_apertura: "2026-01-31", meses_pao: 1 }),
    "2026-02-28",
  );
  assert.equal(
    expiry({
      fecha_apertura: "2026-01-31",
      meses_pao: 12,
      fecha_vencimiento: "2026-05-01",
    }),
    "2026-05-01",
  );
  assert.equal(dayDiff("2026-09-15", "2026-09-01"), 14);
});
