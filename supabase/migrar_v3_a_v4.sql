-- SCAR V4: migración desde el esquema V3 adjunto. No elimina datos personales.
-- Ejecutar solo si ya existen las tablas V3. Para una base vacía: instalar_scar.sql.
begin;
do $$ begin
 if to_regclass('public.registros') is null or not exists (
 select 1 from information_schema.columns where table_schema='public' and table_name='registros' and column_name='rutina_manana_id') then
 raise exception 'Se requiere el esquema SCAR V3. En una base vacía usar instalar_scar.sql.';
 end if;
end $$;

alter table public.registros drop constraint if exists registro_rutina_manana_usuario_fk;
alter table public.registros add constraint registro_rutina_manana_usuario_fk
 foreign key(rutina_manana_id,user_id) references public.rutinas(id,user_id) on delete set null (rutina_manana_id);
alter table public.registros drop constraint if exists registro_rutina_noche_usuario_fk;
alter table public.registros add constraint registro_rutina_noche_usuario_fk
 foreign key(rutina_noche_id,user_id) references public.rutinas(id,user_id) on delete set null (rutina_noche_id);
drop index if exists public.registros_user_fecha_idx;
drop index if exists public.productos_nombre_unico;
create index if not exists productos_busqueda_nombre on public.productos(user_id,lower(nombre));
alter table public.profiles add column if not exists zona_horaria text not null default 'America/Asuncion';
alter table public.registros add column if not exists sesiones jsonb not null default '{}';
alter table public.registros add column if not exists etiquetas_libres text[] not null default '{}';
alter table public.registros add column if not exists sangrado text check (sangrado in ('ninguno','leve','moderado','abundante'));

-- Cada envase conserva su compra, apertura y vencimiento, aunque se repita el producto.
create table if not exists public.envases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 producto_id uuid not null references public.productos(id),
 fecha_compra date, fecha_apertura date, fecha_vencimiento date,
 meses_pao integer check(meses_pao>0), precio numeric(12,2) check(precio>=0),
 moneda text not null default 'PYG' check(moneda in ('PYG','USD','BRL','ARS')),
 estado text not null default 'nuevo' check(estado in ('nuevo','en uso','casi terminado','terminado')),
 notas text, eliminado boolean not null default false, eliminado_en timestamptz,
 creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
 check(fecha_apertura is null or fecha_compra is null or fecha_apertura>=fecha_compra)
);
alter table public.envases enable row level security;
drop policy if exists "envases propios" on public.envases;
create policy "envases propios" on public.envases for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.productos p where p.id=producto_id and p.user_id=auth.uid()));
create index if not exists envases_usuario_producto on public.envases(user_id,producto_id);
insert into public.envases(id,user_id,producto_id,fecha_compra,fecha_apertura,meses_pao,precio,moneda,estado)
 select id,user_id,id,fecha_compra,fecha_apertura,meses_pao,precio,coalesce(moneda,'PYG'),estado_inventario from public.productos
 where fecha_compra is not null or fecha_apertura is not null or precio is not null
 on conflict(id) do nothing;

