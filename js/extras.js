import { dateISO, escapeHTML as esc, cycleInfo } from "./core.js";
import { daypart } from "./daypart.js";
import { initRunner, renderRunner, startRoutine } from "./runner.js";
import { due } from "./schedule.js";
import { initStepTimers, renderStepTimers } from "./step-timers.js";
let A, stream, urls = [], cameraDate, cameraOwner, dialogOwner, weatherBusy = false, weatherAttempt;
let shownPeriod, lastToday = dateISO(), morningCard, nightCard;
const $ = s => document.querySelector(s);
const time = () => new Date().toTimeString().slice(0, 5);
const angles = ["frente", "perfil izquierdo", "perfil derecho"];
const option = (v, label = v) => `<option value="${esc(v)}">${esc(label)}</option>`;
const labels = {estado_piel:"Estado de piel / 5",horas_sueno:"Horas de sueño",vasos_agua:"Vasos de agua",estres:"Estrés / 5",uso_protector:"Protector solar",ejercicio:"Ejercicio",maquillaje:"Maquillaje",alcohol:"Alcohol",viaje:"Viaje",mucho_calor:"Mucho calor",exposicion_sol:"Exposición al sol",temperatura:"Temperatura °C",humedad:"Humedad %",sangrado:"Sangrado",notas:"Notas",diario:"Diario"};
function release() { stream?.getTracks().forEach(t => t.stop()); stream = null; urls.forEach(URL.revokeObjectURL); urls = []; }
function dialog(title, content) {
  release();
  dialogOwner=A.owner();
  $("#extraContent").innerHTML = `<h2>${esc(title)}</h2>${content}<p id="extraError" role="alert"></p>`;
  $("#extraDialog").showModal();
}
async function photoSrc(f) {
  if (f.blob) { const u = URL.createObjectURL(f.blob); urls.push(u); return u; }
  if (f.storage_path && A.cloud.user && navigator.onLine) return A.cloud.photoURL(f.storage_path);
  throw Error("Esta foto está en la nube. Conectate para verla.");
}
async function fillPhoto(img, f) {
  try { const u = await photoSrc(f); if (img.isConnected) img.src = u; }
  catch(e) { if(img.isConnected) img.alt = e.message; }
}
export function initExtras(api) {
  A = api;
  document.body.insertAdjacentHTML("beforeend", '<dialog id="extraDialog"><button type="button" id="extraClose" class="modal-close" aria-label="Cerrar">×</button><div id="extraContent"></div></dialog>');
  $("#extraClose").onclick = () => $("#extraDialog").close();
  $("#extraDialog").addEventListener("close", release);
  document.addEventListener("visibilitychange", () => { if(document.hidden && stream) $("#extraDialog").close(); });
  const day = $("#vista-hoy"), details = document.createElement("details");
  details.id = "moreDetails"; details.innerHTML = '<summary>Agregar más · productos, zonas, hábitos y ciclo</summary>';
  const start = day.querySelector(".section-heading");
  while(start.nextElementSibling) details.append(start.nextElementSibling);
  details.prepend(start); details.insertBefore(details.querySelector("summary"), details.firstChild);
  day.append(details);
  details.insertAdjacentHTML("beforebegin", '<article id="quickCard" class="tarjeta"><span class="eyebrow">LO ESENCIAL, A TU MANERA</span><h2>Un toque para cuidarte</h2><div id="quickMood"></div><div id="quickRoutine"></div><div class="form-actions"><button class="boton auto" id="freeCare">+ Otro cuidado</button></div><div id="careList"></div><div id="quickPhotos"></div><div id="weatherCard"></div></article>');
  details.insertAdjacentHTML("afterend", '<section id="completedRituals" hidden><div class="section-heading compact"><div><span class="eyebrow">LISTO POR HOY</span><h2>Cuidados terminados</h2></div><span aria-hidden="true">♡</span></div><div id="completedRitualList" class="ritual-grid"></div></section>');
  $("#completedRituals").append($("#careList"));
  $("#quickMood").append($("#mood"));
  morningCard = document.querySelector(".ritual.morning");
  nightCard = document.querySelector(".ritual.evening");
  $("#quickCard").insertAdjacentHTML("beforebegin", '<div id="currentCare" aria-label="Cuidado sugerido según la hora"></div>');
  const refreshPeriod = () => {
    if(document.hidden || document.querySelector("dialog[open]") || document.activeElement?.matches("input,select,textarea")) return;
    const now = dateISO(), key = now + daypart().key;
    if(key === shownPeriod) return;
    A.action(async () => {
      await A.clockRefresh(lastToday, now);
      lastToday = now;
    });
  };
  setInterval(refreshPeriod, 30000);
  document.addEventListener("visibilitychange", refreshPeriod);
  window.addEventListener("focus", refreshPeriod);
  $(".barra").insertAdjacentHTML("beforeend", '<button data-nav="comparar"><span aria-hidden="true">◧</span><small>Comparar</small></button>');
  $(".barra").append($(".barra [data-nav=ajustes]"));
  initRunner(A);
  initStepTimers(A);
  $(".day-heading").insertAdjacentHTML("afterend", '<div class="day-context"><time id="localClock" aria-label="Hora local"></time><div id="weatherInline"></div></div>');
  $("#weatherInline").replaceWith($("#weatherCard"));
  const updateClock=()=>{$("#localClock").textContent=new Intl.DateTimeFormat("es-PY",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());};
  updateClock();setInterval(updateClock,1000);
  $("#quickCard").insertAdjacentHTML("beforebegin", '<article class="tarjeta" id="scheduledProducts"></article>');
  $("#quickCard").insertAdjacentHTML("afterend", '<details class="tarjeta" id="sunCare"><summary>Protector solar · aplicaciones y recordatorio</summary><div id="sunCareBody"></div></details>');
  setInterval(updateSunReminder, 30000);
  document.addEventListener('visibilitychange', updateSunReminder);
  $("#app").insertAdjacentHTML("beforeend", '<section id="vista-comparar" class="vista"><div class="titulo-vista"><h1>Tu piel, <em>en perspectiva.</em></h1><p>Compará el mismo ángulo con luz y distancia parecidas. No es un diagnóstico.</p></div><div id="comparePanel"></div></section>');
  $("#quickCard").after($(".photo-card"));
  $(".photo-guide").open = false;
  $(".camera-action").outerHTML = '<button type="button" class="camera-action texto" id="ghostCamera">Sacar una foto</button>';
  $(".barra [data-nav=calendario]").insertAdjacentHTML("afterend", '<button data-nav="ciclo"><span aria-hidden="true">○</span><small>Mi ciclo</small></button>');
  $("#app").insertAdjacentHTML("beforeend", '<section id="vista-ciclo" class="vista"><div class="titulo-vista"><h1>Mi ciclo, <em>mi ritmo.</em></h1></div><div id="cycleOverview"></div></section>');
  $("#cycleOverview").before($(".cycle-card"));
  $("#freeCare").onclick = () => A.action(() => careForm());
  $("#ghostCamera").onclick = () => A.action(cameraForm);
  $("#extraDialog").addEventListener("submit", e => { e.preventDefault(); const form = e.target, data = new FormData(form); A.action(async () => {
    const b = form.querySelector('[type="submit"]'); if(b) b.disabled = true;
    try {
      if(dialogOwner !== A.owner()) throw Error("La cuenta cambió. Cerrá esta ventana y volvé a abrirla.");
      if(form.id === "careForm") {
        const name = String(data.get("name")).trim(); if(!name) throw Error("Dale un nombre a este cuidado.");
        const hour=String(data.get('time') || (form.dataset.date===dateISO()?time():''));
        if(hour>='06:00' && hour<'15:00') {
          const products=await A.all('productos'), selected=data.getAll('product');
          if(products.some(p=>selected.includes(p.id) && (p.programacion?.solo_noche || p.momento==='noche')) && !window.confirm('Hay productos marcados solo de noche. ¿Querés registrar este uso por la mañana igualmente?')) return;
        }
        await A.mutate(r => {
          r.sesiones ||= {}; r.sesiones.cuidados ||= [];
          const previous = r.sesiones.cuidados.find(x => x.id === form.dataset.edit) || {};
          const entry = {...previous,id:form.dataset.edit || crypto.randomUUID(),nombre:name,hora:data.get("time") || (form.dataset.date === dateISO() ? time() : ""),productos:data.getAll("product").map(id => ({id,nombre:form.querySelector(`[value="${id}"]`).dataset.name})),notas:String(data.get("notes")),estado:"terminada"};
          const i = r.sesiones.cuidados.findIndex(x => x.id === entry.id);
          if(i < 0) r.sesiones.cuidados.push(entry); else r.sesiones.cuidados[i] = entry;
        },true,form.dataset.date);
        $("#extraDialog").close();
      }
    } catch(err) { $("#extraError").textContent = err.message; } finally { if(b) b.disabled = false; }
  }); });
}
export async function renderExtras(r) {
  if(!A) return;
  const period = daypart(), today = r.fecha === dateISO();
  const products = await A.all('productos');
  const scheduled = products.filter(p=>!p.eliminado && p.activo!==false && p.programacion?.tipo && p.programacion.tipo!=='diaria' && due(p,r.fecha));
  $("#scheduledProducts").hidden = !scheduled.length;
  $("#scheduledProducts").innerHTML = '<h3>Hoy también toca…</h3>' + scheduled.map(p=>`<p>${esc(p.nombre)} · ${p.programacion?.solo_noche || p.momento==='noche' ? 'solo de noche' : esc(p.momento || 'a tu manera')}</p>`).join('');
  renderSunCare(r);
  renderRunner(r);
  renderStepTimers(r);
  shownPeriod = dateISO() + period.key;
  const holder = $("#currentCare"), grid = document.querySelector("#moreDetails .ritual-grid"), completed = $("#completedRituals"), completedList = $("#completedRitualList");
  grid.append(morningCard, nightCard);
  holder.replaceChildren();
  completedList.replaceChildren();
  const finishedCards = [["mañana", morningCard], ["noche", nightCard]].filter(([moment]) => r.sesiones?.[moment]?.estado === "terminada");
  finishedCards.forEach(([, card]) => completedList.append(card));
  completed.hidden = finishedCards.length === 0 && !(r.sesiones?.cuidados || []).length;
  if(today && period.key !== "extra") {
    const activeCard = period.key === "mañana" ? morningCard : nightCard;
    if(r.sesiones?.[period.key]?.estado !== "terminada") holder.append(activeCard);
    else holder.innerHTML = `<article class="tarjeta current-finished"><span class="eyebrow">RITUAL COMPLETADO</span><h2>Ya terminaste tu ${period.key}</h2><p>Quedó registrada a las ${esc(r.sesiones[period.key].hora || "hora indicada")}. La tarjeta pasó al final del día.</p></article>`;
  }
  else if(today) {
    holder.innerHTML = '<article class="tarjeta afternoon"><span class="eyebrow">15:00–20:00 · A TU MANERA</span><h2>Un cuidado extra</h2><p>Una mascarilla, un retoque o lo que elijas. Este momento es opcional.</p><button class="boton" id="afternoonCare">+ Agregar cuidado de tarde</button></article>';
    $("#afternoonCare").onclick = () => A.action(() => careForm(null,null,"Cuidado de tarde"));
  }
  if(today) holder.insertAdjacentHTML("afterbegin", `<p class="ayuda time-window">${esc(period.range)} · hora de tu dispositivo. Podés registrar otros cuidados en “Agregar más”.</p>`);
  const routines = (await A.all("rutinas")).filter(x => !x.eliminado && x.activa !== false && (!today || x.momento === "cualquiera" || x.momento === period.key));
  const regs = await A.all("registros");
  const recent = regs.filter(x => !x.eliminado).sort((a,b) => b.fecha.localeCompare(a.fecha)).flatMap(x => [...(x.sesiones?.cuidados || [])].reverse()).find(x => x.rutina_id);
  const selected = $("#quickRoutine select")?.value || recent?.rutina_id || routines[0]?.id;
  $("#quickRoutine").innerHTML = routines.length ? `<label class="campo-label" for="usualRoutine">Mi rutina habitual</label><select id="usualRoutine">${routines.map(x => option(x.id,x.nombre)).join("")}</select><button id="startRoutine" class="boton">Empezar mi rutina</button><button id="didRoutine" class="texto">Ya la hice · registrar todo</button><p class="fineprint">Este botón confirma todos sus pasos. Para cambiar productos u hora, editá el cuidado.</p>` : '<p>Elegí qué cuidado querés hacer. No hay una mañana ni una noche obligatorias.</p><button class="texto" data-new-routine="cualquiera">+ Crear mi rutina habitual</button>';
  if($("#usualRoutine")) {
    $("#startRoutine").onclick=()=>A.action(()=>startRoutine(routines.find(x=>x.id===$("#usualRoutine").value)));
    if(routines.some(x => x.id === selected)) $("#usualRoutine").value = selected;
    $("#didRoutine").onclick = () => { const id = $("#usualRoutine").value, date = A.date(); A.action(async () => {
      if(date !== dateISO()) return careForm(null,id);
      const original = routines.find(x => x.id === id), ps = await A.all("productos");
      const routine = {...original, productos:(original.productos || []).filter(id=>due(ps.find(p=>p.id===id)||{},date))};
      if(period.key==='mañana' && routine.productos.some(id=>{const p=ps.find(p=>p.id===id);return p?.programacion?.solo_noche || p?.momento==='noche';})) {
        if(!window.confirm('Esta rutina contiene productos marcados solo de noche. ¿Querés registrar que los usaste igualmente?')) return;
      }
      await A.mutate(day => { day.sesiones ||= {}; day.sesiones.cuidados ||= []; day.sesiones.cuidados.push({id:crypto.randomUUID(),rutina_id:id,nombre:routine.nombre,hora:time(),registrado_en:new Date().toISOString(),estado:"terminada",productos:(routine.productos || []).map(id => ({id,nombre:ps.find(x=>x.id===id)?.nombre || "Producto archivado"}))}); },true,date);
      A.toast("Cuidado registrado. Podés editarlo o quitarlo.");
    }); };
  }
  $("#careList").innerHTML = (r.sesiones?.cuidados || []).map(x => `<div class="item"><strong>${esc(x.nombre)}</strong> · ${esc(x.hora || "Sin hora")}<p>${(x.productos || []).map(p=>esc(p.nombre)).join(" · ") || "Sin productos especificados"}</p><p>${esc(x.notas || "")}</p><button class="texto" data-care-edit="${esc(x.id)}">Editar</button> <button class="texto" data-care-remove="${esc(x.id)}">Quitar</button></div>`).join("");
  document.querySelectorAll('[data-care-edit]').forEach(b => b.onclick = () => A.action(()=>careForm(b.dataset.careEdit)));
  document.querySelectorAll('[data-care-remove]').forEach(b => b.onclick = () => A.action(()=>A.mutate(day => {day.sesiones.cuidados=day.sesiones.cuidados.filter(x=>x.id!==b.dataset.careRemove)})));
  $("#quickPhotos").innerHTML = `<p class="ayuda">${r.fotos?.length || 0}/3 fotos · <button id="showDay" class="texto">Ver ficha del día</button></p>`;
  $("#showDay").onclick = () => A.action(()=>daySheet(A.date()));
  for(const m of ["mañana","noche"]) {
    const card = document.querySelector(`[data-finish="${m}"]`).closest("article");
    card.querySelector(".session-time")?.remove();
    card.insertAdjacentHTML("beforeend", `<label class="session-time">Hora · opcional <input type="time" value="${esc(r.sesiones?.[m]?.hora || "")}" data-session-time="${m}"></label>`);
    card.querySelector("[data-session-time]").onchange = e => {const value=e.target.value;A.action(()=>A.mutate(d=>{d.sesiones ||= {}; d.sesiones[m] ||= {nombre:m,plan:[]};d.sesiones[m].hora=value;}));};
  }
  const weather = r.sesiones?.clima;
  const enabled=localStorage.getItem("scar-weather")==="yes";
  $("#weatherCard").innerHTML = `<span>${weather ? `${esc(r.temperatura)} °C · ${esc(r.humedad)} % humedad` : "Clima sin registrar"}</span> <button class="texto" id="weatherEnable" ${r.fecha===dateISO()?'':'disabled'} aria-label="Activar o actualizar clima">${enabled?'↻':'Ver clima'}</button><span id="weatherError" role="status"></span>`;
  $("#weatherEnable").onclick = () => {
    if(localStorage.getItem("scar-weather")!=="yes" && !confirm("Para mostrar el clima, enviaremos tu ubicación aproximada a Open-Meteo. SCAR no guarda las coordenadas. ¿Querés activarlo?"))return;
    localStorage.setItem("scar-weather","yes");$("#weatherEnable").textContent="↻";weatherFetch();
  };
  if(localStorage.getItem("scar-weather") === "yes" && !weather && A.date()===dateISO() && weatherAttempt !== A.owner()+A.date()) weatherFetch();
}
async function careForm(id, routineId, defaultName = "") {
  const date = A.date(), r = await A.record(date), ps=(await A.all("productos")).filter(p=>!p.eliminado);
  let c = r.sesiones?.cuidados?.find(x=>x.id===id) || {nombre:defaultName};
  if(routineId) { const routine=(await A.all("rutinas")).find(x=>x.id===routineId);c={nombre:routine.nombre,productos:ps.filter(p=>routine.productos.includes(p.id) && due(p,date))}; }
  dialog(id ? "Editar cuidado" : "Un cuidado a tu manera", `<form id="careForm" data-date="${date}" data-edit="${esc(id || "")}"><label class="campo-label">Nombre<input name="name" required maxlength="180" placeholder="Mañana, tarde, mascarilla…" value="${esc(c.nombre || "")}"></label><label class="campo-label">Hora<input name="time" type="time" value="${esc(c.hora || (date===dateISO()?time():""))}"></label><p>Productos usados · opcional</p>${ps.map(p=>`<label class="check"><input name="product" type="checkbox" value="${p.id}" data-name="${esc(p.nombre)}" ${c.productos?.some(x=>x.id===p.id)?"checked":""}>${esc(p.nombre)}</label>`).join("")}<label class="campo-label">Notas<textarea name="notes">${esc(c.notas || "")}</textarea></label><button class="boton" type="submit">Guardar cuidado</button></form>`);
}
let sunDeadline = null;
function updateSunReminder() {
  const out = $('#sunReminderStatus');
  if (!out || !sunDeadline) return;
  const left = Math.max(0, Math.ceil((sunDeadline-Date.now())/60000));
  out.textContent = left ? `Próximo aviso en ${left} min.` : 'Pasaron dos horas desde la última aplicación registrada. Revisá si corresponde reaplicar.';
}
function renderSunCare(r) {
  const s=r.sesiones?.protector || {}, entries=s.aplicaciones || [], today=r.fecha===dateISO();
  sunDeadline = today && s.recordatorio && entries.length ? entries.at(-1).instante + 120*60000 : null;
  $('#sunCareBody').innerHTML = `<p><strong>${entries.length} aplicación(es) · ${Math.max(0,entries.length-1)} reaplicación(es)</strong></p><p>${entries.map(x=>esc(x.hora)).join(' · ') || 'Sin aplicaciones registradas en este contador.'}</p><button type="button" class="boton auto" id="sunApply" ${today?'':'disabled'}>${entries.length?'Reapliqué protector':'Primera aplicación del día'}</button> <button type="button" class="texto" id="sunUndo" ${entries.length?'':'disabled'}>Deshacer última</button><label class="check"><input id="sunReminder" type="checkbox" ${s.recordatorio?'checked':''}>Avisarme a las dos horas en la app</label><p id="sunReminderStatus" role="status"></p><p class="fineprint">El aviso se actualiza al volver a SCAR; no envía notificaciones con la app cerrada. Al aire libre, reaplicá aproximadamente cada dos horas y después de nadar o sudar, siguiendo el envase. <a href="https://www.aad.org/media/stats-sunscreen" target="_blank" rel="noopener">Fuente: AAD</a></p>`;
  const date=r.fecha;
  $('#sunApply').onclick=()=>A.action(()=>A.mutate(d=>{d.sesiones ||= {};d.sesiones.protector ||= {};d.sesiones.protector.aplicaciones ||= [];d.sesiones.protector.aplicaciones.push({instante:Date.now(),hora:time()});d.uso_protector=true;},true,date));
  $('#sunUndo').onclick=()=>A.action(()=>A.mutate(d=>{d.sesiones?.protector?.aplicaciones?.pop();},true,date));
  $('#sunReminder').onchange=e=>{const value=e.target.checked;A.action(()=>A.mutate(d=>{d.sesiones ||= {};d.sesiones.protector ||= {};d.sesiones.protector.recordatorio=value;},true,date));};
  updateSunReminder();
}
export async function daySheet(date) {
  const r = await A.record(date), ss=await A.all("sintomas"), ps=await A.all("productos"), cs=await A.all("ciclos");
  const name = id => ss.find(s=>s.id===id)?.nombre || "Síntoma archivado";
  const intens = n => n==null?"Sin intensidad":["Ausente","Leve","Moderada","Fuerte"][n];
  dialog(`Tu día · ${date}`, `<button class="boton secundario" id="editSheet">Editar este día</button><h3>Cuidados</h3>${["mañana","noche"].map(m=>{const s=r.sesiones?.[m],used=r.productosUsados?.[m]||[];return s||used.length?`<p><strong>${esc(s?.nombre || m)}</strong> · ${esc(s?.hora || "Sin hora")} · ${esc(s?.estado || "Registrado")}<br>${used.map(id=>esc(ps.find(p=>p.id===id)?.nombre || "Producto archivado")).join(" · ")}</p>`:"";}).join("")}${(r.sesiones?.cuidados || []).map(c=>`<p><strong>${esc(c.nombre)}</strong> · ${esc(c.hora || "Sin hora")}<br>${(c.productos || []).map(p=>esc(p.nombre)).join(" · ")}<br>${esc(c.notas || "")}</p>`).join("")}<h3>Piel y contexto</h3><dl>${Object.entries(labels).map(([k,n])=>`<dt>${n}</dt><dd>${r[k]==null||r[k]===""?"Sin registrar":esc(typeof r[k]==="boolean"?(r[k]?"Sí":"No"):r[k])}</dd>`).join("")}</dl><h3>Sensaciones y zonas</h3>${(r.sintomas||[]).map(id=>`<p>${esc(name(id))} · ${intens(r.intensidades?.[id])}</p>`).join("")}${(r.zonas||[]).map(z=>`<p><strong>${esc(A.zoneName(z.zona_id))}</strong> · ${z.sintoma_id?esc(name(z.sintoma_id)):"Sin síntoma asociado"} · ${intens(z.intensidad)}<br>${esc(z.notas||"")}</p>`).join("")}<p>Etiquetas: ${esc((r.etiquetas_libres||[]).join(", ") || "Sin registrar")}</p><h3>Ciclo</h3><p>${esc(cycleInfo(cs,date,r.sangrado).title)}</p><h3>Fotos</h3><div class="sheet-photos">${(r.fotos||[]).map((f,i)=>`<figure><img id="sheetPhoto${i}" alt="${esc(f.angulo||"Sin ángulo")}"><figcaption>${esc(f.angulo||"Sin ángulo")}</figcaption></figure>`).join("") || "No hay fotos de este día."}</div>`);
  const applications=r.sesiones?.protector?.aplicaciones || [];
  $('#editSheet').insertAdjacentHTML('afterend', `<h3>Aplicaciones de protector registradas</h3><p>${applications.length} aplicación(es) · ${Math.max(0,applications.length-1)} reaplicación(es)</p><p>${applications.map(x=>esc(x.hora)).join(' · ') || 'Sin horarios registrados.'}</p>`);
  $("#editSheet").onclick = () => {$("#extraDialog").close();A.editDate(date);};
  await Promise.all((r.fotos||[]).map((f,i)=>fillPhoto($("#sheetPhoto"+i),f)));
}
export async function renderCompare() {
  release();
  const regs=(await A.all("registros")).filter(r=>!r.eliminado&&r.fotos?.length).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  $("#comparePanel").innerHTML=`<article class="tarjeta"><label>Ángulo<select id="compareAngle">${angles.map(a=>option(a)).join("")}</select></label><div class="comparison"><div><label>Primera fecha<select id="compareA">${regs.map(r=>option(r.fecha)).join("")}</select></label><div id="compareImageA"></div></div><div><label>Segunda fecha<select id="compareB">${regs.map(r=>option(r.fecha)).join("")}</select></label><div id="compareImageB"></div></div></div><p class="ayuda">Las imágenes se muestran completas, sin estirar ni suavizar la piel.</p></article>`;
  if(regs.length>1) $("#compareB").selectedIndex=1;
  let revision=0;
  const update=async()=>{const token=++revision;release();for(const side of ["A","B"]){const date=$("#compare"+side).value,angle=$("#compareAngle").value,f=regs.find(r=>r.fecha===date)?.fotos.find(f=>f.angulo===angle),box=$("#compareImage"+side);box.innerHTML=f?`<img alt="${esc(date)} · ${esc(angle)}">`:'<p>No hay foto de este ángulo para esa fecha.</p>';if(f){await fillPhoto(box.querySelector("img"),f);if(token!==revision)return;}}};
  for(const id of ["compareA","compareB","compareAngle"]) $("#"+id).onchange=update;
  await update();
}
async function weatherFetch() {
  if(weatherBusy) return;
  const date=A.date(),owner=A.owner();
  if(date!==dateISO()) {$("#weatherError").textContent="Solo se consulta el clima del día actual.";return;}
  weatherBusy=true;
  weatherAttempt=owner+date;
  try {
    const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000,maximumAge:300000,enableHighAccuracy:false}));
    if(localStorage.getItem("scar-weather")!=="yes")return;
    const params=new URLSearchParams({latitude:p.coords.latitude.toFixed(2),longitude:p.coords.longitude.toFixed(2),current:"temperature_2m,relative_humidity_2m",timezone:"auto"});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    let res;try{res=await fetch("https://api.open-meteo.com/v1/forecast?"+params,{signal:controller.signal});}finally{clearTimeout(timer);}
    if(!res.ok)throw Error("No se pudo consultar el clima.");const data=await res.json(),c=data.current;
    if(!Number.isFinite(c?.temperature_2m)||!Number.isFinite(c?.relative_humidity_2m))throw Error("La API no devolvió datos válidos.");
    if(owner!==A.owner()||date!==dateISO()||localStorage.getItem("scar-weather")!=="yes")return;
    await A.action(()=>A.mutate(r=>{r.temperatura=c.temperature_2m;r.humedad=c.relative_humidity_2m;r.sesiones ||= {};r.sesiones.clima={fuente:"Open-Meteo",hora:c.time,consultado_en:new Date().toISOString()};},true,date));
  } catch(e) {if($("#weatherError"))$("#weatherError").textContent=e.code===1?"No diste permiso de ubicación. Podés seguir usando SCAR sin clima.":"No se pudo cargar el clima. Revisá internet y permisos; podés reintentar.";}
  finally{weatherBusy=false;}
}
async function cameraForm() {
  cameraDate=A.date();cameraOwner=A.owner();
  dialog("Tu foto del día", `<label>Ángulo<select id="cameraAngle">${angles.map(a=>option(a)).join("")}</select></label><p class="ayuda">Elegí frente, perfil izquierdo o derecho. Usá luz y distancia parecidas cada vez. Después podés comparar ese mismo ángulo en “Comparar”.</p><div class="camera-stage"><video id="cameraVideo" autoplay playsinline muted></video></div><button id="startCamera" class="boton" type="button">Activar cámara frontal</button><button id="captureCamera" class="boton" type="button" disabled>Guardar foto</button><p class="fineprint">Vista sin efecto espejo. La imagen se guarda en JPG.</p>`);
  $("#startCamera").onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw Error("Abrí SCAR en Safari o Chrome por HTTPS. También podés usar la galería.");const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1200},height:{ideal:1600}},audio:false});if(!$("#extraDialog").open || !$("#cameraVideo")){s.getTracks().forEach(t=>t.stop());return;}stream?.getTracks().forEach(t=>t.stop());stream=s;$("#cameraVideo").srcObject=s;await $("#cameraVideo").play();$("#captureCamera").disabled=false;}catch(e){$("#extraError").textContent=e.name==="NotAllowedError"?"Permití la cámara en el navegador o usá la galería para elegir de la galería.":e.message;}};
  $("#captureCamera").onclick=()=>{const angle=$("#cameraAngle").value;A.action(async()=>{try{const v=$("#cameraVideo");if(!v.videoWidth)throw Error("Esperá a que se vea la cámara.");const c=document.createElement("canvas"),scale=Math.min(1,1200/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext("2d").drawImage(v,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,"image/jpeg",.82));if(!blob)throw Error("No se pudo capturar la foto.");if(cameraOwner!==A.owner())throw Error("Cambió la cuenta. Volvé a abrir la cámara.");await A.mutate(r=>{r.fotos ||= [];if(r.fotos.length>=3)throw Error("Ya tenés 3 fotos. Quitá una antes de agregar otra.");r.fotos.push({id:crypto.randomUUID(),blob,angulo:angle});},true,cameraDate);$("#extraDialog").close();A.toast("Foto guardada.");}catch(e){$("#extraError").textContent=e.message;}});};
}
