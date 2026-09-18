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
    tx.onerror = (event) => reject(tx.error || event.target?.error || Error("No se pudo guardar."));
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
      try {
        data = fn(q.result);
        if (data) s.put(data);
      } catch (error) {
        reject(error || Error("No se pudo guardar."));
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(data);
    tx.onerror = (event) => reject(tx.error || event.target?.error || Error("No se pudo guardar."));
    tx.onabort = () => reject(tx.error || Error("Se interrumpió el guardado. Intentá de nuevo."));
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
// Repair imported/seeded aliases and their references in one local transaction.
// Only never-synced rows may be aliases; edits to existing cloud rows retain
// their identity and normal revision-conflict handling.
export function reconcileSymptoms(db, remote) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["sintomas", "registros", "ajustes"], "readwrite");
    const symptoms = tx.objectStore("sintomas");
    const query = symptoms.getAll();
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(tx.error || event.target?.error || Error("No se pudieron conciliar los síntomas."));
    tx.onabort = () => reject(tx.error || Error("Se interrumpió la conciliación de síntomas."));
    query.onsuccess = () => {
      try {
        const aliases = new Map();
        const byName = new Map(remote.map(row => [row.nombre, row]));
        const local = new Map(query.result.map(row => [row.id, row]));
        for (const row of query.result) {
          const canonical = byName.get(row.nombre);
          if (!canonical || canonical.id === row.id || row.__version || row.__conflict) continue;
          aliases.set(row.id, canonical.id);
          if (!local.get(canonical.id)?.__dirty)
            symptoms.put({ ...canonical, __version: canonical.revision });
          symptoms.delete(row.id);
        }
        if (!aliases.size) return;
        const records = tx.objectStore("registros").openCursor();
        records.onsuccess = () => {
          const cursor = records.result;
          if (!cursor) return;
          const row = cursor.value;
          const used = [...(row.sintomas || []), ...Object.keys(row.intensidades || {}), ...(row.zonas || []).map(z => z.sintoma_id)];
          if (used.some(id => aliases.has(id))) {
            row.sintomas = [...new Set((row.sintomas || []).map(id => aliases.get(id) || id))];
            const intensities = {};
            for (const [id, value] of Object.entries(row.intensidades || {})) {
              const canonical = aliases.get(id) || id;
              intensities[canonical] = Math.max(intensities[canonical] ?? 0, value);
            }
            row.intensidades = intensities;
            const zones = new Map();
            for (const zone of row.zonas || []) {
              const next = { ...zone, sintoma_id: aliases.get(zone.sintoma_id) || zone.sintoma_id };
              const key = JSON.stringify([next.zona_id, next.sintoma_id]);
              const previous = zones.get(key);
              if (previous) {
                next.intensidad = Math.max(previous.intensidad ?? 0, next.intensidad ?? 0) || null;
                next.notas = [...new Set([previous.notas, next.notas].filter(Boolean))].join("\n") || null;
              }
              zones.set(key, next);
            }
            row.zonas = [...zones.values()];
            row.__dirty = crypto.randomUUID();
            delete row.__error;
            cursor.update(row);
          }
          cursor.continue();
        };
        const settings = tx.objectStore("ajustes").openCursor();
        settings.onsuccess = () => {
          const cursor = settings.result;
          if (!cursor) return;
          const row = cursor.value;
          if (row.clave.startsWith("importado:sintomas:") && aliases.has(row.valor))
            cursor.update({ ...row, valor: aliases.get(row.valor) });
          cursor.continue();
        };
      } catch (error) {
        reject(error);
        tx.abort();
      }
    };
  });
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
            r.sesiones[m].plan = (r.sesiones[m].plan || []).map((p) => ({
              ...p,
              id: mapping.get(p.id) || p.id,
            }));
        }
        if (r.sesiones?.cuidados) r.sesiones.cuidados = r.sesiones.cuidados.map(c => ({
          ...c, rutina_id: mapping.get(c.rutina_id) || null,
          productos: (c.productos || []).map(p => ({...p, id: mapping.get(p.id) || p.id})),
        }));
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
