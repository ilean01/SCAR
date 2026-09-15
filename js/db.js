import { TABLES, newRecord } from "./core.js";
export function openDB(name = "scar-db") {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open(name, 2);
    q.onupgradeneeded = () => {
      for (const t of [...TABLES, "ajustes"])
        if (!q.result.objectStoreNames.contains(t))
          q.result.createObjectStore(t, {
            keyPath:
              t === "registros" ? "fecha" : t === "ajustes" ? "clave" : "id",
          });
    };
    q.onsuccess = () => {
      q.result.onversionchange = () => q.result.close();
      resolve(q.result);
    };
    q.onerror = () => reject(q.error);
    q.onblocked = () =>
      reject(Error("Cerrá otras pestañas de SCAR para actualizar."));
  });
}
export function all(db, t) {
  return new Promise((resolve, reject) => {
    const q = db.transaction(t).objectStore(t).getAll();
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
export function get(db, t, id) {
  return new Promise((resolve, reject) => {
    const q = db.transaction(t).objectStore(t).get(id);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
export function put(db, t, row, dirty = true) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(t, "readwrite"),
      data = structuredClone(row);
    if (dirty) {
      data.__dirty = crypto.randomUUID();
      delete data.__error;
    }
    tx.objectStore(t).put(data);
    tx.oncomplete = () => resolve(data);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("No se pudo guardar."));
  });
}
export function atomic(db, t, key, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(t, "readwrite"),
      s = tx.objectStore(t),
      q = s.get(key);
    let data;
    q.onsuccess = () => {
      data = fn(q.result);
      if (data) s.put(data);
    };
    tx.oncomplete = () => resolve(data);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function normalizeLegacy(db) {
  for (const r of await all(db, "registros")) {
    let changed = false;
    if (!r.id) {
      r.id = crypto.randomUUID();
      changed = true;
    }
    r.productosUsados ||= { mañana: [], noche: [] };
    r.rutinas ||= { mañana: null, noche: null };
    r.sesiones ||= {};
    r.intensidades ||= {};
    r.zonas ||= [];
    r.etiquetas_libres ||= [];
    r.fotos = (r.fotos || []).map((f) => {
      if (f instanceof Blob) {
        changed = true;
        return { id: crypto.randomUUID(), blob: f, angulo: "frente" };
      }
      return f;
    });
    if (changed) await put(db, "registros", r);
  }
}
export async function seed(db) {
  const setup = await get(db, "ajustes", "inicializado");
  if (setup) return;
  if (!(await all(db, "productos")).length) {
    for (const [nombre, categoria, momento] of [
      ["Limpiador facial", "Limpieza", "ambos"],
      ["Crema hidratante", "Hidratación", "ambos"],
      ["Protector solar", "Protección", "mañana"],
    ])
      await put(db, "productos", {
        id: crypto.randomUUID(),
        nombre,
        categoria,
        momento,
        activo: true,
        eliminado: false,
      });
  }
  if (!(await all(db, "sintomas")).length) {
    for (const nombre of [
      "Granitos",
      "Piel seca",
      "Piel grasa",
      "Rojez",
      "Sensibilidad",
      "Tirantez",
      "Cólicos",
      "Hinchazón",
    ])
      await put(db, "sintomas", {
        id: crypto.randomUUID(),
        nombre,
        tipo: ["Cólicos", "Hinchazón"].includes(nombre) ? "ciclo" : "piel",
        activo: true,
      });
  }
  await put(db, "ajustes", { clave: "inicializado", valor: true }, false);
}
export async function importLegacy(source, target) {
  const mapping = new Map();
  for (const t of TABLES) {
    for (const old of await all(source, t)) {
      const r = structuredClone(old);
      const stableKey = `importado:${t}:${old.id || old.fecha}`;
      const previous = await get(target, "ajustes", stableKey);
      const id = previous?.valor || crypto.randomUUID();
      mapping.set(old.id, id);
      if (previous) continue;
      r.id = id;
      delete r.__version;
      delete r.__conflict;
      delete r.__error;
      delete r.__remote;
      if (t === "rutinas")
        r.productos = (r.productos || []).map((x) => mapping.get(x) || x);
      if (t === "envases")
        r.producto_id = mapping.get(r.producto_id) || r.producto_id;
      if (t === "registros") {
        const exists = await get(target, t, r.fecha);
        if (exists) continue;
        for (const m of ["mañana", "noche"]) {
          r.productosUsados[m] = (r.productosUsados?.[m] || []).map(
            (x) => mapping.get(x) || x,
          );
          r.rutinas[m] = mapping.get(r.rutinas?.[m]) || null;
          if (r.sesiones?.[m])
            r.sesiones[m].plan = r.sesiones[m].plan.map((p) => ({
              ...p,
              id: mapping.get(p.id) || p.id,
            }));
        }
        r.sintomas = (r.sintomas || []).map((x) => mapping.get(x) || x);
        r.intensidades = Object.fromEntries(
          Object.entries(r.intensidades || {}).map(([k, v]) => [
            mapping.get(k) || k,
            v,
          ]),
        );
        r.zonas = (r.zonas || []).map((z) => ({
          ...z,
          sintoma_id: mapping.get(z.sintoma_id) || null,
        }));
        r.fotos = (r.fotos || []).map((f) => ({
          id: crypto.randomUUID(),
          blob: f.blob,
          angulo: f.angulo || "frente",
        }));
      }
      await put(target, t, r);
      await put(target, "ajustes", { clave: stableKey, valor: id }, false);
    }
  }
}
export async function readRecord(db, date) {
  return (await get(db, "registros", date)) || newRecord(date);
}
