-- SCAR V5: ejecutar después de instalar V4. Conserva los datos existentes.
begin;
alter table public.productos add column if not exists foto text check (foto is null or (length(foto)<=400000 and foto ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));
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
 when 'productos' then array['nombre','marca','categoria','momento','notas','activo','favorito','puntaje','recompraria','en_prueba','fecha_inicio_prueba','fecha_fin_prueba','eliminado','foto']
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

create or replace function public.scar_guardar_v5(p_tabla text,p_datos jsonb,p_revision bigint default 0)
returns jsonb language sql security invoker set search_path='' as $$ select public.scar_guardar(p_tabla,p_datos,p_revision); $$;
revoke all on function public.scar_guardar_v5(text,jsonb,bigint) from public,anon;
grant execute on function public.scar_guardar_v5(text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
commit;

