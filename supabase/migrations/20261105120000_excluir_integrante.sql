-- =============================================================================
-- Excluir integrante (ex.: entrou pelo convite errado)
--
-- Diferente de "inativo" (que guarda o histórico), excluir apaga o vínculo com
-- o ministério e tudo dele em cascata: funções, escalas, presenças, pontos,
-- disponibilidade, avisos. Só o líder; ninguém exclui a si mesmo nem o dono da
-- igreja. Quem fica sem nenhum ministério e sem apoio sai também da igreja
-- (perde o acesso), e pode entrar de novo por outro convite.
-- =============================================================================

create or replace function public.remove_ministry_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ministry_members%rowtype;
begin
  select * into v_row from public.ministry_members where id = p_member_id;
  if not found then
    raise exception 'Integrante não encontrado' using errcode = 'P0002';
  end if;
  if not public.is_ministry_leader(v_row.ministry_id) then
    raise exception 'Só o líder do ministério pode excluir integrantes' using errcode = '42501';
  end if;
  if v_row.user_id = (select auth.uid()) then
    raise exception 'Você não pode excluir a si mesmo' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.church_members cm
    where cm.church_id = v_row.church_id and cm.user_id = v_row.user_id and cm.role = 'owner'
  ) then
    raise exception 'O dono da igreja não pode ser excluído' using errcode = '22023';
  end if;

  delete from public.ministry_members where id = v_row.id;

  delete from public.church_members cm
  where cm.church_id = v_row.church_id
    and cm.user_id = v_row.user_id
    and cm.role = 'member'
    and not exists (
      select 1 from public.ministry_members mm
      where mm.church_id = v_row.church_id and mm.user_id = v_row.user_id
    )
    and not exists (
      select 1 from public.ministry_supporters s
      where s.church_id = v_row.church_id and s.user_id = v_row.user_id
    );
end;
$$;
revoke execute on function public.remove_ministry_member(uuid) from public, anon;
grant execute on function public.remove_ministry_member(uuid) to authenticated;
