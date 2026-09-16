import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import assert from "node:assert/strict";
const root = new URL("..", import.meta.url).pathname;
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(`create role authenticated; create role anon;create schema auth;create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
grant usage on schema auth,storage to authenticated,anon;
grant select on auth.users to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
try {
  await db.exec(fs.readFileSync(root + "/supabase/instalar_scar.sql", "utf8"));
  console.log("PASS installer");
} catch (e) {
  console.error(e.message, e.detail, e.where);
  process.exit(1);
}
const uid = "00000000-0000-4000-8000-000000000001",
  uid2 = "00000000-0000-4000-8000-000000000002";
await db.query("insert into auth.users(id) values($1),($2)", [uid, uid2]);
await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid}'`);
const save = async (t, d, v = 0) =>
  (await db.query("select public.scar_guardar($1,$2,$3) result", [t, d, v]))
    .rows[0].result;
const p = "10000000-0000-4000-8000-000000000001",
  rut = "20000000-0000-4000-8000-000000000001",
  reg = "30000000-0000-4000-8000-000000000001",
  sym = "40000000-0000-4000-8000-000000000001";
try {
  assert.equal(
    (await save("productos", { id: p, nombre: "Crema", momento: "ambos" }))
      .conflict,
    false,
  );
  assert.equal(
    (await save("sintomas", { id: sym, nombre: "Rojez", tipo: "piel" }))
      .conflict,
    false,
  );
  const routine = await save("rutinas", {
    id: rut,
    nombre: "Suave",
    momento: "noche",
    productos: [p],
  });
  assert.equal(routine.conflict, false);
  const first = await save("registros", {
    id: reg,
    fecha: "2026-08-01",
    rutina_noche_id: rut,
    productos_usados: { mañana: [], noche: [p] },
    sintomas: [{ id: sym, intensidad: 2 }],
    zonas: [{ zona_id: 5, sintoma_id: null, notas: "Una nota" }],
    fotos: [],
    sesiones: {
      noche: {
        nombre: "Suave",
        plan: [{ id: p, nombre: "Crema" }],
        estado: "terminada",
      },
    },
  });
  assert.equal(first.conflict, false);
  console.log("PASS atomic parent/relations and nullable zone");
  assert.equal(
    (
      await save(
        "registros",
        { id: reg, fecha: "2026-08-01", notas: "stale" },
        0,
      )
    ).conflict,
    true,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.registro_productos"))
      .rows[0].n,
    1,
  );
  console.log("PASS stale writes do not delete child rows");
  await db.exec(`set request.jwt.claim.sub='${uid2}'`);
  assert.equal(
    (await db.query("select * from public.registros")).rows.length,
    0,
  );
  await assert.rejects(
    save("rutinas", {
      id: "20000000-0000-4000-8000-000000000002",
      nombre: "Ajena",
      productos: [p],
    }),
  );
  assert.equal((await db.query("select * from public.rutinas")).rows.length, 0);
  console.log("PASS cross-user read/write isolation and rollback");
  await db.exec(`set request.jwt.claim.sub='${uid}'`);
  await assert.rejects(
    db.query("delete from public.productos where id=$1", [p]),
  );
  const cyc = "50000000-0000-4000-8000-000000000001";
  await save("ciclos", {
    id: cyc,
    fecha_inicio: "2026-08-01",
    fecha_fin: "2026-08-05",
  });
  await save("registros", {
    id: "30000000-0000-4000-8000-000000000002",
    fecha: "2026-08-29",
  });
  assert.equal(
    (
      await db.query(
        "select dia_del_ciclo from public.vista_dias_ciclo where fecha='2026-08-29'",
      )
    ).rows[0].dia_del_ciclo,
    29,
  );
  console.log("PASS day 29 preserved");
  await db.exec("reset role");
  await db.query("delete from public.rutinas where id=$1", [rut]);
  assert.equal(
    (
      await db.query(
        "select user_id,rutina_noche_id from public.registros where id=$1",
        [reg],
      )
    ).rows[0].user_id,
    uid,
  );
  console.log("PASS routine deletion keeps user_id");
  await db.exec(fs.readFileSync(root + "/supabase/migrar_v3_a_v4.sql", "utf8"));
  console.log("PASS migration is repeatable");
  const v5 = fs.readFileSync(root + "/supabase/migrar_v4_a_v5.sql", "utf8");
  await db.exec(v5);
  await db.exec(v5);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid}'`);
  const product5 = "10000000-0000-4000-8000-000000000005";
  await db.query("select public.scar_guardar_v5($1,$2,0)", ["productos", {id:product5,nombre:"Foto privada",foto:"data:image/jpeg;base64,YWJj"}]);
  assert.equal((await db.query("select foto from public.productos where id=$1", [product5])).rows[0].foto, "data:image/jpeg;base64,YWJj");
  await assert.rejects(db.query("select public.scar_guardar_v5($1,$2,0)", ["productos", {id:"10000000-0000-4000-8000-000000000006",nombre:"URL no permitida",foto:"https://example.com/a.jpg"}]));
  await save("registros", {id:"30000000-0000-4000-8000-000000000005",fecha:"2026-09-10",sesiones:{cuidados:[{id:"c1",nombre:"Mascarilla",hora:"16:30",productos:[{id:product5,nombre:"Foto privada"}]}],clima:{fuente:"Open-Meteo",hora:"2026-09-10T16:30"}}});
  assert.equal((await db.query("select sesiones from public.registros where fecha='2026-09-10'")).rows[0].sesiones.cuidados[0].hora,"16:30");
  await db.exec(`set request.jwt.claim.sub='${uid2}'`);
  assert.equal((await db.query("select * from public.productos where id=$1",[product5])).rows.length,0);
  console.log("PASS V5 repeated migration, photo persistence and isolation, arbitrary timed care and weather metadata");
} catch (e) {
  console.error(e.message, e.detail, e.where);
  process.exit(1);
}
await db.close();
