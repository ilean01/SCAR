begin;
alter table public.rutinas add column if not exists esperas jsonb not null default '{}'::jsonb;
alter table public.rutinas drop constraint if exists rutinas_esperas_objeto;
alter table public.rutinas add constraint rutinas_esperas_objeto check(jsonb_typeof(esperas)='object');
create or replace function public.scar_guardar_v8(p_tabla text,p_datos jsonb,p_revision bigint default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare resultado jsonb; nueva_revision bigint; valor jsonb;
begin
 if p_tabla='rutinas' and p_datos ? 'esperas' then
   if jsonb_typeof(p_datos->'esperas') is distinct from 'object' then raise exception 'Esperas inválidas'; end if;
   for valor in select value from jsonb_each(p_datos->'esperas') loop
     if jsonb_typeof(valor) <> 'number' then raise exception 'Espera inválida'; end if;
     if valor::text::numeric < 0 or valor::text::numeric > 180 then raise exception 'Espera fuera de rango'; end if;
   end loop;
 end if;
 resultado := public.scar_guardar_v7(p_tabla,p_datos,p_revision);
 if coalesce((resultado->>'conflict')::boolean,false) then return resultado; end if;
 if p_tabla='rutinas' and p_datos ? 'esperas' then
   update public.rutinas set esperas=p_datos->'esperas'
   where id=(resultado->>'id')::uuid and user_id=auth.uid()
   returning revision into nueva_revision;
   if not found then raise exception 'Rutina no disponible'; end if;
   resultado := resultado || jsonb_build_object('revision',nueva_revision);
 end if;
 return resultado;
end $$;
revoke all on function public.scar_guardar_v8(text,jsonb,bigint) from public,anon;
grant execute on function public.scar_guardar_v8(text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
