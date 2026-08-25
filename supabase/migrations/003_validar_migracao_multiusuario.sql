-- Auditoria somente leitura da migração multiusuário.
-- Execute depois de 002_multiusuario_espacos.sql e salve o resultado.

select 'perfis' as item, count(*) as quantidade from public.perfis
union all select 'titulos', count(*) from public.titulos
union all select 'avaliacoes', count(*) from public.avaliacoes
union all select 'espacos', count(*) from public.espacos
union all select 'espaco_membros', count(*) from public.espaco_membros
union all select 'biblioteca_usuario', count(*) from public.biblioteca_usuario;

select
  e.id,
  e.nome,
  e.tipo,
  count(distinct m.usuario_id) as membros,
  count(distinct t.id) as titulos,
  count(distinct a.id) as avaliacoes
from public.espacos e
left join public.espaco_membros m on m.espaco_id = e.id
left join public.titulos t on t.espaco_id = e.id
left join public.avaliacoes a on a.titulo_id = t.id
where e.id = '00000000-0000-4000-8000-000000000001'::uuid
group by e.id, e.nome, e.tipo;

-- As duas consultas abaixo devem retornar zero linhas.
select 'titulo_sem_espaco' as problema, id::text as registro
from public.titulos where espaco_id is null
union all
select 'avaliacao_sem_titulo', a.id::text
from public.avaliacoes a
left join public.titulos t on t.id = a.titulo_id
where t.id is null
union all
select 'avaliacao_sem_usuario', a.id::text
from public.avaliacoes a
left join public.perfis p on p.id = a.usuario_id
where p.id is null;

select t.id, t.nome, count(b.usuario_id) as copias
from public.titulos t
left join public.biblioteca_usuario b on b.titulo_id = t.id
where t.espaco_id = '00000000-0000-4000-8000-000000000001'::uuid
group by t.id, t.nome
having count(b.usuario_id) <> 2;
