const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const today = new Date().toLocaleDateString("en-CA");
(async () => {
  const server = require("http").createServer((req, res) => {
    const path = require("path"),
      fs = require("fs");
    const p = path.join(
      require("path").join(__dirname, ".."),
      decodeURIComponent(req.url.split("?")[0]) === "/"
        ? "index.html"
        : decodeURIComponent(req.url.split("?")[0]),
    );
    const types = {
      ".js": "text/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    try {
      res.setHeader("Content-Type", types[path.extname(p)] || "text/plain");
      res.end(fs.readFileSync(p));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((r) => server.listen(4173, "127.0.0.1", r));
  const browser = await chromium.launch({
    ...(process.env.SCAR_CHROMIUM
      ? { executablePath: process.env.SCAR_CHROMIUM }
      : {}),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    headless: true,
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("BROWSER", m.text());
  });
  page.on("requestfailed", (r) => console.log("REQUEST", r.url(), r.failure()));
  globalThis.debugPage = page;
  await page.goto("http://127.0.0.1:4173");
  await page.locator("[data-prod]").first().waitFor({ state: "attached" });
  await page.locator("#moreDetails > summary").click();
  await page.screenshot({
    path: require("path").join(require("os").tmpdir(), "scar-desktop.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: require("path").join(require("os").tmpdir(), "scar-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  // Selecting a routine must not claim it was performed.
  await page.locator('[data-new-routine="mañana"]').click();
  await page.locator("#modal [name=nombre]").fill("Mañana suave");
  await page.locator("#modal [name=productos]").first().check();
  await page.locator("#modal button[type=submit]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  await page.selectOption("#rutinaManana", { label: "Mañana suave" });
  assert.equal(await page.locator("#productosManana input:checked").count(), 0);
  await page.locator("#productosManana input").first().check();
  await page.locator('[data-finish="mañana"]').click();
  await page.waitForFunction(() =>
    document.querySelector("#estadoManana").textContent.includes("terminado"),
  );
  await page.locator("#notasHoy").fill("Mi nota se conserva ♡");
  await page.locator('[data-mood="4"]').click();
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#notasHoy").value === "Mi nota se conserva ♡",
  );
  assert.equal(await page.locator("#productosManana input:checked").count(), 1);
  // Calendar opens the actual historical date.
  await page.locator(".barra [data-nav=calendario]").click();
  await page.locator("[data-date]").first().click();
  await page.locator("#editSheet").click();
  await page.waitForFunction(() =>
    document.querySelector("#fechaActual").value.endsWith("-01"),
  );
  assert.equal(await page.locator("#notasHoy").inputValue(), "");
  await page.locator("#notasHoy").fill("Primer día");
  await page.locator("#fechaActual").fill(today);
  await page.locator("#fechaActual").dispatchEvent("change");
  await page.waitForFunction(
    () => document.querySelector("#notasHoy").value === "Mi nota se conserva ♡",
  );
  // Product edit and archive submitter are functional, no hard deletion.
  await page.locator(".barra [data-nav=productos]").click();
  await page.locator("#nuevoProducto").click();
  await page.locator("#modal [name=nombre]").fill("Mi sérum");
  await page.locator("#modal [name=marca]").fill("Marca de prueba");
  await page.locator("#modal button[type=submit]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  const card = page
    .locator(".product")
    .filter({ has: page.locator("h3", { hasText: "Mi sérum" }) });
  await card.locator("[data-edit-product]").click();
  await page.locator("[data-archive-product]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".product h3").filter({ hasText: "Mi sérum" }).count(),
    0,
  );
  // Modal cancellation and face note without symptom.
  await page.locator(".barra [data-nav=hoy]").click();
  await page.locator("#registrarZona").click();
  await page.locator("#modal [name=notas]").fill("Un poquito seca");
  await page.locator("#modal button[type=submit]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  assert.match(await page.locator("#zonasHoy").textContent(), /seca/);
  await page
    .locator("#fotoInput")
    .setInputFiles(require("path").join(__dirname, "../assets/icon-192.png"));
  await page.locator("#modal button[type=submit]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#fotosHoy img").count(), 1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator("[data-prod]").first().waitFor({ state: "attached" });
  await context.setOffline(true);
  await page.reload();
  await page.locator("[data-prod]").first().waitFor({ state: "attached" });
  await page.locator("#moreDetails > summary").click();
  await page.locator("#notasHoy").fill("Guardado sin internet");
  await page.locator('[data-mood="3"]').click();
  await context.setOffline(false);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#notasHoy").value === "Guardado sin internet",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS responsive layout, routine semantics, durable notes, historical navigation, archive, zones, photos and offline reload",
  );
  const cloudState = {};
  let active = "00000000-0000-4000-8000-000000000001";
  let tokens = 0;
  const getState = () =>
    (cloudState[active] ||= Object.fromEntries(
      [
        "productos",
        "sintomas",
        "rutinas",
        "envases",
        "ciclos",
        "registros",
      ].map((t) => [t, []]),
    ));
  await context.route("https://scar-test.supabase.co/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      data = req.postDataJSON();
    let result;
    if (u.pathname === "/auth/v1/token") {
      if (data?.email)
        active =
          data.email === "a@test.com"
            ? "00000000-0000-4000-8000-000000000001"
            : "00000000-0000-4000-8000-000000000002";
      tokens++;
      result = {
        access_token: "token-" + active,
        refresh_token: "refresh-" + active,
        expires_in: 3600,
        user: { id: active, email: data?.email || "a@test.com" },
      };
    } else if (u.pathname === "/auth/v1/logout") result = {};
    else if (u.pathname === "/rest/v1/rpc/scar_guardar") {
      const { p_tabla: t, p_datos: d, p_revision: v } = data;
      const rows = getState()[t];
      let old = rows.find((r) =>
        t === "registros" ? r.fecha === d.fecha : r.id === d.id,
      );
      if ((old?.revision || 0) !== v)
        result = { conflict: true, revision: old.revision, id: old.id };
      else {
        const r = {
          ...old,
          ...d,
          id: old?.id || d.id,
          user_id: active,
          revision: (old?.revision || 0) + 1,
        };
        if (t === "rutinas")
          r.rutina_productos = (d.productos || []).map((id, i) => ({
            producto_id: id,
            orden: i,
          }));
        if (t === "registros") {
          r.registro_productos = Object.entries(
            d.productos_usados || {},
          ).flatMap(([m, ids]) =>
            ids.map((id) => ({ momento: m, producto_id: id })),
          );
          r.registro_sintomas = (d.sintomas || []).map((s) => ({
            sintoma_id: s.id,
            intensidad: s.intensidad,
          }));
          r.registro_zonas = d.zonas || [];
        }
        if (old) rows[rows.indexOf(old)] = r;
        else rows.push(r);
        result = { conflict: false, id: r.id, revision: r.revision };
      }
    } else if (u.pathname === "/rest/v1/fotos_por_borrar") result = [];
    else if (u.pathname.startsWith("/rest/v1/")) {
      const t = u.pathname.split("/").at(-1);
      result = getState()[t] || [];
    } else if (u.pathname.startsWith("/storage/")) result = {};
    else result = {};
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.locator(".barra [data-nav=ajustes]").click();
  await page
    .locator("#configForm [name=url]")
    .fill("https://scar-test.supabase.co");
  await page.locator("#configForm [name=key]").fill("sb_publishable_test");
  await page.locator("#configForm button[type=submit]").click();
  // Wait for the async settings render before filling the new account form.
  await page.waitForFunction(() => !document.querySelector("#authForm button[value=login]").disabled);
  await page.locator("#authForm [name=email]").fill("a@test.com");
  await page.locator("#authForm [name=password]").fill("test-password");
  await page.locator("#authForm button[value=login]").click();
  await page.locator("#logout").waitFor();
  await page.locator(".barra [data-nav=hoy]").click();
  await page.waitForFunction(
    () => document.querySelector("#notasHoy").value === "",
  );
  await page.locator("#moreDetails > summary").click();
  await page.locator("#notasHoy").fill("Cuenta A en la nube");
  await page.locator(".barra [data-nav=ajustes]").click();
  await page.locator("#syncNow").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#syncStatus").textContent ===
      "Todo guardado en la nube",
  );
  assert.equal(getState().registros[0].notas, "Cuenta A en la nube");
  // Simulate an edit on a second device, then choose the local version explicitly.
  const conflictProduct = getState().productos[0];
  conflictProduct.nombre = "Versión de otro dispositivo";
  conflictProduct.revision++;
  await page.locator(".barra [data-nav=productos]").click();
  await page.locator("[data-edit-product]").first().click();
  await page.locator("#modal [name=nombre]").fill("Mi versión local");
  await page.locator("#modal button[type=submit]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  await page.locator(".barra [data-nav=ajustes]").click();
  await page.locator("#syncNow").click();
  await page.locator("[data-resolve=local]").waitFor();
  await page.locator("[data-resolve=local]").click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-resolve]").length === 0,
  );
  assert.equal(getState().productos[0].nombre, "Mi versión local");
  await page.locator("#logout").click();
  await page.locator("#authForm").waitFor();
  await page.locator("#authForm [name=email]").fill("b@test.com");
  await page.locator("#authForm [name=password]").fill("test-password");
  await page.locator("#authForm button[value=login]").click();
  await page.locator("#logout").waitFor();
  await page.locator(".barra [data-nav=hoy]").click();
  await page.waitForFunction(
    () => document.querySelector("#notasHoy").value === "",
  );
  assert.equal(getState().registros.length, 0);
  console.log(
    "PASS cloud login, sync, conflict resolution and account separation (mock API)",
  );

  await browser.close();
  server.close();
})().catch(async (e) => {
  console.error(e.message);
  console.log(await globalThis.debugPage.locator("#ajustes").innerText());
  process.exit(1);
});
