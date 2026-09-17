begin;
alter table public.productos add column if not exists programacion jsonb not null default '{}'::jsonb;
alter table public.productos drop constraint if exists productos_programacion_objeto;
alter table public.productos add constraint productos_programacion_objeto check(jsonb_typeof(programacion)='object');

create or replace function public.scar_guardar_v7(p_tabla text,p_datos jsonb,p_revision bigint default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare resultado jsonb; nueva_revision bigint;
begin
 if p_tabla='productos' and p_datos ? 'programacion' and jsonb_typeof(p_datos->'programacion') is distinct from 'object' then
   raise exception 'La programación debe ser un objeto';
 end if;
 resultado := public.scar_guardar(p_tabla,p_datos,p_revision);
 if coalesce((resultado->>'conflict')::boolean,false) then return resultado; end if;
 if p_tabla='productos' and p_datos ? 'programacion' then
   update public.productos set programacion=p_datos->'programacion'
   where id=(resultado->>'id')::uuid and user_id=auth.uid()
   returning revision into nueva_revision;
   if not found then raise exception 'Producto no disponible'; end if;
   resultado := resultado || jsonb_build_object('revision',nueva_revision);
 end if;
 return resultado;
end $$;
revoke all on function public.scar_guardar_v7(text,jsonb,bigint) from public,anon;
grant execute on function public.scar_guardar_v7(text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
commit;

