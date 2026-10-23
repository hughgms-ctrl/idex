# ide.x

Gestão de ministério de louvor para igrejas: escala, repertório e cifras, presença por QR com pontos por ciclo.

- Stack: React + Vite (PWA) na Vercel · Supabase (Postgres, Auth, RLS, Edge Functions)
- Contexto e regras do projeto: [CLAUDE.md](CLAUDE.md)
- Plano de implementação por fases: [PROMPTS.md](PROMPTS.md)

---

## 1. Rodar no seu computador

### O que instalar (uma vez só)

1. **Node.js 20 ou mais novo**: https://nodejs.org (baixe a versão "LTS").
2. **Docker Desktop**: https://www.docker.com/products/docker-desktop. Deixe-o **aberto** sempre que for usar o app; é ele que roda o banco de dados local.
3. **pnpm**: abra o Terminal (no Windows, o PowerShell) e rode:
   ```bash
   corepack enable
   ```

### Primeira vez

Na pasta do projeto:

```bash
pnpm install      # baixa as dependências (uns 2 minutos)
pnpm db:start     # sobe o Supabase local e cria o arquivo .env.local sozinho
pnpm dev          # abre o app
```

> Na primeira vez, o `pnpm db:start` baixa as imagens do Supabase e pode levar uns 10 minutos.

Abra **http://localhost:5173** e entre com um dos usuários de teste:

| E-mail | Senha | Papel |
| --- | --- | --- |
| `ana@idex.local` | `senha123` | dona da igreja e líder do Louvor |
| `bruno@idex.local` | `senha123` | integrante (violão) |
| `carla@idex.local`, `daniel@`, `elisa@`, `felipe@`, `gabriela@`, `hugo@` | `senha123` | integrantes |

Também existe um convite de exemplo: http://localhost:5173/convite/convite-demo-louvor

### Nas próximas vezes

```bash
pnpm db:start   # se o Supabase local não estiver rodando
pnpm dev
```

### Endereços úteis (com o `pnpm db:start` rodando)

- **App**: http://localhost:5173
- **Painel do banco (Supabase Studio)**: http://127.0.0.1:54323
- **Caixa de e-mails de teste** (link mágico, confirmações): http://127.0.0.1:54324

### Comandos

| Comando | Para quê |
| --- | --- |
| `pnpm dev` | Abre o app no computador |
| `pnpm dev:phone` | Abre o app na rede Wi-Fi, com HTTPS, para testar no celular |
| `pnpm db:start` / `pnpm db:stop` | Liga / desliga o Supabase local |
| `pnpm db:reset` | Apaga o banco local e recria do zero (migrations + dados de teste) |
| `pnpm test` | Testes do front |
| `pnpm test:rls` | Testes de segurança do banco (uma igreja não vê a outra etc.) |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Verificações de código e build de produção |
| `pnpm exec supabase functions serve` | Roda as funções do servidor (check-in, QR, importar cifra) no seu computador |
| `pnpm gen:types` | Atualiza `src/types/database.ts` depois de mudar o banco |
| `pnpm exec supabase migration new <nome>` | Cria uma migration nova |

---

## 2. Testar no celular

### Na mesma rede Wi-Fi (rápido)

```bash
pnpm dev:phone
```

O terminal mostra um endereço `Network`, por exemplo `https://192.168.0.15:5173`. Abra no navegador do celular e aceite o aviso de "conexão não segura" (é um certificado de teste). O app chama o Supabase do seu computador pelo mesmo endereço, sem precisar configurar mais nada.

### Com HTTPS válido (para instalar o app, usar câmera e localização)

Instalar o PWA, ler QR pela câmera e pegar a localização exigem um HTTPS "de verdade". Use um túnel gratuito da Cloudflare:

1. Instale o `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Em um terminal: `pnpm dev`
3. Em outro terminal: `cloudflared tunnel --url http://localhost:5173`
4. Abra no celular o endereço `https://….trycloudflare.com` que aparecer.

Observação: links enviados por e-mail (link mágico) apontam para o seu computador; no celular, entre com e-mail e senha.

### Testar o check-in pelo QR

1. Rode também `pnpm exec supabase functions serve` (em outro terminal).
2. Entre como `ana@idex.local` e, em **Configurações**, toque em "Usar minha localização" e salve (assim a "igreja" fica onde você está).
3. Em **Escala**, crie um ensaio para agora e escale alguém. Em **Presença → Projetar QR no telão**, abra o QR.
4. No celular (com o túnel), entre como a pessoa escalada e toque em **Bater ponto com QR**.

---

