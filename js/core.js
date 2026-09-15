export const TABLES = [
  "productos",
  "sintomas",
  "rutinas",
  "envases",
  "ciclos",
  "registros",
];
export const MOMENTS = ["mañana", "noche"];
export function dateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayDiff(a, b) {
  return Math.round(
    (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
}
export function addDays(d, n) {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function escapeHTML(v = "") {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function newRecord(fecha) {
  return {
    id: crypto.randomUUID(),
    fecha,
    productosUsados: { mañana: [], noche: [] },
    rutinas: { mañana: null, noche: null },
    sesiones: {},
    notas: "",
    fotos: [],
    sintomas: [],
    intensidades: {},
    zonas: [],
    etiquetas_libres: [],
    eliminado: false,
  };
}
export function chooseRoutine(record, moment, routine, products) {
  const r = structuredClone(record);
  r.rutinas[moment] = routine?.id || null;
  r.sesiones[moment] = {
    nombre: routine?.nombre || "A mi manera",
    plan: (routine?.productos || []).map((id) => ({
      id,
      nombre: products.find((p) => p.id === id)?.nombre || "Producto archivado",
    })),
    estado: "pendiente",
  };
  return r;
}
export function sessionLabel(r, m) {
  const s = r.sesiones?.[m],
    n = r.productosUsados?.[m]?.length || 0;
  if (s?.estado === "descanso") return "Hoy descansé";
  if (s?.estado === "terminada") return "Mi ritual, terminado";
  return n
    ? `${n} ${n === 1 ? "producto usado" : "productos usados"}`
    : "A tu ritmo";
}
export function cycleInfo(cycles, date, sangrado) {
  const list = cycles
    .filter((c) => !c.eliminado && c.fechaInicio <= date)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  const c = list.at(-1);
  if (!c)
    return {
      title: "Conocé tu ritmo",
      detail: "Registrá el inicio de tu período cuando quieras.",
    };
  const day = dayDiff(date, c.fechaInicio) + 1;
  const lengths = list
    .slice(-7)
    .slice(1)
    .map((x, i) => dayDiff(x.fechaInicio, list.slice(-7)[i].fechaInicio));
  const avg = lengths.length
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : null;
  let phase = "Fase indeterminada";
  if (
    ["leve", "moderado", "abundante"].includes(sangrado) ||
    (!sangrado &&
      ((c.fechaFin && date <= c.fechaFin) || date === c.fechaInicio))
  )
    phase = "Período registrado";
  else if (!c.fechaFin && !sangrado) phase = "Fin de período pendiente";
  else if (avg && day <= avg) {
    phase =
      day >= avg - 15 && day <= avg - 11
        ? "Ovulación estimada"
        : day > avg - 11
          ? "Lútea estimada"
          : "Folicular estimada";
  }
  return {
    title: `Día ${day} · ${phase}`,
    detail: avg
      ? `Próximo inicio orientativo: ${addDays(c.fechaInicio, avg)}. Basado en ${lengths.length} intervalo(s).`
      : "Todavía no hay historial suficiente para estimar el próximo inicio.",
    cycle: c,
  };
}
export function validateCycle(c, cycles, today = dateISO()) {
  if (
    !c.fechaInicio ||
    c.fechaInicio > today ||
    (c.fechaFin && c.fechaFin > today)
  )
    throw Error("Elegí fechas válidas, hasta hoy.");
  if (c.fechaFin && c.fechaFin < c.fechaInicio)
    throw Error("El fin no puede ser anterior al inicio.");
  if (
    !c.eliminado &&
    cycles.some(
      (x) =>
        x.id !== c.id &&
        !x.eliminado &&
        c.fechaInicio <= (x.fechaFin || "9999-12-31") &&
        x.fechaInicio <= (c.fechaFin || "9999-12-31"),
    )
  )
    throw Error(
      "Estas fechas se superponen con otro período. Revisá su fecha de fin.",
    );
}
export function expiry(e) {
  let pao = null;
  if (e.fecha_apertura && e.meses_pao) {
    const d = new Date(e.fecha_apertura + "T12:00:00Z"),
      day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + Number(e.meses_pao));
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    pao = d.toISOString().slice(0, 10);
  }
  return [pao, e.fecha_vencimiento].filter(Boolean).sort()[0] || null;
}
