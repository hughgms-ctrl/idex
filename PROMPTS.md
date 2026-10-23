# Prompts do ide.x — um por sessão

Como usar: crie a pasta do projeto, coloque o CLAUDE.md na raiz, abra o Claude Code ali e cole o prompt da fase. Uma fase por sessão nova (economiza tokens). Fases 1 e 4 com Opus; 2, 3, 5 e 6 podem ir com Sonnet.

---

## Fase 1 — Fundação

Leia o CLAUDE.md inteiro antes de começar. Implemente a Fase 1:

IMPORTANTE: por enquanto tudo roda 100% LOCAL — Supabase local (`supabase start`, via Docker) e front com `pnpm dev`. Não usar projeto remoto do Supabase nem Vercel ainda. Inclua um script `pnpm dev:phone` que sobe o Vite com `--host` e HTTPS (plugin `@vitejs/plugin-basic-ssl`) para testar no celular na mesma rede, e documente no README como expor por túnel (`cloudflared tunnel --url`) quando precisar de HTTPS válido para instalar o PWA, câmera e geolocalização.

1. Projeto Vite + React + TS estrito + shadcn/ui + TanStack Query + React Router, ESLint e Prettier, PWA conforme a seção PWA do CLAUDE.md (manifest, ícones placeholder, service worker com aviso de atualização, banner de instalação com instruções para iPhone e Android). `vercel.json` com rewrite de SPA. `.env.example` com as variáveis do CLAUDE.md.
2. `supabase init` e migration inicial com o schema COMPLETO do MVP (mesmo as tabelas das fases futuras, para não migrar toda hora):
   churches, profiles, ministries, ministry_roles (ministro, vocal, violão…), ministry_members (+ funções), member_unavailability, events (culto/ensaio, recorrência, local com lat/lng e raio), schedule_assignments, songs (ChordPro, tom original, BPM, compasso, links), setlists + setlist_items (tom escolhido), cycles, ministry_settings (tolerância, faixas de desconto, pontos iniciais/mínimos, limite de pedidos), checkins, checkin_requests, justifications, point_ledger, cycle_eligibility, quarter_plan_rules, invites, audit_log.
   Todas com `church_id`, índices, RLS ativada e policies. Views `member_cycle_balance`.
3. Fluxos: cadastro da igreja via RPC `create_church` (cria owner + ministério Louvor + settings padrão); login por e-mail/senha e link mágico; convite por link com token expirável (RPC `accept_invite`); CRUD de ministérios, funções e membros pelo supabase-js.
4. Telas: login, cadastro da igreja, aceitar convite, layout com menu lateral (Painel, Escalas, Repertório, Presença, Membros), tela de membros com convite.
5. `supabase/seed.sql` com 1 igreja, 1 ministério de louvor e 8 membros fictícios.
6. Testes de RLS (pgTAP ou script com dois usuários de igrejas diferentes) provando que uma igreja não lê nem escreve dado de outra, e que membro não escreve em point_ledger/checkins.
7. Script `gen:types` e README curto com o passo a passo: criar projeto no Supabase, `supabase link`, `supabase db push`, conectar repo na Vercel e configurar as variáveis.

Ao terminar: rode typecheck e testes, marque a Fase 1 no Status do CLAUDE.md e me dê um resumo curto do que ficou pronto e do que ficou pendente.

---

## Fase 2 — Escala

Leia o CLAUDE.md. Implemente a Fase 2: eventos (culto/ensaio, únicos e recorrentes), escala por função, indisponibilidade do membro (inclusive recorrente), detecção de conflito, sugestão de substituto (disponível, elegível no ciclo, menos escalado no mês). Só membros com `CycleEligibility` do ciclo atual entram na escala (no primeiro ciclo, todos são elegíveis). Telas: calendário do mês do líder, "minha escala" do membro, marcar indisponível. Ao terminar, atualize o Status e resuma.

---

## Fase 3 — Repertório e cifras

Leia o CLAUDE.md. Implemente a Fase 3 usando a lib `chordsheetjs`: biblioteca de músicas (CRUD, busca, importar cifra em texto "acordes sobre a letra" e converter para ChordPro), visualização com transposição, modo só letra, rolagem automática, setlist por culto com tom definido pelo ministro (vale para todos). Ao terminar, atualize o Status e resuma.

---

## Fase 4 — Presença e pontos (a mais importante)

Leia o CLAUDE.md, principalmente as regras de negócio. Implemente a Fase 4:
- Domínio puro e testado (Vitest): cálculo de atraso, desconto por faixa, falta, justificativa, saldo do ciclo pelo ledger, fechamento de ciclo e elegibilidade. Cubra casos de borda (entrada no meio do ciclo, ajuste de horário pelo líder, pedido fora do prazo, limite de pedidos).
- QR rotativo (HMAC, janela de 30s) e tela do líder para projetar em tela cheia.
- Check-in do membro com geolocalização e resultado imediato (horário, atraso, pontos).
- "Esqueci de registrar" e justificativa antecipada, com fila de aprovação do líder (aprovar / ajustar / recusar).
- Painel do ensaio ao vivo para o líder e tela "meus pontos no ciclo" para o membro.
- Job de fechamento de ciclo.
Ao terminar, atualize o Status e resuma.

---

## Fase 5 — Planejamento trimestral

Leia o CLAUDE.md. Implemente a visão de repertório de 3 meses (colunas por mês, cards por culto), com regras configuráveis por ministério (intervalo mínimo para repetir, máximo de músicas novas por mês) e alertas visuais de quebra de regra. Botão "sugerir" que preenche lacunas respeitando as regras. Atualize o Status e resuma.

---

## Fase 6 — Notificações WhatsApp

Leia o CLAUDE.md. Integre com a Evolution API (URL e chave por variável de ambiente): lembrete de escala (D-2), lembrete de ensaio (no dia), aviso de ponto descontado e de pedido aprovado/recusado. Fila com retry e opt-out por membro. Atualize o Status e resuma.