-- Versiones para detectar ediciones simultáneas y borrados persistentes.
create or replace function public.scar_versionar() returns trigger language plpgsql set search_path='' as $$
begin
 new.actualizado_en=clock_timestamp();
 if TG_OP='UPDATE' then new.revision=old.revision+1; else new.revision=1; end if;
 if new.eliminado then new.eliminado_en=coalesce(new.eliminado_en,clock_timestamp()); else new.eliminado_en=null; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['productos','rutinas','registros','ciclos','sintomas','envases'] loop
 execute format('alter table public.%I add column if not exists eliminado boolean not null default false',t);
 execute format('alter table public.%I add column if not exists eliminado_en timestamptz',t);
 execute format('alter table public.%I add column if not exists actualizado_en timestamptz not null default now()',t);
 execute format('alter table public.%I add column if not exists revision bigint not null default 1',t);
 execute format('drop trigger if exists scar_revision on public.%I',t);
 execute format('create trigger scar_revision before insert or update on public.%I for each row execute function public.scar_versionar()',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 -- La aplicación archiva. Evitar borrados físicos que no pueden sincronizarse.
 execute format('revoke delete,truncate,references,trigger on public.%I from authenticated,anon',t);
 end loop;
end $$;

-- No rechazar datos existentes: las nuevas escrituras sí deben tener un nombre útil.
do $$ declare t text; begin
 foreach t in array array['productos','rutinas','sintomas'] loop
 if not exists(select 1 from pg_constraint where conname='scar_nombre_no_vacio_'||t) then
 execute format('alter table public.%I add constraint %I check(length(btrim(nombre)) between 1 and 180) not valid',t,'scar_nombre_no_vacio_'||t);
 end if;
 end loop;
end $$;

alter table public.ciclos drop constraint if exists ciclos_sin_solapar;
alter table public.ciclos add constraint ciclos_sin_solapar exclude using gist
 (user_id with =,daterange(fecha_inicio,fecha_fin,'[]') with &&) where (not eliminado);
create or replace function public.validar_fecha_ciclo() returns trigger language plpgsql set search_path='' as $$
declare hoy date; zona text; begin
 select zona_horaria into zona from public.profiles where id=new.user_id;
 hoy=(now() at time zone coalesce(zona,'America/Asuncion'))::date;
 if new.fecha_inicio>hoy or new.fecha_fin>hoy then raise exception 'El período no puede tener fechas futuras'; end if;
 return new;
end $$;

-- Misma firma de vista que V3. El último ciclo continúa hasta un inicio real.
create or replace view public.vista_dias_ciclo with(security_invoker=true) as
with ordenados as (
 select c.*,lead(fecha_inicio) over(partition by user_id order by fecha_inicio) siguiente
 from public.ciclos c where not c.eliminado
), estimados as (
 select c.*,coalesce((select round(avg(d.siguiente-d.fecha_inicio))::integer from
 (select x.fecha_inicio,x.siguiente from ordenados x where x.user_id=c.user_id and x.siguiente<=c.fecha_inicio
 order by x.fecha_inicio desc limit 6) d),28) duracion,
 not exists(select 1 from ordenados x where x.user_id=c.user_id and x.siguiente<=c.fecha_inicio) referencia
 from ordenados c
)
select r.id registro_id,r.user_id,r.fecha,c.id ciclo_id,(r.fecha-c.fecha_inicio)+1 dia_del_ciclo,
 coalesce(c.siguiente-c.fecha_inicio,c.duracion) duracion_ciclo_referencia,
 (c.siguiente is null and c.referencia) usa_referencia_28,
 case
 when r.sangrado in ('leve','moderado','abundante') then 'menstrual'
 when r.sangrado is null and c.fecha_fin is not null and r.fecha<=c.fecha_fin then 'menstrual'
 when r.fecha=c.fecha_inicio and r.sangrado is null then 'menstrual'
 when c.fecha_fin is null and r.sangrado is null then 'fin de sangrado pendiente'
 when c.siguiente is null and (c.referencia or r.fecha>=c.fecha_inicio+c.duracion) then 'fase indeterminada'
 when r.fecha between coalesce(c.siguiente,c.fecha_inicio+c.duracion)-16 and coalesce(c.siguiente,c.fecha_inicio+c.duracion)-12 then 'ovulación estimada'
 when r.fecha>coalesce(c.siguiente,c.fecha_inicio+c.duracion)-12 then 'lútea estimada'
 else 'folicular estimada' end fase
from public.registros r join estimados c on c.user_id=r.user_id and r.fecha>=c.fecha_inicio
 and (c.siguiente is null or r.fecha<c.siguiente) where not r.eliminado;

create or replace view public.vista_envases_vencimiento with(security_invoker=true) as
select e.*,least(e.fecha_vencimiento,(e.fecha_apertura+make_interval(months=>e.meses_pao))::date) vence_aprox
from public.envases e where not e.eliminado;
grant select on public.vista_envases_vencimiento to authenticated;

-- Mantener la revisión del padre al modificar sus relaciones por API o SQL.
create or replace function public.scar_tocar_padre() returns trigger language plpgsql set search_path='' as $$
declare d jsonb; a uuid; b uuid; begin
 if TG_OP<>'DELETE' then d=to_jsonb(new); a=(d->>TG_ARGV[1])::uuid; end if;
 if TG_OP<>'INSERT' then d=to_jsonb(old); b=(d->>TG_ARGV[1])::uuid; end if;
 execute format('update public.%I set actualizado_en=clock_timestamp() where id=$1 or id=$2',TG_ARGV[0]) using a,b;
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['registro_productos','registro_sintomas','registro_zonas','registro_etiquetas','fotos'] loop
 execute format('drop trigger if exists scar_padre on public.%I',t);
 execute format('create trigger scar_padre after insert or update or delete on public.%I for each row execute function public.scar_tocar_padre(''registros'',''registro_id'')',t);
 end loop;
 drop trigger if exists scar_padre on public.rutina_productos;
 create trigger scar_padre after insert or update or delete on public.rutina_productos for each row execute function public.scar_tocar_padre('rutinas','rutina_id');
end $$;

-- Cola persistente: primero quitar el archivo por Storage API; luego quitar la tarea.
create table if not exists public.fotos_por_borrar(
 user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null, creado_en timestamptz not null default now(), primary key(user_id,storage_path)
);
alter table public.fotos_por_borrar enable row level security;
drop policy if exists "limpieza propia" on public.fotos_por_borrar;
create policy "limpieza propia" on public.fotos_por_borrar for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid() and split_part(storage_path,'/',1)=auth.uid()::text);
grant select,insert,delete on public.fotos_por_borrar to authenticated;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='scar_foto_ruta_propia') then
 alter table public.fotos add constraint scar_foto_ruta_propia check(split_part(storage_path,'/',1)=user_id::text) not valid;
 end if;
