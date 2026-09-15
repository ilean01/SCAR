import {
  TABLES,
  MOMENTS,
  dateISO,
  addDays,
  dayDiff,
  escapeHTML as esc,
  newRecord,
  chooseRoutine,
  sessionLabel,
  cycleInfo,
  validateCycle,
  expiry,
} from "./js/core.js";
import {
  openDB,
  all,
  get,
  put,
  atomic,
  normalizeLegacy,
  seed,
  importLegacy,
  readRecord,
} from "./js/db.js";
import { Cloud } from "./js/cloud.js";
import { renderNote, stickers, photoGuide, renderCycleRing } from "./js/journal.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  cloud = new Cloud();
let db,
  guest,
  fecha = dateISO(),
  mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  view = "hoy",
  queue = Promise.resolve(),
  syncTimer,
  toastTimer,
  urls = [],
  renderToken = 0,
  accountId = null;
const paths = {
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20 14a8 8 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z",
  calendar:
    "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm2-2v4m10-4v4M4 10h16M8 14h1m6 0h1m-8 3h1m6 0h1",
  bottle: "M9 2h6v5H9zM8 7h8l2 3v11H6V10l2-3Zm-2 7h12M9 17h6",
  chart: "M4 3v17h17M8 14l4-5 4 3 5-7",
  heart: "M12 20S3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3",
  leaf: "M5 20C1 7 13 3 21 3c0 12-4 17-13 15M5 20 16 9",
  camera: "M8 5l2-2h4l2 2h5v15H3V5h5Zm8 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6",
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.heart}"/></svg>`;
}
function icons() {
  $$("[data-icon]").forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
}
function toast(msg) {
  clearTimeout(toastTimer);
  $("#toast").textContent = msg;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4200);
}
function status(s) {
  $("#syncStatus").textContent = s;
}
function action(fn) {
  queue = queue.then(fn).catch((e) => {
    console.error(e);
    toast(e.message || "No se pudo guardar. Intentá de nuevo.");
  });
  return queue;
}
function scheduleSync() {
  if (cloud.user) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync().catch(() => {}), 1500);
  } else status("Guardado en este dispositivo");
}
async function save(t, r) {
  const result = await put(db, t, r);
  scheduleSync();
  return result;
}
async function mutateDay(fn, render = true, date = fecha) {
  const r = await readRecord(db, date);
  fn(r);
  r.eliminado = false;
  await save("registros", r);
  if (render && date === fecha) await renderHoy();
}
async function sync() {
  if (!cloud.user) return;
  try {
    await cloud.sync(db, status);
    if (
      view === "ajustes" &&
      !$("#modal").open &&
      !document.activeElement.closest("form")
    )
      await renderSettings();
    else if (
      view === "hoy" &&
      !$("#modal").open &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    )
      await renderHoy();
  } catch (e) {
    console.warn("SCAR sync:", e.message);
  }
}
async function switchAccount() {
  clearTimeout(syncTimer);
  if (cloud.syncing) await cloud.syncing.catch(() => {});
  accountId = cloud.user?.id || null;
  db = accountId
    ? await openDB("scar-cloud:" + cloud.config.supabaseUrl + ":" + accountId)
    : guest;
  await normalizeLegacy(db);
  if (!accountId) await seed(db);
  $("#cloudBanner").hidden = !!accountId;
  status(
    accountId ? "Conectando con tu nube…" : "Guardado en este dispositivo",
  );
  if (accountId) {
    try {
      await cloud.pull(db);
      if (!(await get(db, "ajustes", "inicializado"))) await seed(db);
    } catch (e) {
      toast("Tus cambios locales siguen aquí. " + friendly(e));
    }
    await sync();
  }
  await renderCurrent();
}
function friendly(e) {
  if (e.status === 400 && /credentials/i.test(e.message))
    return "El correo o la contraseña no coinciden.";
  if (e.status === 429) return "Demasiados intentos. Esperá un momento.";
  if (
    e.code === "PGRST202" ||
    /scar_guardar|relation .*does not exist/i.test(e.message)
  )
    return "Falta ejecutar el SQL V4 de SCAR en Supabase.";
  return e.message;
}
async function renderHoy() {
  const token = ++renderToken;
  const [ps, rs, ss, r, cs] = await Promise.all([
    all(db, "productos"),
    all(db, "rutinas"),
    all(db, "sintomas"),
    readRecord(db, fecha),
    all(db, "ciclos"),
  ]);
  if (token !== renderToken) return;
  $("#fechaActual").value = fecha;
  $("#fechaActual").max = dateISO();
  for (const m of MOMENTS) {
    const suffix = m === "mañana" ? "Manana" : "Noche",
      sel = $("#rutina" + suffix),
      selected = r.rutinas?.[m],
      snapshot = r.sesiones?.[m];
    const choices = rs.filter(
      (x) =>
        !x.eliminado &&
        x.activa !== false &&
        (x.momento === m || x.momento === "cualquiera"),
    );
    sel.innerHTML =
      '<option value="">A mi manera · registro libre</option>' +
      choices
        .map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`)
        .join("");
    if (selected && !choices.some((x) => x.id === selected))
      sel.insertAdjacentHTML(
        "beforeend",
        `<option value="${esc(selected)}">${esc(snapshot?.nombre || "Rutina archivada")}</option>`,
      );
    sel.value = selected || "";
    const ids = [
      ...(snapshot?.plan || []).map((p) => p.id),
      ...(r.productosUsados?.[m] || []),
      ...ps
        .filter(
          (p) =>
            !p.eliminado &&
            p.activo !== false &&
            (p.momento === m || p.momento === "ambos"),
        )
        .map((p) => p.id),
    ];
    const list = [...new Set(ids)].map(
      (id) =>
        ps.find((p) => p.id === id) || {
          id,
          nombre:
            snapshot?.plan.find((x) => x.id === id)?.nombre ||
            "Producto archivado",
          eliminado: true,
        },
    );
    $("#productos" + suffix).innerHTML =
      list
        .map((p, i) => {
          const checked = r.productosUsados?.[m]?.includes(p.id);
          return `<label class="check ${checked ? "usado" : ""}"><input type="checkbox" data-prod="${esc(p.id)}" data-momento="${m}" ${checked ? "checked" : ""}><span><span class="prod-name">${esc(p.nombre)}</span><span class="prod-meta">${esc(p.marca || p.categoria || "Tu pequeño ritual")}${p.eliminado ? " · Archivado" : ""}</span></span><span class="step-number">${String(i + 1).padStart(2, "0")}</span></label>`;
        })
        .join("") || '<p class="ayuda">Agregá tus productos en Mi tocador.</p>';
    $("#estado" + suffix).textContent = sessionLabel(r, m);
    $(`[data-finish="${m}"]`).textContent =
      r.sesiones?.[m]?.estado === "terminada" ? "Reabrir" : "Terminé";
  }
  const moods = ["Sensible", "Incómoda", "Normal", "Bien", "Radiante"];
  $("#mood").innerHTML = moods
    .map(
      (name, i) =>
        `<button class="mood ${r.estado_piel === i + 1 ? "activo" : ""}" data-mood="${i + 1}" aria-pressed="${r.estado_piel === i + 1}" aria-label="${i + 1} de 5, ${name}"><svg class="icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M11 12h.1M21 12h.1M10 ${i < 2 ? 23 : 20}Q16 ${i < 2 ? 16 : i === 2 ? 20 : 27} 22 ${i < 2 ? 23 : 20}"/></svg><small>${name}</small></button>`,
    )
    .join("");
  $("#sintomasHoy").innerHTML = ss
    .filter((s) => !s.eliminado && s.activo !== false)
    .map(
      (s) =>
        `<button class="chip ${r.sintomas?.includes(s.id) ? "activo" : ""}" data-sintoma="${esc(s.id)}" aria-pressed="${!!r.sintomas?.includes(s.id)}">${esc(s.nombre)}</button>`,
    )
    .join("");
  $("#intensidades").innerHTML = (r.sintomas || [])
    .map(
      (id) =>
        `<label>${esc(ss.find((s) => s.id === id)?.nombre || "Síntoma")}<select data-intensity="${esc(id)}" aria-label="Intensidad de ${esc(ss.find((s) => s.id === id)?.nombre)}">${["Ausente", "Leve", "Moderado", "Fuerte"].map((n, i) => `<option value="${i}" ${(r.intensidades?.[id] ?? 1) === i ? "selected" : ""}>${n}</option>`).join("")}</select></label>`,
    )
    .join("");
  $("#zonasHoy").innerHTML = (r.zonas || [])
    .map(
      (z, i) =>
        `<div class="item item-top"><span>${esc(zoneName(z.zona_id))}${z.notas ? " · " + esc(z.notas) : ""}</span><button class="texto" data-delete-zone="${i}" aria-label="Quitar anotación de ${esc(zoneName(z.zona_id))}">Quitar</button></div>`,
    )
    .join("");
  for (const el of $$("[data-daily]")) {
    if (document.activeElement !== el) el.value = r[el.dataset.daily] ?? "";
  }
  if (document.activeElement !== $("#etiquetasHoy"))
    $("#etiquetasHoy").value = (r.etiquetas_libres || []).join(", ");
  $("#habitos").innerHTML = Object.entries({
    uso_protector: "Protector solar",
    ejercicio: "Movimiento",
    maquillaje: "Maquillaje",
    alcohol: "Alcohol",
    viaje: "Viaje",
    mucho_calor: "Mucho calor",
    exposicion_sol: "Sol",
  })
    .map(
      ([k, n]) =>
        `<button class="chip ${r[k] === true ? "activo" : ""}" data-habit="${k}" aria-label="${n}: ${r[k] === true ? "sí" : r[k] === false ? "no" : "sin registrar"}">${r[k] === true ? "✓ " : r[k] === false ? "− " : ""}${n}</button>`,
    )
    .join("");
  const info = cycleInfo(cs, fecha, r.sangrado);
  renderCycleRing(info, fecha);
  renderNote();
  $("#faseHoy").textContent = info.title;
  $("#prediccionCiclo").textContent = info.detail;
  const open = cs.find((c) => !c.eliminado && !c.fechaFin);
  $("#botonPeriodo").textContent = open
    ? "Terminó mi período"
    : "Empezó mi período";
  await renderPhotos(r, token);
}
const zoneNames = [
  "Frente",
  "Nariz",
  "Mejilla izquierda",
  "Mejilla derecha",
  "Mentón",
  "Mandíbula",
  "Cuello",
];
const zoneName = (id) => zoneNames[id - 1] || "Zona";
async function renderPhotos(r, token) {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $("#contadorFotos").textContent = `${r.fotos?.length || 0}/3`;
  $("#fotosHoy").innerHTML = (r.fotos || [])
    .map(
      (f, i) =>
        `<div class="foto"><img data-photo-id="${esc(f.id)}" alt="Piel del ${esc(r.fecha)}, ${esc(f.angulo || "sin ángulo")}"><span class="photo-angle">${esc(f.angulo || "Sin ángulo")}</span><button data-delete-photo="${esc(f.id)}" aria-label="Borrar foto ${i + 1}">×</button></div>`,
    )
    .join("");
  for (const f of r.fotos || []) {
    try {
      let url;
      if (f.blob) {
        url = URL.createObjectURL(f.blob);
        urls.push(url);
      } else if (cloud.user && navigator.onLine)
        url = await cloud.photoURL(f.storage_path);
      if (token !== renderToken) return;
      const img = $(`[data-photo-id="${f.id}"]`);
      if (img && url) img.src = url;
      else if (img) img.alt = "Foto en la nube · conectate para verla";
    } catch {
      const img = $(`[data-photo-id="${f.id}"]`);
      if (img) img.alt = "No se pudo cargar la foto";
    }
  }
}
async function compress(file) {
  if (!file.type.startsWith("image/")) throw Error("Elegí una imagen.");
  if (file.size > 30 * 1024 * 1024)
    throw Error("La imagen supera 30 MB. Elegí una más pequeña.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("No se pudo procesar la foto."))),
        "image/jpeg",
        0.82,
      ),
    );
  } catch {
    throw Error("No se pudo abrir esta imagen. Probá con una foto JPG o PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function renderProducts() {
  const [ps, rs, envases] = await Promise.all([
    all(db, "productos"),
    all(db, "rutinas"),
    all(db, "envases"),
  ]);
  const search = $("#buscarProducto").value.toLocaleLowerCase();
  $("#listaProductos").innerHTML =
    ps
      .filter(
        (p) =>
          !p.eliminado &&
          `${p.nombre} ${p.marca || ""}`.toLocaleLowerCase().includes(search),
      )
      .map((p) => {
        const packs = envases.filter(
            (e) => !e.eliminado && e.producto_id === p.id,
          ),
          current = packs.find((e) => e.estado !== "terminado");
        return `<article class="product"><div class="product-art">${icon("bottle")}</div><span class="eyebrow">${esc(p.marca || p.categoria || "MI COLECCIÓN")}</span><h3>${esc(p.nombre)}</h3><p>${esc(p.momento)}${p.favorito ? " · ♡ Favorito" : ""}${p.activo === false ? " · En pausa" : ""}</p>${current ? `<span class="pill">${esc(current.estado)}${expiry(current) ? " · " + esc(expiry(current)) : ""}</span>` : '<span class="pill">Sin envase registrado</span>'}<div class="product-actions"><button class="texto" data-edit-product="${esc(p.id)}">Editar producto</button><button class="texto" data-packs="${esc(p.id)}">Envases (${packs.length})</button></div></article>`;
      })
      .join("") ||
    '<div class="empty">Tu tocador está listo para tus favoritos.<br>Agregá un producto para empezar.</div>';
  $("#listaRutinas").innerHTML =
    rs
      .filter((r) => !r.eliminado)
      .map(
        (r) =>
          `<article class="product"><span class="eyebrow">${esc(r.momento)}</span><h3>${esc(r.nombre)}</h3><p>${r.productos?.length || 0} pasos · ${esc(r.descripcion || "Tu ritual, a tu manera")}</p><button class="texto" data-edit-routine="${esc(r.id)}">Editar rutina ↗</button></article>`,
      )
      .join("") ||
    '<div class="empty">Una rutina rápida, una noche de mimo…<br>Creá las que se adapten a vos.</div>';
}
function modal(title, content, kind, id = "") {
  const form = $("#formModal");
  form.dataset.kind = kind;
  form.dataset.id = id;
  $("#modalContenido").innerHTML =
    `<h2 id="modalTitle">${esc(title)}</h2>${content}`;
  $("#modalError").textContent = "";
  if (!$("#modal").open) $("#modal").showModal();
  icons();
}
const field = (label, name, value = "", type = "text", attrs = "") =>
  `<label class="campo-label" for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}>`;
const select = (label, name, choices, value) =>
  `<label class="campo-label" for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${choices
    .map((c) => {
      const [v, n] = Array.isArray(c) ? c : [c, c];
      return `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(n)}</option>`;
    })
    .join("")}</select>`;
const submit = (text = "Guardar") =>
  `<div class="form-actions"><button class="boton" type="submit">${text}</button></div>`;
async function productModal(id) {
  const p = id ? await get(db, "productos", id) : {};
  modal(
    id ? "Tu producto" : "Algo nuevo para tu tocador",
    field(
      "Nombre",
      "nombre",
      p.nombre || "",
      "text",
      'required maxlength="180"',
    ) +
      field("Marca", "marca", p.marca || "") +
      field("Categoría", "categoria", p.categoria || "") +
      select(
        "Momento",
        "momento",
        ["ambos", "mañana", "noche"],
        p.momento || "ambos",
      ) +
      `<label class="check"><input type="checkbox" name="activo" ${p.activo !== false ? "checked" : ""}>En uso</label><label class="check"><input type="checkbox" name="favorito" ${p.favorito ? "checked" : ""}>Es uno de mis favoritos</label>` +
      select(
        "Mi valoración",
        "puntaje",
        [
          ["", "Sin valorar"],
          ["1", "1 estrella"],
          ["2", "2 estrellas"],
          ["3", "3 estrellas"],
          ["4", "4 estrellas"],
          ["5", "5 estrellas"],
        ],
        String(p.puntaje || ""),
      ) +
      select(
        "¿Lo volvería a comprar?",
        "recompraria",
        [
          ["", "Todavía no sé"],
          ["true", "Sí"],
          ["false", "No"],
        ],
        p.recompraria == null ? "" : String(p.recompraria),
      ) +
      field("Notas", "notas", p.notas || "") +
      submit() +
      (id
        ? `<button class="boton danger" type="button" data-archive-product="${esc(id)}">Archivar producto</button>`
        : ""),
    "producto",
    id,
  );
}
async function routineModal(id, momento = "cualquiera") {
  const ps = (await all(db, "productos")).filter((p) => !p.eliminado),
    r = id ? await get(db, "rutinas", id) : { productos: [], momento };
  const sorted = [
    ...(r.productos || [])
      .map((id) => ps.find((p) => p.id === id))
      .filter(Boolean),
    ...ps.filter((p) => !r.productos?.includes(p.id)),
  ];
  modal(
    id ? "Tu ritual" : "Un ritual a tu manera",
    field(
      "Nombre",
      "nombre",
      r.nombre || "",
      "text",
      'required maxlength="180"',
    ) +
      select(
        "Momento",
        "momento",
        ["cualquiera", "mañana", "noche"],
        r.momento,
      ) +
      field("Una pequeña descripción", "descripcion", r.descripcion || "") +
      '<p class="ayuda">Elegí los pasos y ordenalos. Esta plantilla no cambiará los días que ya registraste.</p><div class="modal-list">' +
      sorted
        .map(
          (p) =>
            `<div class="check"><input id="rp-${esc(p.id)}" type="checkbox" name="productos" value="${esc(p.id)}" ${r.productos?.includes(p.id) ? "checked" : ""}><label for="rp-${esc(p.id)}">${esc(p.nombre)}</label><span class="order"><button type="button" data-order="-1" aria-label="Subir ${esc(p.nombre)}">↑</button><button type="button" data-order="1" aria-label="Bajar ${esc(p.nombre)}">↓</button></span></div>`,
        )
        .join("") +
      "</div>" +
      submit("Guardar rutina") +
      (id
        ? `<button class="boton danger" type="button" data-archive-routine="${esc(id)}">Archivar rutina</button>`
        : ""),
    "rutina",
    id,
  );
}
async function packList(id) {
  const ps = await get(db, "productos", id),
    packs = (await all(db, "envases")).filter(
      (e) => e.producto_id === id && !e.eliminado,
    );
  modal(
    "Envases · " + ps.nombre,
    `<p class="ayuda">Cada compra conserva sus propias fechas.</p>${packs.map((e) => `<div class="item item-top"><div><strong>${esc(e.estado)}</strong><p>Abierto: ${esc(e.fecha_apertura || "Sin registrar")}<br>Vencimiento: ${esc(expiry(e) || "Sin registrar")}</p></div><button class="texto" type="button" data-edit-pack="${esc(e.id)}">Editar</button></div>`).join("")}<button class="boton" type="button" data-new-pack="${esc(id)}">+ Registrar otro envase</button>`,
    "list",
  );
}
async function packModal(productId, id) {
  const e = id ? await get(db, "envases", id) : { producto_id: productId };
  modal(
    id ? "Editar envase" : "Un nuevo envase",
    `<input type="hidden" name="producto_id" value="${esc(e.producto_id)}"><div class="form-row"><div>${field("Compra", "fecha_compra", e.fecha_compra || "", "date")}</div><div>${field("Apertura", "fecha_apertura", e.fecha_apertura || "", "date")}</div></div>` +
      field(
        "Vencimiento impreso",
        "fecha_vencimiento",
        e.fecha_vencimiento || "",
        "date",
      ) +
      field(
        "PAO · meses desde apertura",
        "meses_pao",
        e.meses_pao || "",
        "number",
        'min="1" max="120"',
      ) +
      `<div class="form-row"><div>${field("Precio", "precio", e.precio ?? "", "number", 'min="0" step="0.01"')}</div><div>${select("Moneda", "moneda", ["PYG", "USD", "BRL", "ARS"], e.moneda || "PYG")}</div></div>` +
      select(
        "Estado",
        "estado",
        ["nuevo", "en uso", "casi terminado", "terminado"],
        e.estado || "nuevo",
      ) +
      submit() +
      (id
        ? `<button class="boton danger" type="button" data-archive-pack="${esc(id)}">Archivar envase</button>`
        : ""),
    "envase",
    id,
  );
}
async function cycleList() {
  const cs = (await all(db, "ciclos"))
    .filter((c) => !c.eliminado)
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  modal(
    "Mis períodos",
    cs
      .map(
        (c) =>
          `<div class="item item-top"><div><strong>${esc(c.fechaInicio)}</strong><p>Hasta ${esc(c.fechaFin || "fin pendiente")}</p></div><button class="texto" type="button" data-edit-cycle="${esc(c.id)}">Editar</button></div>`,
      )
      .join("") +
      '<button class="boton" type="button" id="newCycle">+ Agregar un período</button>',
    "list",
  );
}
async function cycleModal(id) {
  const c = id ? await get(db, "ciclos", id) : {};
  modal(
    id ? "Editar período" : "Registrar período",
    field(
      "Fecha de inicio",
      "fechaInicio",
      c.fechaInicio || fecha,
      "date",
      `required max="${dateISO()}"`,
    ) +
      field(
        "Fecha de fin · opcional",
        "fechaFin",
        c.fechaFin || "",
        "date",
        `max="${dateISO()}"`,
      ) +
      field("Notas", "notas", c.notas || "") +
      submit() +
      (id
        ? `<button class="boton danger" type="button" data-archive-cycle="${esc(id)}">Eliminar este período</button>`
        : ""),
    "ciclo",
    id,
  );
}
async function zoneModal() {
  const ss = (await all(db, "sintomas")).filter((s) => !s.eliminado);
  modal(
    "Una zona de tu piel",
    select(
      "Zona",
      "zona_id",
      zoneNames.map((n, i) => [String(i + 1), n]),
      "1",
    ) +
      select(
        "Síntoma · opcional",
        "sintoma_id",
        [["", "Solo una anotación"], ...ss.map((s) => [s.id, s.nombre])],
        "",
      ) +
      select(
        "Intensidad",
        "intensidad",
        [
          ["", "Sin registrar"],
          ["0", "Ausente"],
          ["1", "Leve"],
          ["2", "Moderada"],
          ["3", "Fuerte"],
        ],
        "",
      ) +
      field("¿Qué notaste?", "notas", "") +
      submit(),
    "zona",
  );
}
async function saveForm(e) {
  e.preventDefault();
  const form = e.target,
    kind = form.dataset.kind,
    id = form.dataset.id,
    f = new FormData(form),
    button = e.submitter;
  $("#modalError").textContent = "";
  if (button) button.disabled = true;
  try {
    let t, r;
    if (kind === "producto") {
      t = "productos";
      r = {
        ...(id ? await get(db, t, id) : {}),
        id: id || crypto.randomUUID(),
        nombre: String(f.get("nombre")).trim(),
        marca: String(f.get("marca")).trim(),
        categoria: String(f.get("categoria")).trim(),
        momento: f.get("momento"),
        activo: f.has("activo"),
        favorito: f.has("favorito"),
        puntaje: f.get("puntaje") ? Number(f.get("puntaje")) : null,
        recompraria: f.get("recompraria")
          ? f.get("recompraria") === "true"
          : null,
        notas: f.get("notas"),
        eliminado: false,
      };
      if (!r.nombre) throw Error("El producto necesita un nombre.");
    }
    if (kind === "rutina") {
      t = "rutinas";
      r = {
        ...(id ? await get(db, t, id) : {}),
        id: id || crypto.randomUUID(),
        nombre: String(f.get("nombre")).trim(),
        momento: f.get("momento"),
        descripcion: f.get("descripcion"),
        productos: f.getAll("productos"),
        activa: true,
        eliminado: false,
      };
      if (!r.nombre) throw Error("Tu rutina necesita un nombre.");
    }
    if (kind === "envase") {
      t = "envases";
      r = {
        ...(id ? await get(db, t, id) : {}),
        id: id || crypto.randomUUID(),
        producto_id: f.get("producto_id"),
        fecha_compra: f.get("fecha_compra") || null,
        fecha_apertura: f.get("fecha_apertura") || null,
        fecha_vencimiento: f.get("fecha_vencimiento") || null,
        meses_pao: f.get("meses_pao") ? Number(f.get("meses_pao")) : null,
        precio: f.get("precio") !== "" ? Number(f.get("precio")) : null,
        moneda: f.get("moneda"),
        estado: f.get("estado"),
        eliminado: false,
      };
      if (
        r.fecha_compra &&
        r.fecha_apertura &&
        r.fecha_apertura < r.fecha_compra
      )
        throw Error("La apertura no puede ser anterior a la compra.");
    }
    if (kind === "ciclo") {
      t = "ciclos";
      r = {
        ...(id ? await get(db, t, id) : {}),
        id: id || crypto.randomUUID(),
        fechaInicio: f.get("fechaInicio"),
        fechaFin: f.get("fechaFin") || null,
        notas: f.get("notas"),
        eliminado: false,
      };
      validateCycle(r, await all(db, t));
    }
    if (kind === "sintoma") {
      t = "sintomas";
      const nombre = String(f.get("nombre")).trim();
      if (!nombre) throw Error("Escribí un nombre.");
      if (
        (await all(db, t)).some(
          (s) => s.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase(),
        )
      )
        throw Error("Ya tenés un síntoma con ese nombre.");
      r = {
        id: crypto.randomUUID(),
        nombre,
        tipo: f.get("tipo"),
        activo: true,
      };
    }
    if (kind === "zona") {
      const z = {
        zona_id: Number(f.get("zona_id")),
        sintoma_id: f.get("sintoma_id") || null,
        intensidad:
          f.get("intensidad") !== "" ? Number(f.get("intensidad")) : null,
        notas: f.get("notas"),
      };
      await mutateDay((r) => {
        r.zonas ||= [];
        const i = r.zonas.findIndex(
          (x) => x.zona_id === z.zona_id && x.sintoma_id === z.sintoma_id,
        );
        if (i >= 0) r.zonas[i] = z;
        else r.zonas.push(z);
      }, false);
    }
    if (kind === "photo") {
      const r = await readRecord(db, fecha);
      if (r.fotos.length >= 3) throw Error("Ya tenés 3 fotos para este día.");
      const pending = photoDraft;
      if (!pending) throw Error("Volvé a elegir la foto.");
      r.fotos.push({ ...pending, angulo: f.get("angulo") });
      await save("registros", r);
      photoDraft = null;
    }
    if (kind === "password") {
      await cloud.password(f.get("password"));
      toast("Contraseña actualizada.");
    }
    if (t) await save(t, r);
    $("#modal").close();
    await renderCurrent();
    toast(
      cloud.user ? "Guardado · sincronizando" : "Guardado en este dispositivo",
    );
  } catch (err) {
    $("#modalError").textContent = friendly(err);
  } finally {
    if (button) button.disabled = false;
  }
}
async function archive(t, id) {
  const r = await get(db, t, id);
  if (!r) return;
  await save(t, { ...r, eliminado: true });
  $("#modal").close();
  await renderCurrent();
  toast("Archivado. Tu historial se conserva.");
}
async function renderCalendar() {
  const [regs, cycles] = await Promise.all([
      all(db, "registros"),
      all(db, "ciclos"),
    ]),
    y = mes.getFullYear(),
    m = mes.getMonth(),
    first = new Date(y, m, 1),
    days = new Date(y, m + 1, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  let html = `<div class="cal-head"><button class="icon-button" data-month="-1" aria-label="Mes anterior">‹</button><h2>${first.toLocaleDateString("es", { month: "long", year: "numeric" })}</h2><button class="icon-button" data-month="1" aria-label="Mes siguiente">›</button></div><div class="cal-grid">${["L", "M", "X", "J", "V", "S", "D"].map((n) => `<div class="cal-semana">${n}</div>`).join("")}${"<div></div>".repeat(offset)}`;
  for (let d = 1; d <= days; d++) {
    const date = dateISO(new Date(y, m, d)),
      reg = regs.find((r) => r.fecha === date && !r.eliminado),
      period =
        cycles.some(
          (c) =>
            !c.eliminado &&
            date >= c.fechaInicio &&
            date <= (c.fechaFin || c.fechaInicio),
        ) || ["leve", "moderado", "abundante"].includes(reg?.sangrado);
    html += `<button class="cal-dia ${reg ? "con-registro" : ""} ${period ? "periodo-dia" : ""} ${date === dateISO() ? "today" : ""}" data-date="${date}" ${date > dateISO() ? "disabled" : ""} aria-label="${date}${reg ? ", con registro" : ""}${period ? ", período registrado" : ""}">${d}</button>`;
  }
  $("#calendario").innerHTML =
    html +
    '</div><p class="ayuda">• Día con registro &nbsp; · &nbsp; Rosa: período registrado. Los días sin datos quedan vacíos.</p>';
}
async function renderEvolution() {
  const regs = (await all(db, "registros"))
      .filter((r) => !r.eliminado)
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    ps = await all(db, "productos"),
    withUse = regs.filter((r) =>
      MOMENTS.some((m) => r.productosUsados?.[m]?.length),
    ),
    skin = regs.filter((r) => r.estado_piel),
    mean = skin.length
      ? (skin.reduce((s, r) => s + r.estado_piel, 0) / skin.length).toFixed(1)
      : "—";
  let html = `<div class="stats"><div class="stat"><strong>${regs.length}</strong><span>días con recuerdos</span></div><div class="stat"><strong>${mean}</strong><span>estado medio de piel / 5</span></div><div class="stat"><strong>${regs.reduce((n, r) => n + (r.fotos?.length || 0), 0)}</strong><span>fotos en tu diario</span></div></div><article class="tarjeta" style="margin-top:22px"><h2>Así se sintió tu piel</h2>`;
  if (skin.length) {
    const last = skin.slice(-30),
      span = Math.max(1, dayDiff(last.at(-1).fecha, last[0].fecha)),
      points = last.map((r) => [
        35 + (dayDiff(r.fecha, last[0].fecha) / span) * 630,
        160 - (r.estado_piel - 1) * 33,
      ]);
    html += `<svg class="trend" viewBox="0 0 700 190" role="img" aria-label="Estado de la piel, escala del 1 al 5. Solo días registrados.">${[1, 2, 3, 4, 5].map((n) => `<text x="10" y="${165 - (n - 1) * 33}" fill="#806e74" font-size="11">${n}</text><path d="M30 ${160 - (n - 1) * 33}H680" stroke="#eee0e4"/>`).join("")}${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#a56880"><title>${last[i].fecha}: ${last[i].estado_piel}/5</title></circle>`).join("")}</svg><p class="ayuda">${last[0].fecha} — ${last.at(-1).fecha}. Cada punto es un registro; los días faltantes no se rellenan.</p>`;
  } else
    html +=
      '<p class="ayuda">Cuando registres cómo está tu piel, tus puntos aparecerán aquí.</p>';
  html +=
    '</article><article class="tarjeta"><h2>Lo que te acompañó</h2><p class="ayuda">Porcentaje de días con productos registrados. No mide una obligación diaria.</p>' +
    ps
      .map((p) => {
        const count = withUse.filter((r) =>
          MOMENTS.some((m) => r.productosUsados?.[m]?.includes(p.id)),
        ).length;
        if (!count && p.eliminado) return "";
        const pct = withUse.length
          ? Math.round((count / withUse.length) * 100)
          : 0;
        return `<div class="item"><div class="item-top"><span>${esc(p.nombre)}</span><span>${pct}% · ${count} días</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
      })
      .join("") +
    "</article>";
  $("#evolucion").innerHTML = html;
}
async function renderSettings() {
  const rows = (
      await Promise.all(
        TABLES.map(async (t) =>
          (await all(db, t)).map((r) => ({ ...r, __table: t })),
        ),
      )
    ).flat(),
    pending = rows.filter((r) => r.__dirty),
    conflicts = pending.filter((r) => r.__conflict),
    errors = pending.filter((r) => r.__error);
  let auth = cloud.user
    ? `<h2>Tu diario, con vos.</h2><p>${esc(cloud.user.email)}</p><div class="status-box">${pending.length ? `${pending.length} cambio(s) pendientes` : "Tus datos están sincronizados."}</div><div class="form-actions"><button class="boton auto" id="syncNow">Sincronizar ahora</button><button class="texto" id="logout">Cerrar sesión</button></div><button class="texto" id="importLocal">Importar datos de este dispositivo</button><p class="fineprint">La importación conserva los originales. Si una fecha ya existe en tu cuenta, la mantiene sin reemplazarla.</p>`
    : `<h2>Tu diario, donde estés.</h2><p>Tu cuenta de SCAR es distinta de la cuenta con la que administrás Supabase. Completá tu correo y una contraseña de al menos 8 caracteres; después tocá <strong>Crear mi cuenta</strong>. Si ya tenés una, tocá <strong>Entrar a mi diario</strong>.</p><form id="authForm">${field("Tu nombre · al crear cuenta", "nombre", "", "text", 'autocomplete="given-name"') + field("Correo electrónico", "email", "", "email", 'required autocomplete="email"') + field("Contraseña", "password", "", "password", 'required minlength="8" autocomplete="current-password"')}<div class="form-actions"><button class="boton" type="submit" name="mode" value="login" ${!cloud.configured ? "disabled" : ""}>Entrar a mi diario</button><button class="boton secundario" type="submit" name="mode" value="signup" ${!cloud.configured ? "disabled" : ""}>Crear mi cuenta</button></div><button class="texto" type="button" id="recover">Olvidé mi contraseña</button><p id="authMessage" class="form-error" role="status"></p></form>${!cloud.configured ? '<p class="ayuda">Primero seguí los pasos de activación y guardá la conexión de Supabase de abajo.</p>' : ""}`;
  $("#ajustes").innerHTML =
    `${setupGuide()}<div class="settings-grid"><article class="tarjeta">${auth}</article><article class="tarjeta"><span class="eyebrow">TUS RECUERDOS</span><h2>Una copia para vos</h2><p>Exportá tus registros y fotos. Las fotos que están en la nube necesitan conexión para descargarse.</p><button class="boton secundario" id="exportar">Descargar copia JSON</button><p class="fineprint">El archivo contiene tus datos personales. Guardalo donde solo vos tengas acceso.</p><h2 style="margin-top:26px">Siempre a mano</h2><p>En Safari de tu iPhone: Compartir → Agregar a inicio. Abrí SCAR una vez con internet para preparar el acceso sin conexión.</p><button class="texto" id="persistir">Conservar el guardado en este dispositivo</button></article>${conflicts.length ? `<article class="tarjeta wide"><h2>Cambios para revisar</h2><p>Este dato cambió en otro dispositivo. Elegí qué versión conservar. Podés descargar una copia antes de decidir.</p>${conflicts.map((r) => `<div class="conflict"><strong>${esc(r.nombre || r.fecha || r.fechaInicio || "Registro")} · ${esc(r.__table)}</strong><details><summary>Ver ambas versiones</summary><p>Este dispositivo</p><pre>${esc(JSON.stringify(clean(r), null, 2))}</pre><p>La nube</p><pre>${esc(JSON.stringify(clean(r.__remote || {}), null, 2))}</pre></details><div class="form-actions"><button class="boton auto" data-resolve="local" data-table="${r.__table}" data-key="${esc(r.fecha || r.id)}">Conservar la de aquí</button><button class="boton secundario auto" data-resolve="remote" data-table="${r.__table}" data-key="${esc(r.fecha || r.id)}">Usar la de la nube</button></div></div>`).join("")}</article>` : ""}${errors.length ? `<article class="tarjeta wide"><h2>Pendiente de guardar en la nube</h2>${errors.map((r) => `<p>${esc(r.nombre || r.fecha || r.fechaInicio || r.__table)}: ${esc(friendly({ message: r.__error }))}</p>`).join("")}<p>Los cambios siguen guardados en este dispositivo.</p></article>` : ""}<article class="tarjeta wide" id="connectionSettings"><details ${!cloud.configured ? "open" : ""}><summary>Conexión de Supabase</summary><p>Una sola vez: usá la URL del proyecto y su clave pública publishable o anon.</p><form id="configForm"><div class="form-row"><div>${field("Project URL", "url", cloud.config.supabaseUrl || "", "url", 'required placeholder="https://tu-proyecto.supabase.co"')}</div><div>${field("Publishable key", "key", cloud.config.supabasePublishableKey || "", "text", 'required placeholder="sb_publishable_…"')}</div></div><p class="fineprint">No uses service_role ni una clave secret. Si cambiás de proyecto, primero cerrá sesión.</p><button class="boton secundario auto" type="submit" ${cloud.user ? "disabled" : ""}>Guardar conexión</button><p id="configMessage" class="form-error" role="alert"></p></form></details></article></div>`;
}
function setupGuide() {
  if (cloud.user) return "";
  return `<article class="tarjeta setup-guide"><span class="eyebrow">BIENVENIDA A TU PEQUEÑO ESPACIO</span><h2>Tu diario, paso a paso</h2><p>${cloud.configured ? "Conexión guardada en este navegador. Falta entrar y comprobar el guardado." : "Podés usar tu diario aquí. Para llevarlo a otros dispositivos, activá tu nube."}</p><ol class="setup-steps"><li><strong>Prepará la base una sola vez</strong><p>En Supabase → SQL Editor, ejecutá <a href="./supabase/instalar_scar.sql" target="_blank" rel="noopener">instalar_scar.sql</a> si la base está vacía, o <a href="./supabase/migrar_v3_a_v4.sql" target="_blank" rel="noopener">migrar_v3_a_v4.sql</a> si tenés exactamente V3. Si ya instalaste V4, este paso está hecho. No ejecutes ambos.</p></li><li><strong>Activá el acceso por correo</strong><p>En Authentication, habilitá Email y las nuevas altas. En URL Configuration, colocá <code>https://ilean01.github.io/SCAR/</code> como Site URL y Redirect URL.</p></li><li><strong>${cloud.configured ? "Conexión guardada" : "Conectá SCAR"}</strong><p>Copiá la Project URL y la clave pública publishable o anon de tu proyecto. Pegalas en <a href="#connectionSettings">Conexión de Supabase</a>, abajo. Guardar estos valores todavía no verifica la base.</p></li><li><strong>Creá tu cuenta y confirmá tu correo</strong><p>Usá el formulario de abajo. Si se solicita confirmación, abrí el mensaje (revisá también spam), confirmá y volvé a entrar. Usá la misma cuenta en todos tus dispositivos.</p></li><li><strong>Comprobá que tus recuerdos viajan con vos</strong><p>Guardá una nota, tocá Sincronizar ahora y esperá “Todo guardado en la nube”. Abrí otro dispositivo con la misma conexión y cuenta y comprobá que aparezca. Si ya tenías datos aquí, tocá Importar datos de este dispositivo después de entrar.</p></li></ol><details><summary>¿No llega el correo?</summary><p>Revisá spam, la dirección y la configuración de Email en Supabase. El servicio de correo de prueba solo envía a direcciones del equipo del proyecto. Para otras cuentas, configurá un proveedor SMTP en Authentication.</p></details></article>`;
}
function clean(r) {
  return Object.fromEntries(
    Object.entries(r).filter(
      ([k]) =>
        !k.startsWith("__") &&
        !["fotos", "user_id", "creado_en", "actualizado_en"].includes(k),
    ),
  );
}
async function exportData() {
  toast("Preparando tu copia…");
  const data = { version: 4, exportado: new Date().toISOString() };
  for (const t of TABLES) data[t] = await all(db, t);
  for (const r of data.registros) {
    for (const f of r.fotos || []) {
      let blob = f.blob;
      if (!blob && f.storage_path) {
        if (!cloud.user || !navigator.onLine)
          throw Error("Conectate para incluir todas tus fotos en la copia.");
        const url = await cloud.photoURL(f.storage_path),
          resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok)
          throw Error("No se pudo descargar una foto. Volvé a intentar.");
        blob = await resp.blob();
      }
      if (blob) {
        f.data = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(blob);
        });
        delete f.blob;
      }
    }
  }
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `scar-copia-${dateISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Tu copia está lista.");
}
async function renderCurrent() {
  if (view === "hoy") await renderHoy();
  if (view === "productos") await renderProducts();
  if (view === "calendario") await renderCalendar();
  if (view === "evolucion") await renderEvolution();
  if (view === "ajustes") await renderSettings();
  icons();
}
async function navigate(v) {
  view = v;
  $$(".vista").forEach((e) =>
    e.classList.toggle("activa", e.id === "vista-" + v),
  );
  $$(".barra button").forEach((e) => {
    e.classList.toggle("activo", e.dataset.nav === v);
    if (e.dataset.nav === v) e.setAttribute("aria-current", "page");
    else e.removeAttribute("aria-current");
  });
  await renderCurrent();
  scrollTo({ top: 0, behavior: "instant" });
}
let photoDraft = null;
function events() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.nav) return action(() => navigate(b.dataset.nav));
    if (b.dataset.newRoutine)
      return action(() => routineModal(null, b.dataset.newRoutine));
    if (b.dataset.editRoutine)
      return action(() => routineModal(b.dataset.editRoutine));
    if (b.dataset.editProduct)
      return action(() => productModal(b.dataset.editProduct));
    if (b.dataset.packs) return action(() => packList(b.dataset.packs));
    if (b.dataset.newPack) return action(() => packModal(b.dataset.newPack));
    if (b.dataset.editPack)
      return action(() => packModal(null, b.dataset.editPack));
    if (b.dataset.editCycle)
      return action(() => cycleModal(b.dataset.editCycle));
    if (b.dataset.order) {
      const row = b.closest(".check"),
        list = row.parentElement;
      if (b.dataset.order === "-1" && row.previousElementSibling)
        list.insertBefore(row, row.previousElementSibling);
      if (b.dataset.order === "1" && row.nextElementSibling)
        list.insertBefore(row.nextElementSibling, row);
      return;
    }
    if (b.dataset.archiveProduct)
      return action(() => archive("productos", b.dataset.archiveProduct));
    if (b.dataset.archiveRoutine)
      return action(() => archive("rutinas", b.dataset.archiveRoutine));
    if (b.dataset.archivePack)
      return action(() => archive("envases", b.dataset.archivePack));
    if (b.dataset.archiveCycle)
      return action(() => archive("ciclos", b.dataset.archiveCycle));
    if (b.dataset.mood)
      return action(() =>
        mutateDay(
          (r) =>
            (r.estado_piel =
              r.estado_piel === Number(b.dataset.mood)
                ? null
                : Number(b.dataset.mood)),
        ),
      );
    if (b.dataset.habit)
      return action(() =>
        mutateDay(
          (r) =>
            (r[b.dataset.habit] =
              r[b.dataset.habit] == null
                ? true
                : r[b.dataset.habit] === true
                  ? false
                  : null),
        ),
      );
    if (b.dataset.sintoma)
      return action(() =>
        mutateDay((r) => {
          r.sintomas ||= [];
          r.sintomas = r.sintomas.includes(b.dataset.sintoma)
            ? r.sintomas.filter((x) => x !== b.dataset.sintoma)
            : [...r.sintomas, b.dataset.sintoma];
        }),
      );
    if (b.dataset.finish)
      return action(() =>
        mutateDay((r) => {
          const m = b.dataset.finish;
          r.sesiones ||= {};
          r.sesiones[m] ||= { nombre: "A mi manera", plan: [] };
          r.sesiones[m].estado =
            r.sesiones[m].estado === "terminada" ? "pendiente" : "terminada";
        }),
      );
    if (b.dataset.rest)
      return action(() =>
        mutateDay((r) => {
          const m = b.dataset.rest;
          if (r.productosUsados?.[m]?.length)
            throw Error(
              "Ya registraste productos. Desmarcalos si querés indicar descanso.",
            );
          r.sesiones ||= {};
          r.sesiones[m] ||= { nombre: "A mi manera", plan: [] };
          r.sesiones[m].estado =
            r.sesiones[m].estado === "descanso" ? "pendiente" : "descanso";
        }),
      );
    if (b.dataset.deletePhoto)
      return action(() =>
        mutateDay(
          (r) =>
            (r.fotos = r.fotos.filter((f) => f.id !== b.dataset.deletePhoto)),
        ),
      );
    if (b.dataset.deleteZone !== undefined)
      return action(() =>
        mutateDay((r) => r.zonas.splice(Number(b.dataset.deleteZone), 1)),
      );
    if (b.dataset.month)
      return action(async () => {
        mes = new Date(
          mes.getFullYear(),
          mes.getMonth() + Number(b.dataset.month),
          1,
        );
        await renderCalendar();
      });
    if (b.dataset.date)
      return action(async () => {
        fecha = b.dataset.date;
        await navigate("hoy");
      });
    if (b.dataset.resolve)
      return action(async () => {
        const t = b.dataset.table,
          key = b.dataset.key,
          r = await get(db, t, key);
        if (!r.__remote)
          throw Error("Sincronizá otra vez para cargar la versión de la nube.");
        if (b.dataset.resolve === "remote") await put(db, t, r.__remote, false);
        else {
          r.__version = r.__remote.__version;
          r.id = r.__remote.id;
          delete r.__conflict;
          delete r.__remote;
          delete r.__remoteVersion;
          await save(t, r);
        }
        await sync();
        await renderSettings();
      });
    switch (b.id) {
      case "nextQuote":
        renderNote(true);
        break;
      case "nuevoProducto":
        action(() => productModal());
        break;
      case "nuevaRutina":
        action(() => routineModal());
        break;
      case "cerrarModal":
        $("#modal").close();
        photoDraft = null;
        break;
      case "nuevoSintoma":
        modal(
          "Una nueva sensación",
          field("Nombre", "nombre", "", "text", 'required maxlength="180"') +
            select("Tipo", "tipo", ["piel", "ciclo", "general"], "piel") +
            submit(),
          "sintoma",
        );
        break;
      case "registrarZona":
        action(zoneModal);
        break;
      case "cargarPeriodoPasado":
        action(cycleList);
        break;
      case "newCycle":
        action(() => cycleModal());
        break;
      case "botonPeriodo":
        action(async () => {
          const cs = await all(db, "ciclos"),
            open = cs.find((c) => !c.eliminado && !c.fechaFin),
            c = open
              ? { ...open, fechaFin: fecha }
              : {
                  id: crypto.randomUUID(),
                  fechaInicio: fecha,
                  fechaFin: null,
                  eliminado: false,
                };
          validateCycle(c, cs);
          await save("ciclos", c);
          await renderHoy();
          toast("Período registrado.");
        });
        break;
      case "syncNow":
        action(sync);
        break;
      case "importLocal":
        action(async () => {
          await importLegacy(guest, db);
          await sync();
          await renderSettings();
          toast(
            "Importación lista. Los originales siguen en este dispositivo.",
          );
        });
        break;
      case "logout":
        action(async () => {
          await cloud.logout();
          await switchAccount();
          toast("Sesión cerrada.");
        });
        break;
      case "exportar":
        action(exportData);
        break;
      case "persistir":
        action(async () =>
          toast(
            (await navigator.storage?.persist?.())
              ? "Guardado persistente activado."
              : "El navegador administra la conservación de tus datos.",
          ),
        );
        break;
      case "recover":
        action(async () => {
          const email = $("#authForm [name=email]").value;
          if (!email) throw Error("Escribí tu correo primero.");
          await cloud.recover(email);
          $("#authMessage").textContent =
            "Revisá tu correo y abrí el enlace para cambiar la contraseña.";
        });
        break;
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.prod) {
      const { prod, momento } = el.dataset,
        checked = el.checked;
      action(() =>
        mutateDay((r) => {
          r.productosUsados ||= { mañana: [], noche: [] };
          const old = r.productosUsados[momento] || [];
          r.productosUsados[momento] = checked
            ? [...new Set([...old, prod])]
            : old.filter((x) => x !== prod);
          if (r.sesiones?.[momento]) r.sesiones[momento].estado = "pendiente";
        }),
      );
    }
    if (el.dataset.routine) {
      const m = el.dataset.routine,
        id = el.value;
      action(async () => {
        const r = await readRecord(db, fecha),
          routine = id ? await get(db, "rutinas", id) : null;
        await save(
          "registros",
          chooseRoutine(r, m, routine, await all(db, "productos")),
        );
        await renderHoy();
      });
    }
    if (el.dataset.intensity) {
      const id = el.dataset.intensity,
        value = Number(el.value);
      action(() =>
        mutateDay((r) => {
          r.intensidades ||= {};
          r.intensidades[id] = value;
        }, false),
      );
    }
    if (el.dataset.daily) {
      if (!el.checkValidity()) {
        toast("Revisá el valor ingresado.");
        return;
      }
      const k = el.dataset.daily,
        value = el.value,
        date = fecha;
      action(() =>
        mutateDay(
          (r) => {
            r[k] =
              value === ""
                ? null
                : ["horas_sueno", "vasos_agua", "estres"].includes(k)
                  ? Number(value)
                  : value;
          },
          k === "sangrado",
          date,
        ),
      );
    }
    if (el.id === "etiquetasHoy") {
      const text = el.value,
        date = fecha;
      action(() =>
        mutateDay(
          (r) =>
            (r.etiquetas_libres = [
              ...new Set(
                text
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              ),
            ]),
          false,
          date,
        ),
      );
    }
    if (el.id === "fechaActual") {
      const date = el.value;
      action(async () => {
        if (!date || date > dateISO())
          throw Error("Elegí una fecha hasta hoy.");
        fecha = date;
        await renderHoy();
      });
    }
    if (el.id === "fotoInput" || el.id === "cameraInput") {
      const file = el.files[0];
      el.value = "";
      if (file)
        action(async () => {
          const r = await readRecord(db, fecha);
          if (r.fotos.length >= 3) throw Error("Máximo 3 fotos por día.");
          photoDraft = { id: crypto.randomUUID(), blob: await compress(file) };
          modal(
            "Una foto de tu piel",
            select(
              "¿Qué lado de tu rostro se ve?",
              "angulo",
              ["frente", "perfil izquierdo", "perfil derecho"],
              "frente",
            ) + '<p class="ayuda">Izquierda y derecha son las de tu rostro, aunque la cámara muestre una imagen en espejo.</p>' + submit("Guardar foto"),
            "photo",
          );
        });
    }
  });
  $("#buscarProducto").addEventListener("input", () => action(renderProducts));
  // Persistir notas mientras se escribe; no depender de abandonar el campo.
  $("#notasHoy").addEventListener("input", (e) => {
    const value = e.target.value,
      date = fecha;
    action(() => mutateDay((r) => (r.notas = value), false, date));
  });
  $("#formModal").addEventListener("submit", (e) => {
    e.preventDefault();
    action(() => saveForm(e));
  });
  $("#ajustes").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target,
      mode = e.submitter?.value,
      f = new FormData(form);
    action(async () => {
      const buttons = [...form.querySelectorAll("button")];
      buttons.forEach((b) => (b.disabled = true));
      try {
        if (form.id === "configForm") {
          cloud.configure(
            String(f.get("url")).trim(),
            String(f.get("key")).trim(),
          );
          await renderSettings();
          toast("Configuración guardada. Creá tu cuenta o iniciá sesión para probar la nube.");
        }
        if (form.id === "authForm") {
          if (mode === "signup") {
            const logged = await cloud.signup(
              f.get("email"),
              f.get("password"),
              f.get("nombre"),
            );
            if (!logged) {
              $("#authMessage").textContent =
                "Revisá tu correo para confirmar la cuenta. Después podés entrar aquí.";
              return;
            }
          } else await cloud.login(f.get("email"), f.get("password"));
          await switchAccount();
          toast("Tu diario ya está con vos.");
        }
      } catch (err) {
        const msg = form.querySelector("[role=status],[role=alert]");
        if (msg) msg.textContent = friendly(err);
        else toast(friendly(err));
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    });
  });
  window.addEventListener("online", () => action(sync));
  window.addEventListener("offline", () =>
    status("Sin conexión · guardado aquí"),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      renderNote();
      action(sync);
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === cloud.sessionKey && cloud.user?.id !== accountId)
      action(switchAccount);
  });
  setInterval(() => {
    renderNote();
    if (document.visibilityState === "visible" && cloud.user)
      sync().catch(() => {});
  }, 60000);
}
async function init() {
  icons();
  stickers();
  $("#photoGuide").innerHTML = photoGuide();
  renderNote();
  guest = await openDB();
  db = guest;
  await normalizeLegacy(guest);
  events();
  const callback = cloud.configured ? await cloud.consumeCallback() : null;
  await switchAccount();
  if (callback === "recovery")
    modal(
      "Elegí una nueva contraseña",
      field(
        "Nueva contraseña",
        "password",
        "",
        "password",
        'required minlength="8" autocomplete="new-password"',
      ) + submit(),
      "password",
    );
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("./sw.js")
      .catch((e) => console.warn("SCAR offline:", e.message));
}
init().catch((e) => {
  console.error(e);
  status("No se pudo abrir el diario");
  toast(e.message);
});
