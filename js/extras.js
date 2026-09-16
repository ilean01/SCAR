import { dateISO, escapeHTML as esc, cycleInfo } from "./core.js";
import { daypart } from "./daypart.js";
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
  details.insertAdjacentHTML("beforebegin", '<article id="quickCard" class="tarjeta"><span class="eyebrow">LO ESENCIAL, A TU MANERA</span><h2>Un toque para cuidarte</h2><div id="quickMood"></div><div id="quickRoutine"></div><div class="form-actions"><button class="boton auto" id="freeCare">+ Otro cuidado</button><button class="boton secundario auto" id="quickPhoto">+ Foto</button><button class="texto" id="ghostCamera">Cámara con guía</button></div><div id="careList"></div><div id="quickPhotos"></div><div id="weatherCard"></div></article>');
  details.insertAdjacentHTML("afterend", '<section id="completedRituals" hidden><div class="section-heading compact"><div><span class="eyebrow">LISTO POR HOY</span><h2>Cuidados terminados</h2></div><span aria-hidden="true">♡</span></div><div id="completedRitualList" class="ritual-grid"></div></section>');
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
  $("#app").insertAdjacentHTML("beforeend", '<section id="vista-comparar" class="vista"><div class="titulo-vista"><h1>Tu piel, <em>en perspectiva.</em></h1><p>Compará el mismo ángulo con luz y distancia parecidas. No es un diagnóstico.</p></div><div id="comparePanel"></div></section>');
  $("#quickPhoto").onclick = () => $("#fotoInput").click();
  $("#freeCare").onclick = () => A.action(() => careForm());
  $("#ghostCamera").onclick = () => A.action(cameraForm);
  $("#extraDialog").addEventListener("submit", e => { e.preventDefault(); const form = e.target, data = new FormData(form); A.action(async () => {
    const b = form.querySelector('[type="submit"]'); if(b) b.disabled = true;
    try {
      if(dialogOwner !== A.owner()) throw Error("La cuenta cambió. Cerrá esta ventana y volvé a abrirla.");
      if(form.id === "careForm") {
        const name = String(data.get("name")).trim(); if(!name) throw Error("Dale un nombre a este cuidado.");
        await A.mutate(r => {
          r.sesiones ||= {}; r.sesiones.cuidados ||= [];
          const previous = r.sesiones.cuidados.find(x => x.id === form.dataset.edit) || {};
          const entry = {...previous,id:form.dataset.edit || crypto.randomUUID(),nombre:name,hora:data.get("time"),productos:data.getAll("product").map(id => ({id,nombre:form.querySelector(`[value="${id}"]`).dataset.name})),notas:String(data.get("notes")),estado:"terminada"};
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
  shownPeriod = dateISO() + period.key;
  const holder = $("#currentCare"), grid = document.querySelector("#moreDetails .ritual-grid"), completed = $("#completedRituals"), completedList = $("#completedRitualList");
  grid.append(morningCard, nightCard);
  holder.replaceChildren();
  completedList.replaceChildren();
  const finishedCards = [["mañana", morningCard], ["noche", nightCard]].filter(([moment]) => r.sesiones?.[moment]?.estado === "terminada");
  finishedCards.forEach(([, card]) => completedList.append(card));
  completed.hidden = finishedCards.length === 0;
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
  $("#quickRoutine").innerHTML = routines.length ? `<label class="campo-label" for="usualRoutine">Mi rutina habitual</label><select id="usualRoutine">${routines.map(x => option(x.id,x.nombre)).join("")}</select><button id="didRoutine" class="boton">Hice esta rutina · registrar ahora</button><p class="fineprint">Este botón confirma todos sus pasos. Para cambiar productos u hora, editá el cuidado.</p>` : '<p>Elegí qué cuidado querés hacer. No hay una mañana ni una noche obligatorias.</p><button class="texto" data-new-routine="cualquiera">+ Crear mi rutina habitual</button>';
  if($("#usualRoutine")) {
    if(routines.some(x => x.id === selected)) $("#usualRoutine").value = selected;
    $("#didRoutine").onclick = () => { const id = $("#usualRoutine").value, date = A.date(); A.action(async () => {
      if(date !== dateISO()) return careForm(null,id);
      const routine = routines.find(x => x.id === id), ps = await A.all("productos");
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
  $("#weatherCard").innerHTML = `<details><summary>Clima automático · opcional</summary><p class="ayuda">Con tu permiso, enviamos ubicación aproximada a Open-Meteo. No guardamos coordenadas. Se consulta al abrir el día actual; no funciona en segundo plano.</p>${weather ? `<p>${esc(r.temperatura)} °C · ${esc(r.humedad)} % humedad<br><small>${esc(weather.hora)} · estimación del modelo, no sensor local</small></p>` : '<p class="ayuda">Sin dato registrado. No completamos días pasados con el clima de hoy.</p>'}<button class="texto" id="weatherEnable">${localStorage.getItem("scar-weather") === "yes" ? "Actualizar clima" : "Activar clima automático"}</button> <button class="texto" id="weatherDisable">Desactivar</button><p id="weatherError" role="status"></p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Datos: Open-Meteo</a></details>`;
  $("#weatherEnable").onclick = () => {localStorage.setItem("scar-weather","yes");weatherFetch();};
  $("#weatherDisable").onclick = () => {localStorage.removeItem("scar-weather");A.toast("Clima automático desactivado.");};
  if(localStorage.getItem("scar-weather") === "yes" && !weather && A.date()===dateISO() && weatherAttempt !== A.owner()+A.date()) weatherFetch();
}
async function careForm(id, routineId, defaultName = "") {
  const date = A.date(), r = await A.record(date), ps=(await A.all("productos")).filter(p=>!p.eliminado);
  let c = r.sesiones?.cuidados?.find(x=>x.id===id) || {nombre:defaultName};
  if(routineId) { const routine=(await A.all("rutinas")).find(x=>x.id===routineId);c={nombre:routine.nombre,productos:ps.filter(p=>routine.productos.includes(p.id))}; }
  dialog(id ? "Editar cuidado" : "Un cuidado a tu manera", `<form id="careForm" data-date="${date}" data-edit="${esc(id || "")}"><label class="campo-label">Nombre<input name="name" required maxlength="180" placeholder="Mañana, tarde, mascarilla…" value="${esc(c.nombre || "")}"></label><label class="campo-label">Hora<input name="time" type="time" value="${esc(c.hora || (date===dateISO()?time():""))}"></label><p>Productos usados · opcional</p>${ps.map(p=>`<label class="check"><input name="product" type="checkbox" value="${p.id}" data-name="${esc(p.nombre)}" ${c.productos?.some(x=>x.id===p.id)?"checked":""}>${esc(p.nombre)}</label>`).join("")}<label class="campo-label">Notas<textarea name="notes">${esc(c.notas || "")}</textarea></label><button class="boton" type="submit">Guardar cuidado</button></form>`);
}
export async function daySheet(date) {
  const r = await A.record(date), ss=await A.all("sintomas"), ps=await A.all("productos"), cs=await A.all("ciclos");
  const name = id => ss.find(s=>s.id===id)?.nombre || "Síntoma archivado";
  const intens = n => n==null?"Sin intensidad":["Ausente","Leve","Moderada","Fuerte"][n];
  dialog(`Tu día · ${date}`, `<button class="boton secundario" id="editSheet">Editar este día</button><h3>Cuidados</h3>${["mañana","noche"].map(m=>{const s=r.sesiones?.[m],used=r.productosUsados?.[m]||[];return s||used.length?`<p><strong>${esc(s?.nombre || m)}</strong> · ${esc(s?.hora || "Sin hora")} · ${esc(s?.estado || "Registrado")}<br>${used.map(id=>esc(ps.find(p=>p.id===id)?.nombre || "Producto archivado")).join(" · ")}</p>`:"";}).join("")}${(r.sesiones?.cuidados || []).map(c=>`<p><strong>${esc(c.nombre)}</strong> · ${esc(c.hora || "Sin hora")}<br>${(c.productos || []).map(p=>esc(p.nombre)).join(" · ")}<br>${esc(c.notas || "")}</p>`).join("")}<h3>Piel y contexto</h3><dl>${Object.entries(labels).map(([k,n])=>`<dt>${n}</dt><dd>${r[k]==null||r[k]===""?"Sin registrar":esc(typeof r[k]==="boolean"?(r[k]?"Sí":"No"):r[k])}</dd>`).join("")}</dl><h3>Sensaciones y zonas</h3>${(r.sintomas||[]).map(id=>`<p>${esc(name(id))} · ${intens(r.intensidades?.[id])}</p>`).join("")}${(r.zonas||[]).map(z=>`<p><strong>${esc(A.zoneName(z.zona_id))}</strong> · ${z.sintoma_id?esc(name(z.sintoma_id)):"Sin síntoma asociado"} · ${intens(z.intensidad)}<br>${esc(z.notas||"")}</p>`).join("")}<p>Etiquetas: ${esc((r.etiquetas_libres||[]).join(", ") || "Sin registrar")}</p><h3>Ciclo</h3><p>${esc(cycleInfo(cs,date,r.sangrado).title)}</p><h3>Fotos</h3><div class="sheet-photos">${(r.fotos||[]).map((f,i)=>`<figure><img id="sheetPhoto${i}" alt="${esc(f.angulo||"Sin ángulo")}"><figcaption>${esc(f.angulo||"Sin ángulo")}</figcaption></figure>`).join("") || "No hay fotos de este día."}</div>`);
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
  const regs=(await A.all("registros")).filter(r=>!r.eliminado&&r.fecha<cameraDate&&r.fotos?.length).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  dialog("Alineá tu foto", `<label>Ángulo<select id="cameraAngle">${angles.map(a=>option(a)).join("")}</select></label><label>Foto de referencia<select id="ghostDate"><option value="">Sin referencia</option>${regs.map(r=>option(r.fecha)).join("")}</select></label><label>Opacidad: <output id="opacityValue">30%</output><input id="ghostOpacity" type="range" min="0" max="100" value="30"></label><p id="ghostMessage" class="ayuda"></p><div class="camera-stage"><video id="cameraVideo" autoplay playsinline muted></video><img id="ghostImage" alt="Referencia para alinear el rostro" hidden></div><button id="startCamera" class="boton" type="button">Activar cámara frontal</button><button id="captureCamera" class="boton" type="button" disabled>Guardar foto</button><p class="fineprint">Ambas vistas están sin efecto espejo. La referencia es solo una guía: nunca se mezcla con la foto guardada.</p>`);
  if(regs.length)$("#ghostDate").value=regs[0].fecha;
  let revision=0;
  const ghost=async()=>{const token=++revision,angle=$("#cameraAngle").value,date=$("#ghostDate").value,f=regs.find(r=>r.fecha===date)?.fotos.find(f=>f.angulo===angle),img=$("#ghostImage");img.hidden=true;$("#ghostMessage").textContent=f?`Referencia: ${date} · ${angle}`:"No hay referencia de ese ángulo. Podés sacar la foto igual.";if(f){await fillPhoto(img,f);if(token===revision&&img.src)img.hidden=false;}};
  $("#cameraAngle").onchange=ghost;$("#ghostDate").onchange=ghost;
  $("#ghostOpacity").oninput=e=>{$("#ghostImage").style.opacity=Number(e.target.value)/100;$("#opacityValue").textContent=e.target.value+"%";};
  $("#startCamera").onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw Error("Abrí SCAR en Safari o Chrome por HTTPS. También podés usar + Foto.");const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1200},height:{ideal:1600}},audio:false});if(!$("#extraDialog").open || !$("#cameraVideo")){s.getTracks().forEach(t=>t.stop());return;}stream?.getTracks().forEach(t=>t.stop());stream=s;$("#cameraVideo").srcObject=s;await $("#cameraVideo").play();$("#captureCamera").disabled=false;}catch(e){$("#extraError").textContent=e.name==="NotAllowedError"?"Permití la cámara en el navegador o usá + Foto para elegir de la galería.":e.message;}};
  $("#captureCamera").onclick=()=>{const angle=$("#cameraAngle").value;A.action(async()=>{try{const v=$("#cameraVideo");if(!v.videoWidth)throw Error("Esperá a que se vea la cámara.");const c=document.createElement("canvas"),scale=Math.min(1,1200/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext("2d").drawImage(v,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,"image/jpeg",.82));if(!blob)throw Error("No se pudo capturar la foto.");if(cameraOwner!==A.owner())throw Error("Cambió la cuenta. Volvé a abrir la cámara.");await A.mutate(r=>{r.fotos ||= [];if(r.fotos.length>=3)throw Error("Ya tenés 3 fotos. Quitá una antes de agregar otra.");r.fotos.push({id:crypto.randomUUID(),blob,angulo:angle});},true,cameraDate);$("#extraDialog").close();A.toast("Foto guardada sin la superposición.");}catch(e){$("#extraError").textContent=e.message;}});};
  await ghost();
}
