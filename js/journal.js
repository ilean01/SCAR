import { dateISO, dayDiff, escapeHTML as esc } from "./core.js";

const notes = [
  "Cuidarte también es hablarte bonito.",
  "Tu piel tiene días. Tu valor no cambia.",
  "Un pequeño ritual puede ser una gran pausa.",
  "Hoy podés empezar por algo sencillo.",
  "No tenés que florecer todos los días.",
  "Tu ritmo también merece respeto.",
  "Un ratito para vos también cuenta.",
  "La constancia también deja espacio para descansar.",
  "Tu espejo no cuenta toda tu historia.",
  "Que tu rutina sea un abrazo, no una exigencia.",
  "Hay belleza en tratarte con paciencia.",
  "Hacé espacio para lo que te hace bien.",
  "Tu piel no necesita ser perfecta para recibir cariño.",
  "Hoy, un poquito de suavidad con vos.",
  "También estás creciendo cuando vas despacio.",
  "Un día distinto no borra todo lo que hiciste.",
  "El descanso también tiene lugar en tu diario.",
  "Escucharte es una forma de cuidarte.",
  "Menos apuro. Un respiro. Este momento es tuyo.",
  "Celebrá lo pequeño, incluso cuando nadie lo ve.",
  "Podés cambiar de rutina y seguir siendo constante.",
  "Tu historia merece palabras amables.",
  "No hace falta hacerlo todo para hacer algo por vos.",
  "Dejá que hoy tenga su propio ritmo.",
  "El cariño también está en los pequeños gestos.",
  "Habláte como le hablarías a alguien que querés.",
  "Cuidarte empieza por darte permiso.",
  "Una pausa, una respiración, un nuevo comienzo.",
  "No te compares: estás escribiendo tu propia historia.",
  "Tu mejor ritual es el que se siente tuyo.",
  "Siempre hay lugar para un poquito de amor propio.",
];
let noteDay, noteOffset = 0;
export function renderNote(next = false) {
  const today = dateISO();
  if (noteDay !== today) {
    noteDay = today;
    noteOffset = 0;
  }
  if (next) noteOffset++;
  const index = ((dayDiff(today, "2026-01-01") + noteOffset) % notes.length + notes.length) % notes.length;
  document.querySelector("#dailyQuote").textContent = `“${notes[index]}”`;
}

const stickerPaths = {
  bow: '<path d="M49 42C16 1 6 30 20 44c9 7 20 4 29-2Zm2 0C84 1 94 30 80 44c-9 7-20 4-29-2Z" fill="#e8b5c7"/><path d="M46 44 29 80l16-6 6 9 3-37M56 44l17 36-16-6-5 9-3-37" fill="#f2d4df"/><ellipse cx="50" cy="42" rx="8" ry="9" fill="#c98fa7"/>',
  flower: '<g fill="#ead6b9"><ellipse cx="50" cy="28" rx="13" ry="21"/><ellipse cx="50" cy="72" rx="13" ry="21"/><ellipse cx="28" cy="50" rx="21" ry="13"/><ellipse cx="72" cy="50" rx="21" ry="13"/></g><circle cx="50" cy="50" r="14" fill="#ad798c"/>',
  heart: '<path d="M50 83 17 51C-3 29 26 5 50 30 74 5 103 29 83 51Z" fill="#ddb3c2"/><path d="M21 32q3-12 15-8" fill="none" stroke="#fff9f4" stroke-width="5" stroke-linecap="round"/>',
};
export function stickers() {
  document.querySelectorAll("[data-sticker]").forEach(el => {
    el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${stickerPaths[el.dataset.sticker] || stickerPaths.flower}</svg>`;
  });
}

function face(side) {
  const drawing = side === "front"
    ? '<path d="M32 75v12m36-12v12M22 42c-6-2-5 16 2 16m52-16c6-2 5 16-2 16"/><ellipse cx="50" cy="45" rx="26" ry="34"/><path d="M25 33q7-27 25-22 21-3 25 22M34 42h5m22 0h5M50 44l-3 12h6M41 65q9 6 18 0M18 99q1-13 16-13m32 0q15 0 16 13"/>'
    : '<path d="M34 87V71C10 56 15 20 35 13 59 2 76 21 71 38l10 15-10 4v9q-2 12-18 11v10M17 99q1-12 17-12m19 0q20-2 24 12M64 41h5m0 22h-7M44 48c-11-12-14 9-2 11M19 35q24-4 27-24"/>';
  return `<svg viewBox="0 0 100 105" aria-hidden="true"><g fill="#f8ece7" stroke="#966e7c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${side === "left" ? 'transform="translate(100 0) scale(-1 1)"' : ""}>${drawing}</g></svg>`;
}
export function photoGuide() {
  return `<div class="angle-guide">
    <p class="ayuda">Tres vistas para volver a mirarte con la misma luz.</p>
    <div class="angle-grid">${[
      ["front", "Frente", "0° · Mirá a la cámara"],
      ["left", "Lado izquierdo", "Girá y mostrá tu mejilla izquierda"],
      ["right", "Lado derecho", "Girá y mostrá tu mejilla derecha"],
    ].map(([side, label, hint]) => `<figure>${face(side)}<figcaption><strong>${label}</strong><small>${hint}</small></figcaption></figure>`).join("")}</div>
    <p class="ayuda">Para los lados, girá la cabeza unos <strong>45–90°</strong>. Elegí un ángulo cómodo y repetilo en las próximas fotos. Izquierda y derecha son las de tu rostro; la cámara puede mostrar una vista en espejo.</p>
    <ul class="photo-tips"><li>Luz natural de frente, sin sol directo ni flash.</li><li>Celular a la altura de los ojos, a la misma distancia cada vez.</li><li>Pelo apartado, expresión relajada y sin filtros. Si podés, sin maquillaje.</li></ul>
    <p class="fineprint">No hace falta sacar las tres ni fotografiarte todos los días. Para borrar una foto guardada, tocá su ×.</p>
  </div>`;
}

export function renderCycleRing(info, date) {
  const day = info.cycle ? dayDiff(date, info.cycle.fechaInicio) + 1 : null;
  const label = day ? `Día ${day}` : "A tu ritmo";
  // An ornamental ring: no invented cycle length or fertility arc.
  document.querySelector("#cycleRing").innerHTML = `<svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="95" fill="none" stroke="#e6d8dd" stroke-width="14"/><circle cx="110" cy="110" r="95" fill="none" stroke="#bb869b" stroke-width="14" stroke-linecap="round" stroke-dasharray="74 523" transform="rotate(-90 110 110)"/><circle cx="110" cy="110" r="78" fill="none" stroke="#dbc8d0" stroke-width="3" stroke-dasharray="1 16" stroke-linecap="round"/></svg><div class="cycle-center"><span class="eyebrow">${esc(new Date(date + "T12:00:00").toLocaleDateString("es", { day: "numeric", month: "short" }))}</span><strong>${label}</strong><span>tu cuerpo, tu tiempo</span></div>`;
}