## 3. Publicar (Supabase na nuvem + Vercel)

### 3.1 Supabase

1. Crie uma conta e um projeto em https://supabase.com (região São Paulo). Guarde a senha do banco.
2. No terminal, na pasta do projeto:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <id-do-projeto>   # o id aparece na URL do painel
   pnpm exec supabase db push                               # cria as tabelas, regras de segurança e funções
   ```
   Não rode o `seed.sql` em produção (ele cria usuários de teste).
3. No painel do Supabase, em **Authentication → URL Configuration**:
   - **Site URL**: o endereço da Vercel (ex.: `https://idex.vercel.app`)
   - **Redirect URLs**: `https://idex.vercel.app/**` (e o domínio próprio, se tiver)
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / public**.
5. Funções do servidor e o segredo do QR (**nunca** no front nem no repositório):
   ```bash
   pnpm exec supabase secrets set QR_SECRET=<um-texto-aleatorio-longo>
   pnpm exec supabase functions deploy
   ```
   O `pnpm exec supabase db push` também liga as tarefas automáticas (faltas a cada 15 min e fechamento de ciclo diário). Se o painel avisar que a extensão `pg_cron` está desligada, ligue em **Database → Extensions**.
6. Ainda no painel, abra o app, vá em **Configurações** e cadastre a localização da igreja (de dentro da igreja, toque em "Usar minha localização"). Sem isso o check-in não funciona.

### 3.1.1 Avisos por WhatsApp (Evolution API)

O app manda lembretes da escala (2 dias antes), do ensaio (no dia), de ponto descontado e de pedidos analisados. Para ligar:

1. Tenha uma instância da **Evolution API** conectada ao WhatsApp da igreja (anote a URL, a chave e o nome da instância).
2. Cadastre os segredos das funções:
   ```bash
   pnpm exec supabase secrets set EVOLUTION_API_URL=https://sua-evolution.exemplo.com EVOLUTION_API_KEY=<chave> EVOLUTION_INSTANCE=<instancia> APP_URL=https://seu-app.vercel.app
   ```
3. No painel do Supabase, em **Project Settings → Vault**, crie dois segredos: `project_url` (a Project URL) e `service_role_key` (a chave service_role). É com eles que o envio automático (a cada minuto) chama a função.
4. Cada pessoa cadastra o WhatsApp em **Meu perfil** e pode desligar os avisos ali.

Em **Configurações** o responsável pela igreja vê o histórico (enviado, na fila, falhou). Se a Evolution falhar, o app tenta de novo em 1 min, 5 min, 30 min, 2 h e 6 h.

### 3.1.2 Avisos no celular (Web Push)

1. Gere um par de chaves VAPID: `pnpm dlx web-push generate-vapid-keys`.
2. Cadastre nas funções: `pnpm exec supabase secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:seu-email`.
3. Na Vercel, cadastre `VITE_VAPID_PUBLIC_KEY` = a chave **pública** (a privada nunca vai para o front).
4. Cada pessoa toca em **Ativar avisos** (Início ou **Instalar app e avisos**). No iPhone só funciona com o app instalado (iOS 16.4+).

### 3.2 Vercel

1. Em https://vercel.com, **Add New → Project** e importe o repositório do GitHub.
2. Em **Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon / public
   - `VITE_VAPID_PUBLIC_KEY` = chave pública VAPID (avisos no celular; veja 3.1.2)
3. Clique em **Deploy**. Daí em diante, cada push na `main` publica sozinho, e cada pull request ganha um link de prévia.

---

## Estrutura

```
src/
  pages/            telas (login, cadastro, convite, início, membros, ministérios…)
  features/         dados e componentes por assunto (igreja, membros, ministérios)
  components/ui/    componentes shadcn/ui
  components/pwa/   instalação e atualização do app
  lib/              cliente Supabase, validações (Zod), datas em America/Sao_Paulo
  types/database.ts tipos gerados do banco (pnpm gen:types)
supabase/
  migrations/       schema completo do MVP, RLS e funções (RPC)
  seed.sql          dados fictícios para desenvolvimento
  tests/database/   testes de RLS (pgTAP)
```

### Segurança, em resumo

- Toda tabela tem `church_id` e regra de acesso (RLS): uma igreja nunca enxerga dados de outra.
- Pontos, check-ins, ciclos e elegibilidade **não** podem ser gravados pelo app; só por funções do servidor.
- O livro de pontos (`point_ledger`) só aceita novos lançamentos; o saldo é a soma dele.
- Funções novas no banco nascem sem permissão de execução: libere com `grant execute … to authenticated` na migration.