end $$;
create unique index if not exists scar_fotos_ruta_unica on public.fotos(storage_path);
update storage.buckets set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='fotos';

-- Escritura atómica con bloqueo por entidad y control de revisión.
-- Los permisos de quien llama y todas las políticas RLS permanecen activos.
create or replace function public.scar_guardar(p_tabla text,p_datos jsonb,p_revision bigint default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); ident uuid; actual jsonb; v bigint; datos jsonb; campos text; valores text; cambios text;
 k text; permitido text[]; item jsonb; pid uuid; arr jsonb; final_revision bigint;
begin
 if uid is null then raise exception 'Iniciá sesión'; end if;
 if p_revision is null or p_revision<0 then raise exception 'Revisión inválida'; end if;
 if p_tabla not in ('productos','rutinas','registros','ciclos','sintomas','envases') then raise exception 'Tabla no permitida'; end if;
 ident=(p_datos->>'id')::uuid;
 if ident is null then raise exception 'Falta id'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_tabla||case when p_tabla='registros' then p_datos->>'fecha' else ident::text end,0));
 if p_tabla='registros' then
 select to_jsonb(r) into actual from public.registros r where user_id=uid and fecha=(p_datos->>'fecha')::date for update;
 else
 execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',p_tabla) into actual using ident,uid;
 end if;
 v=coalesce((actual->>'revision')::bigint,0);
 if v<>p_revision then return jsonb_build_object('conflict',true,'revision',v,'id',actual->>'id'); end if;
 if actual is not null then ident=(actual->>'id')::uuid; end if;
 permitido=case p_tabla
 when 'productos' then array['nombre','marca','categoria','momento','notas','activo','favorito','puntaje','recompraria','en_prueba','fecha_inicio_prueba','fecha_fin_prueba','eliminado']
 when 'rutinas' then array['nombre','momento','descripcion','activa','eliminado']
 when 'registros' then array['fecha','rutina_manana_id','rutina_noche_id','estado_piel','horas_sueno','vasos_agua','estres','uso_protector','ejercicio','maquillaje','alcohol','viaje','mucho_calor','exposicion_sol','temperatura','humedad','notas','diario','sesiones','etiquetas_libres','sangrado','eliminado']
 when 'ciclos' then array['fecha_inicio','fecha_fin','intensidad_sangrado','notas','eliminado']
 when 'sintomas' then array['nombre','tipo','activo','eliminado']
 when 'envases' then array['producto_id','fecha_compra','fecha_apertura','fecha_vencimiento','meses_pao','precio','moneda','estado','notas','eliminado'] end;
 datos=jsonb_build_object('id',ident,'user_id',uid);
 foreach k in array permitido loop if p_datos ? k then datos=datos||jsonb_build_object(k,p_datos->k); end if; end loop;
 select string_agg(format('%I',key),','),string_agg(format('x.%I',key),','),string_agg(format('%I=excluded.%I',key,key),',')
 into campos,valores,cambios from jsonb_object_keys(datos) key;
 execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x on conflict(id) do update set %s',p_tabla,campos,valores,p_tabla,cambios) using datos;

 if p_tabla='rutinas' and p_datos ? 'productos' then
 delete from public.rutina_productos where rutina_id=ident;
 insert into public.rutina_productos(rutina_id,producto_id,orden)
 select ident,value::uuid,ordinality::integer from jsonb_array_elements_text(p_datos->'productos') with ordinality;
 end if;
 if p_tabla='registros' then
 if p_datos ? 'productos_usados' then
 delete from public.registro_productos where registro_id=ident;
 for k,arr in select * from jsonb_each(p_datos->'productos_usados') loop
 insert into public.registro_productos(registro_id,producto_id,momento) select ident,value::uuid,k from jsonb_array_elements_text(arr);
 end loop;
 end if;
 if p_datos ? 'sintomas' then
 delete from public.registro_sintomas where registro_id=ident;
 for item in select * from jsonb_array_elements(p_datos->'sintomas') loop
 insert into public.registro_sintomas(registro_id,sintoma_id,intensidad) values(ident,(item->>'id')::uuid,(item->>'intensidad')::smallint);
 end loop;
 end if;
 if p_datos ? 'zonas' then
 delete from public.registro_zonas where registro_id=ident;
 for item in select * from jsonb_array_elements(p_datos->'zonas') loop
 insert into public.registro_zonas(registro_id,zona_id,sintoma_id,intensidad,notas)
 values(ident,(item->>'zona_id')::smallint,(item->>'sintoma_id')::uuid,(item->>'intensidad')::smallint,item->>'notas');
 end loop;
 end if;
 if p_datos ? 'fotos' then
 if jsonb_array_length(p_datos->'fotos')>3 then raise exception 'Máximo 3 fotos por día'; end if;
 insert into public.fotos_por_borrar(user_id,storage_path)
 select uid,f.storage_path from public.fotos f where registro_id=ident and not exists
 (select 1 from jsonb_array_elements(p_datos->'fotos') j where j->>'storage_path'=f.storage_path) on conflict do nothing;
 delete from public.fotos f where registro_id=ident and not exists
 (select 1 from jsonb_array_elements(p_datos->'fotos') j where j->>'storage_path'=f.storage_path);
 for item in select * from jsonb_array_elements(p_datos->'fotos') loop
 if split_part(item->>'storage_path','/',1)<>uid::text then raise exception 'Ruta de foto inválida'; end if;
 insert into public.fotos(id,user_id,registro_id,storage_path,angulo,ancho,alto)
 values((item->>'id')::uuid,uid,ident,item->>'storage_path',coalesce(item->>'angulo','frente'),(item->>'ancho')::integer,(item->>'alto')::integer)
 on conflict(id) do update set angulo=excluded.angulo,ancho=excluded.ancho,alto=excluded.alto;
 end loop;
 end if;
 end if;
 execute format('select revision from public.%I where id=$1',p_tabla) into final_revision using ident;
 return jsonb_build_object('conflict',false,'id',ident,'revision',final_revision);
end $$;
revoke all on function public.scar_guardar(text,jsonb,bigint) from public,anon;
grant execute on function public.scar_guardar(text,jsonb,bigint) to authenticated;

-- Backfill para cuentas existentes; no duplica perfiles ni sobrescribe sus datos.
insert into public.profiles(id,nombre) select id,coalesce(raw_user_meta_data->>'nombre','') from auth.users on conflict(id) do nothing;
-- Solo el perfil se crea automáticamente; el inventario real lo decide la usuaria.
create or replace function public.crear_usuario_scar() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,nombre) values(new.id,coalesce(new.raw_user_meta_data->>'nombre','')) on conflict(id) do nothing; return new; end $$;
revoke execute on function public.crear_usuario_scar() from public,anon,authenticated;

comment on column public.registros.sesiones is 'Copia histórica del plan elegido y estado por mañana/noche; editar una plantilla no modifica esta copia.';
comment on view public.vista_dias_ciclo is 'Estimación orientativa. Sin inicio nuevo continúa el conteo. No confirma ovulación ni sirve para anticoncepción.';
notify pgrst,'reload schema';
commit;
