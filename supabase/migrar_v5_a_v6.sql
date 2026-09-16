begin;

alter table public.envases add column if not exists fecha_fin date;
alter table public.envases drop constraint if exists envases_fecha_fin_valida;
alter table public.envases add constraint envases_fecha_fin_valida
  check(fecha_fin is null or fecha_apertura is null or fecha_fin>=fecha_apertura);

-- Amplía únicamente la lista blanca de envases de la función existente.
-- Si la función no tiene la firma esperada, aborta sin dejar una migración parcial.
do $$
declare cuerpo text; anterior text; nueva text;
begin
  anterior := 'when ''envases'' then array[''producto_id'',''fecha_compra'',''fecha_apertura'',''fecha_vencimiento'',''meses_pao'',''precio'',''moneda'',''estado'',''notas'',''eliminado'']';
  nueva := 'when ''envases'' then array[''producto_id'',''fecha_compra'',''fecha_apertura'',''fecha_vencimiento'',''fecha_fin'',''meses_pao'',''precio'',''moneda'',''estado'',''notas'',''eliminado'']';
  select prosrc into cuerpo from pg_proc where oid='public.scar_guardar(text,jsonb,bigint)'::regprocedure;
  if position(anterior in cuerpo)=0 then
    raise exception 'La función scar_guardar no corresponde a V5. No se modificó la base.';
  end if;
  cuerpo := replace(cuerpo, anterior, nueva);
  execute format('create or replace function public.scar_guardar(p_tabla text,p_datos jsonb,p_revision bigint default 0) returns jsonb language plpgsql security invoker set search_path='''' as %L', cuerpo);
end $$;

notify pgrst,'reload schema';
commit;
