# ide.x — Gestão de ministério de louvor

SaaS multi-tenant para igrejas. Começa pelo ministério de louvor; o modelo já suporta outros ministérios no futuro (mídia, infantil, recepção). O player de multitracks é OUTRO produto — não implementar nada de áudio aqui.

## Stack e hospedagem
- Repositório no GitHub; deploy do front na Vercel (preview por PR, produção na `main`).
- Front: React + Vite + TypeScript + shadcn/ui + TanStack Query + React Router. PWA (instalável no celular).
- Backend: Supabase — Postgres, Auth (e-mail + link mágico), RLS, Storage, Edge Functions (Deno/TS) e pg_cron.
- Banco versionado com Supabase CLI (`supabase/migrations/*.sql`). Tipos gerados com `supabase gen types typescript` em `src/types/database.ts`. Sem Prisma e sem servidor Express.
- Validação: Zod nos formulários e nas Edge Functions.
- Datas em `timestamptz` (UTC); exibir em America/Sao_Paulo.
- Interface e mensagens em pt-BR.
- Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` no front (Vercel). `SUPABASE_SERVICE_ROLE_KEY` e `QR_SECRET` SOMENTE nos secrets das Edge Functions — nunca no front nem no repositório.

## PWA (os integrantes usam o app instalado pelo navegador)
- `vite-plugin-pwa` com manifest completo (nome "ide.x", ícones 192/512 e maskable, `display: standalone`, theme_color), service worker com atualização automática e aviso "nova versão disponível".
- Mobile-first: toda tela de membro desenhada para 390px; alvos de toque ≥ 44px.
- Tela/banner "Instalar app": no Android usa o evento `beforeinstallprompt`; no iPhone mostra o passo a passo (Compartilhar → Adicionar à Tela de Início). Não mostrar se já estiver instalado (`display-mode: standalone`).
- Check-in pela câmera dentro do app (leitor de QR com `getUserMedia`, ex.: lib `qr-scanner`) e geolocalização; pedir permissão só na hora do uso, com explicação.
- Cache offline do que o membro consulta: minha escala, setlist e cifras do próximo culto. Check-in exige internet.
- Web Push (VAPID) como canal extra de aviso; no iPhone só funciona com o app instalado (iOS 16.4+). WhatsApp continua sendo o canal principal.

## Regras de arquitetura
- Multi-tenant por `church_id` em todas as tabelas de negócio, com RLS ATIVADA em todas. Policies usam funções `security definer` (ex.: `is_church_member(church_id)`, `is_ministry_leader(ministry_id)`). Nenhuma tabela sem policy.
- Papéis: `owner` (igreja), `leader` (por ministério), `member`.
- Hierarquia: churches → ministries → ministry_members (membro com uma ou mais funções). `profiles` liga `auth.users` aos dados do usuário.
- Leituras e CRUD simples: direto do front com supabase-js, protegidos por RLS.
- Tudo que mexe em ponto, check-in ou ciclo NUNCA é escrito pelo front: passa por Edge Function ou função Postgres (RPC `security definer`) que valida a regra. O cliente não tem permissão de INSERT/UPDATE em `point_ledger`, `checkins` nem `cycle_eligibility`.
- Regras de cálculo (atraso, desconto, saldo, elegibilidade) em `supabase/functions/_shared/domain/*` como funções puras, com testes (Deno test).
- Toda alteração de ponto gera um registro em `point_ledger` (nunca editar saldo direto; saldo = soma do ledger, exposto por view).
- Fechamento de ciclo agendado com pg_cron chamando uma função.

## Regras de negócio
### Ciclo e pontos
- Ciclo = 3 meses, configurável por ministério (`cycleStartingPoints`, padrão 100; `cycleMinPoints`, padrão 70).
- Atraso além da tolerância (`lateToleranceMin`, padrão 10): desconto configurável por faixa (padrão: até 20 min −5; acima −10).
- Falta sem aviso: −20 (configurável). Falta/atraso justificado antes do evento e aprovado pelo líder: 0.
- Ao fechar o ciclo, quem tem saldo ≥ mínimo fica `eligible` para a escala do próximo ciclo. Quem entra no meio do ciclo começa com saldo cheio.
- Líderes também batem ponto.

### Check-in
- QR rotativo: token HMAC(eventId + janela de 30s) gerado e validado na Edge Function `checkin` com `QR_SECRET`; o líder exibe em tela cheia. Aceitar janela atual e anterior.
- Check-in exige geolocalização dentro de raio configurável da igreja (padrão 300 m); guardar lat/lng e precisão.
- Registra `arrivedAt`; calcula atraso em minutos e lança no ledger automaticamente.

### Esqueci de registrar
- Membro cria `CheckinRequest` com horário declarado e motivo, até 48h após o evento.
- Status: PENDING → APPROVED (com horário declarado) | ADJUSTED (líder muda o horário) | REJECTED (vira falta).
- Limite configurável por ciclo (padrão 3); acima disso o líder vê alerta.
- Mostrar ao líder qualquer evidência disponível (ex.: localização registrada pelo app no horário).

## Comandos
- `pnpm dev` (front), `supabase start` (Supabase local via Docker), `supabase db reset` (aplica migrations + `supabase/seed.sql`), `supabase migration new <nome>`, `supabase functions serve`, `pnpm gen:types`, `pnpm test`.
- Deploy: `supabase db push` e `supabase functions deploy` para o projeto remoto; front sobe sozinho na Vercel pelo push no GitHub.

## Convenções
- Commits pequenos por fase. Não instalar libs pesadas sem necessidade.
- Antes de encerrar uma fase: rodar testes e typecheck, e atualizar a seção "Status" abaixo.

## Status
- [x] Fase 1 — fundação (monorepo, schema, auth, tenant, membros)
  - Projeto único na raiz (front em `src/`, banco em `supabase/`), schema completo do MVP em 3 migrations, RLS em todas as tabelas (48 testes pgTAP em `supabase/tests/database`), RPCs `create_church`, `accept_invite`, `get_invite_preview`.
  - Igreja ↔ usuário via `church_members` (owner/member); FKs compostas `(id, church_id)` impedem misturar igrejas.
  - Saldo = soma do `point_ledger` (view `member_cycle_balance`); quem entra no ministério ganha o crédito `cycle_start` do ciclo aberto (gatilho). Ledger só aceita INSERT (DELETE só em cascata).
  - `checkin_requests` e revisão de `justifications` ficam para RPCs da Fase 4 (cliente não escreve).
  - Visual segue os protótipos (tema escuro, verde-limão #D4F04A, Bricolage Grotesque + IBM Plex). Atenção: o protótipo de Presença usa "pontos de penalidade" (6 = fora da escala); a regra oficial é a deste arquivo (saldo 100, mínimo 70).
  - Pendências conhecidas: cache offline de escala/setlist (Fases 2/3) e Web Push.
- [x] Fase 2 — escala
  - Regras puras em `supabase/functions/_shared/domain/{time,schedule}.ts` (fuso, recorrência semanal, indisponibilidade, conflitos, elegibilidade, sugestão de substituto), testadas com Vitest (o front importa via alias `@domain`).
  - Eventos únicos ou semanais (filhos com `recurrence_parent_id`), escala por função, copiar escala de outro evento, indisponibilidade por período ou semanal (dia inteiro). Motivo visível só ao próprio membro e ao líder; gatilho impede escalar gente/função de outro ministério.
  - Elegibilidade: último ciclo fechado (`cycle_eligibility`); sem ciclo fechado ou membro não avaliado = elegível.
  - Telas: Escala (meses, calendário do líder, "só as minhas", alertas com sugestão), editor do evento (`/escalas/:id`), "Sua escala" no Início.
  - Repasse do Supabase local no Vite fica em `/__supabase` (não usar `/supabase`, conflita com os arquivos de domínio).
- [ ] Fase 3 — repertório e cifras
- [ ] Fase 4 — presença e pontos
- [ ] Fase 5 — planejamento trimestral
- [ ] Fase 6 — notificações WhatsApp
