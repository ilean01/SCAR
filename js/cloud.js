import { TABLES } from "./core.js";
import { all, get, put, atomic } from "./db.js";
const jsonRead = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
};
export class Cloud {
  constructor() {
    this.config = window.SCAR_CONFIG?.supabaseUrl
      ? window.SCAR_CONFIG
      : jsonRead("scar-cloud-config") || {};
    this.listeners = [];
    this.refreshing = null;
    this.syncing = null;
  }
  get configured() {
    return !!(this.config.supabaseUrl && this.config.supabasePublishableKey);
  }
  get sessionKey() {
    return "scar-session:" + this.config.supabaseUrl;
  }
  get session() {
    return jsonRead(this.sessionKey);
  }
  get user() {
    return this.session?.user;
  }
  configure(url, key) {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      !u.hostname.endsWith(".supabase.co") ||
      u.username ||
      u.password
    )
      throw Error("Usá la URL https://…supabase.co de tu proyecto.");
    if (key.startsWith("sb_secret_"))
      throw Error("Esta es una clave secreta. Usá la clave publishable.");
    if (key.startsWith("ey")) {
      try {
        const payload = JSON.parse(
          atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        if (payload.role !== "anon") throw Error();
      } catch {
        throw Error("Usá la clave pública anon o publishable.");
      }
    } else if (!key.startsWith("sb_publishable_"))
      throw Error("La clave pública no tiene el formato esperado.");
    this.config = { supabaseUrl: u.origin, supabasePublishableKey: key };
    localStorage.setItem("scar-cloud-config", JSON.stringify(this.config));
  }
  saveSession(s) {
    if (s.access_token) {
      s.expires_at ||= Math.floor(Date.now() / 1000) + s.expires_in;
      localStorage.setItem(this.sessionKey, JSON.stringify(s));
    }
  }
  async request(
    path,
    { method = "GET", body, auth = true, headers = {} } = {},
  ) {
    if (!this.configured) throw Error("Conectá tu proyecto en Ajustes.");
    const owner = auth ? this.user?.id : null;
    let token;
    if (auth) token = await this.token();
    if (auth && this.user?.id !== owner)
      throw Error("La cuenta cambió. Volvé a sincronizar.");
    const r = await fetch(this.config.supabaseUrl + path, {
      method,
      headers: {
        apikey: this.config.supabasePublishableKey,
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body && !(body instanceof Blob)
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body: body
        ? body instanceof Blob
          ? body
          : JSON.stringify(body)
        : undefined,
      cache: "no-store",
    });
    const data = await r.json().catch(() => null);
    if (auth && this.user?.id !== owner)
      throw Error("La cuenta cambió durante la conexión.");
    if (!r.ok) {
      const e = Error(
        data?.msg ||
          data?.message ||
          data?.error_description ||
          data?.error ||
          "No se pudo conectar con la nube.",
      );
      e.status = r.status;
      e.code = data?.code;
      throw e;
    }
    return data;
  }
  async token() {
    const s = this.session;
    if (!s) throw Error("Iniciá sesión para sincronizar.");
    if (s.expires_at > Date.now() / 1000 + 60) return s.access_token;
    if (this.refreshing) return this.refreshing;
    const refresh = async () => {
      const current = this.session;
      if (current.expires_at > Date.now() / 1000 + 60)
        return current.access_token;
      const next = await this.request(
        "/auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          body: { refresh_token: current.refresh_token },
          auth: false,
        },
      );
      this.saveSession(next);
      return next.access_token;
    };
    this.refreshing = (
      navigator.locks
        ? navigator.locks.request(this.sessionKey, refresh)
        : refresh()
    ).finally(() => (this.refreshing = null));
    return this.refreshing;
  }
  async login(email, password) {
    const s = await this.request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    this.saveSession(s);
    return s;
  }
  async signup(email, password, nombre) {
    const s = await this.request("/auth/v1/signup", {
      method: "POST",
      body: { email, password, data: { nombre } },
      auth: false,
    });
    this.saveSession(s);
    return !!s.access_token;
  }
  async recover(email) {
    await this.request("/auth/v1/recover", {
      method: "POST",
      body: { email },
      auth: false,
    });
  }
  async logout() {
    if (this.syncing) await this.syncing.catch(() => {});
    try {
      await this.request("/auth/v1/logout?scope=local", { method: "POST" });
    } catch (e) {
      console.warn(
        "La sesión local se cerró; no se pudo notificar al servidor.",
      );
    } finally {
      localStorage.removeItem(this.sessionKey);
    }
  }
  async consumeCallback() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (!hash.has("access_token")) return null;
    const access_token = hash.get("access_token"),
      refresh_token = hash.get("refresh_token");
    const r = await fetch(this.config.supabaseUrl + "/auth/v1/user", {
      headers: {
        apikey: this.config.supabasePublishableKey,
        Authorization: "Bearer " + access_token,
      },
      cache: "no-store",
    });
    if (!r.ok)
      throw Error("El enlace de acceso venció. Volvé a iniciar sesión.");
    const user = await r.json();
    this.saveSession({
      access_token,
      refresh_token,
      user,
      expires_at:
        Number(hash.get("expires_at")) ||
        Date.now() / 1000 + Number(hash.get("expires_in") || 3600),
    });
    const type = hash.get("type");
    history.replaceState(null, "", location.pathname + location.search);
    return type;
  }
  async password(value) {
    await this.request("/auth/v1/user", {
      method: "PUT",
      body: { password: value },
    });
  }
  async rows(table, select = "*") {
    let result = [],
      offset = 0;
    while (true) {
      const page = await this.request(
        `/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${table === "registros" ? "fecha" : "id"}.asc&limit=500&offset=${offset}`,
      );
      result.push(...page);
      if (page.length < 500) return result;
      offset += 500;
    }
  }
  async pull(db) {
    for (const t of TABLES) {
      const select =
        t === "rutinas"
          ? "*,rutina_productos(producto_id,orden)"
          : t === "registros"
            ? "*,registro_productos(producto_id,momento),registro_sintomas(sintoma_id,intensidad),registro_zonas(zona_id,sintoma_id,intensidad,notas),fotos(*)"
            : "*";
      for (const raw of await this.rows(t, select)) {
        const row = decode(t, raw),
          key = t === "registros" ? row.fecha : row.id;
        await atomic(db, t, key, (old) => {
          if (old?.__dirty) {
            if (old.__conflict) old.__remote = row;
            return old;
          }
          if (t === "registros") row.fotos = (row.fotos || []).map(f => {
            const cached = old?.fotos?.find(x => x.id === f.id && x.storage_path === f.storage_path);
            return cached?.blob ? { ...f, blob: cached.blob } : f;
          });
          return row;
        });
      }
    }
  }
  sync(db, onStatus = () => {}) {
    if (this.syncing) return this.syncing;
    this.syncing = this._sync(db, onStatus).finally(
      () => (this.syncing = null),
    );
    return this.syncing;
  }
  async _sync(db, status) {
    if (!this.user) return;
    if (!navigator.onLine) {
      status("Sin conexión · guardado aquí");
      return;
    }
    status("Sincronizando…");
    try {
      let errors = 0;
      for (const t of TABLES) {
        for (const row of await all(db, t)) {
          if (!row.__dirty || row.__conflict) continue;
          const key = t === "registros" ? row.fecha : row.id;
          try {
            const payload = encode(t, row);
            if (t === "registros") {
              payload.fotos = [];
              for (const f of row.fotos || []) {
                const path =
                  f.storage_path || `${this.user.id}/${row.id}/${f.id}.jpg`;
                if (f.blob && !f.storage_path) {
                  await this.request("/storage/v1/object/fotos/" + path, {
                    method: "POST",
                    body: f.blob,
                    headers: {
                      "Content-Type": "image/jpeg",
                      "x-upsert": "true",
                    },
                  });
                }
                payload.fotos.push({
                  id: f.id,
                  storage_path: path,
                  angulo: f.angulo || "frente",
                });
              }
            }
            const result = await this.request(t === "rutinas" && Object.hasOwn(payload, "esperas") ? "/rest/v1/rpc/scar_guardar_v8" : t === "productos" && Object.hasOwn(payload, "programacion") ? "/rest/v1/rpc/scar_guardar_v7" : t === "productos" && Object.hasOwn(payload, "foto") ? "/rest/v1/rpc/scar_guardar_v5" : "/rest/v1/rpc/scar_guardar", {
              method: "POST",
              body: {
                p_tabla: t,
                p_datos: payload,
                p_revision: row.__version || 0,
              },
            });
            await atomic(db, t, key, (current) => {
              if (!current) return current;
              if (result.conflict) {
                current.__conflict = true;
                current.__remoteVersion = result.revision;
              } else {
                current.id = result.id;
                current.__version = result.revision;
                if (current.__dirty === row.__dirty) delete current.__dirty;
                delete current.__error;
                if (t === "registros")
                  current.fotos = (current.fotos || []).map((f) => ({
                    ...f,
                    storage_path:
                      payload.fotos.find((x) => x.id === f.id)?.storage_path ||
                      f.storage_path,
                  }));
              }
              return current;
            });
          } catch (e) {
            errors++;
            await atomic(db, t, key, (current) =>
              current ? { ...current, __error: e.message } : current,
            );
            if (!navigator.onLine) throw e;
          }
        }
      }
      await this.pull(db);
      await this.cleanup();
      const pending = (await Promise.all(TABLES.map((t) => all(db, t))))
        .flat()
        .filter((r) => r.__dirty);
      status(
        pending.some((r) => r.__conflict)
          ? "Hay cambios para revisar"
          : pending.length
            ? `${pending.length} cambio(s) pendientes`
            : "Todo guardado en la nube",
      );
      if (errors)
        console.warn("SCAR: hay cambios pendientes; revisalos en Ajustes.");
    } catch (e) {
      status(
        navigator.onLine
          ? "No se pudo sincronizar · revisá Ajustes"
          : "Sin conexión · guardado aquí",
      );
      throw e;
    }
  }
  async cleanup() {
    const tasks = await this.request(
      "/rest/v1/fotos_por_borrar?select=storage_path&limit=100",
    );
    if (!tasks.length) return;
    await this.request("/storage/v1/object/fotos", {
      method: "DELETE",
      body: { prefixes: tasks.map((x) => x.storage_path) },
    });
    for (const t of tasks)
      await this.request(
        "/rest/v1/fotos_por_borrar?storage_path=eq." +
          encodeURIComponent(t.storage_path),
        { method: "DELETE" },
      );
  }
  async photoURL(path) {
    const r = await this.request("/storage/v1/object/sign/fotos/" + path, {
      method: "POST",
      body: { expiresIn: 300 },
    });
    return this.config.supabaseUrl + "/storage/v1" + r.signedURL;
  }
}
function encode(t, r) {
  const d = { ...r };
  for (const k of Object.keys(d)) if (k.startsWith("__")) delete d[k];
  delete d.user_id;
  delete d.revision;
  if (t === "ciclos") {
    d.fecha_inicio = r.fechaInicio;
    d.fecha_fin = r.fechaFin || null;
  }
  if (t === "registros") {
    d.rutina_manana_id = r.rutinas?.mañana || null;
    d.rutina_noche_id = r.rutinas?.noche || null;
    d.productos_usados = r.productosUsados;
    d.sintomas = (r.sintomas || []).map((id) => ({
      id,
      intensidad: r.intensidades?.[id] ?? 1,
    }));
  }
  return d;
}
function decode(t, r) {
  const row = { ...r, __version: r.revision };
  if (t === "ciclos") {
    row.fechaInicio = r.fecha_inicio;
    row.fechaFin = r.fecha_fin;
  }
  if (t === "rutinas") {
    row.productos = (r.rutina_productos || [])
      .sort((a, b) => a.orden - b.orden)
      .map((x) => x.producto_id);
    delete row.rutina_productos;
  }
  if (t === "registros") {
    row.productosUsados = { mañana: [], noche: [] };
    for (const x of r.registro_productos || [])
      row.productosUsados[x.momento].push(x.producto_id);
    row.rutinas = { mañana: r.rutina_manana_id, noche: r.rutina_noche_id };
    row.sintomas = (r.registro_sintomas || []).map((x) => x.sintoma_id);
    row.intensidades = Object.fromEntries(
      (r.registro_sintomas || []).map((x) => [x.sintoma_id, x.intensidad]),
    );
    row.zonas = r.registro_zonas || [];
    delete row.registro_productos;
    delete row.registro_sintomas;
    delete row.registro_zonas;
  }
  return row;
}
