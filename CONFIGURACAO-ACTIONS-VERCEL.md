# Migração usando somente GitHub Actions + Vercel + Supabase

> **Estado:** pacote de homologação. **Não** aponte o GitHub Pages antigo para o Vercel antes de testar os recursos críticos.

## Arquitetura no mesmo repositório

- `public/`, `api/`, `vercel.json`: aplicação e APIs publicadas automaticamente pelo **Vercel** após conectar o repositório. Não é necessário criar um segundo fluxo de deploy no Actions.
- `docs/`: arquivos publicados pelo **GitHub Pages**; redirecionam para o Vercel após ajustar `docs/config.js`.
- `.github/workflows/validacao.yml`: executa testes a cada push e por botão `Run workflow`.
- `.github/workflows/migracao-supabase.yml`: cria a estrutura SQL, valida e importa o histórico em etapas controladas.
- `supabase/`: arquivos SQL da estrutura e ajustes pós-importação.

## 1. Crie o projeto Supabase

Escolha a região mais próxima dos funcionários. No Supabase, obtenha:

- **Project URL**, para `SUPABASE_URL`.
- **Secret key** (`sb_secret_...`), para `SUPABASE_SECRET_KEY`.
- **PostgreSQL connection string, Session pooler, porta 5432**, para `SUPABASE_DB_URL`. Copie a string exata em **Connect**. O runner do GitHub Actions pode ser apenas IPv4; por isso prefira **Session pooler**, não o endereço direto IPv6. Inclua a senha do banco na URL; se contiver caracteres especiais, use percent-encoding. O workflow exige SSL (`PGSSLMODE=require`).

As chaves Secret nunca vão ao Git, arquivos HTML ou `docs/`.

## 2. Configure os Secrets no GitHub

No **mesmo repositório**: `Settings → Secrets and variables → Actions → New repository secret`.

| Secret | Finalidade | Onde usar |
| --- | --- | --- |
| `SUPABASE_URL` | URL HTTPS do projeto | Actions e Vercel |
| `SUPABASE_SECRET_KEY` | chave privada do banco/API | Actions e Vercel; **nunca no navegador** |
| `SUPABASE_DB_URL` | conexão PostgreSQL pelo **Session pooler** | somente Actions |
| `MIGRATION_PIN_SEED` | segredo aleatório estável de **32+ caracteres**, usado para gerar os mesmos PINs em reexecuções | somente Actions |
| `PINS_PASSPHRASE` | senha de **16+ caracteres** para cifrar o relatório de PINs | somente Actions |

A `MIGRATION_PIN_SEED` deve permanecer **igual em tentativas de importação**; alterá-la gera PINs diferentes dos já cadastrados. Guarde a passphrase com segurança para conseguir recuperar o arquivo cifrado. Depois da migração, considere redefinição individual dos PINs e remoção da seed.

## 3. Preparar o pacote privado de dados

**Nunca envie CSVs com funcionários nem o SQLite para a raiz pública do GitHub.**

Use o ZIP **dados-migracao-privados.zip** entregue separadamente, que contém somente `private_data/` (planilha já preparada e catálogo SQLite), sem arquivos HTML legados. Você pode inspecionar seu conteúdo antes de importar.

No Supabase Dashboard:

1. Abra **Storage → New bucket**; nomeie `migracao` e deixe **Private**.
2. Faça upload do pacote, renomeando-o para `dados-migracao.zip`.
3. O Action tentará obter `storage/v1/object/authenticated/migracao/dados-migracao.zip` usando a Secret Key definida nos Secrets. Se falhar, consulte `CORRECAO-DOWNLOAD-STORAGE.md` para diferenciar HTTP 401, 403 e 404.

**Alternativa:** você pode gerar uma URL assinada temporária de acesso ao arquivo no bucket privado e cadastrar **`MIGRATION_BUNDLE_URL`** em Actions Secrets. Essa URL terá prioridade sobre a rota autenticada. Não coloque uma URL assinada em código ou mensagens públicas.

O workflow valida os caminhos do ZIP, restringe a extração a `private_data/` e não publica esses arquivos como artifact.

> A aba especial **Estoque** ainda não estava presente na planilha histórica analisada. Antes de declarar a migração concluída, importe também esses registros no formato de mapa especial. A importação de saldo Procfit é separada e não substitui lote/validade da aba Estoque.

## 4. Executar pelo GitHub Actions

O botão **Actions → Supabase - preparar e importar → Run workflow** aparece quando o workflow existe na **branch padrão do repositório**.

Execute nesta ordem:

1. `etapa = estrutura`: cria as tabelas, índices, políticas de acesso e funções SQL. Necessita `SUPABASE_DB_URL`.
2. `etapa = validar`: baixa o bundle privado, verifica arquivos, mostra contagens, **não grava** no banco.
3. `etapa = importar`, `escopo = todos`, `confirmar_gravacao = true`: importa o catálogo, funcionários e dados históricos no Supabase. **Faça backup antes**. A primeira execução com usuários gera um arquivo **`pins-iniciais.csv.gpg`** cifrado, disponível por três dias em **Artifacts** da execução. Ele não é publicado em texto puro. Baixe e decifre localmente com a passphrase protegida, usando GPG/Kleopatra. Distribua PINs individualmente por canal seguro.
4. `etapa = finalizar`: executa os vínculos com catálogo, ajusta dados históricos e mostra contagens. Compare os resultados com a planilha original.

### Reexecuções e segurança

- Não rode execuções em paralelo (o workflow usa `concurrency`).
- A maior parte dos registros usa chaves de origem para não duplicar em reexecuções. A auditoria recebeu uma chave idempotente de migração.
- Se você já importou os funcionários e quiser repetir `escopo = todos`, marque **`pular_usuarios = true`**. Isso evita gerar novos PINs.
- Existem EANs históricos fora do padrão e transferências com cabeçalhos inconsistentes: a importação os mantém como pendências, não os corrige adivinhando valores.
- Faça backup e confira os totais no Supabase antes de liberar a produção.

## 5. Publicar no Vercel

1. Acesse **Vercel → Add New → Project** e importe **o mesmo repositório** do GitHub.
2. **Root Directory:** `./` (raiz). Configure o projeto para usar `vercel.json` e `public/`, `api/` do pacote.
3. No projeto Vercel, abra **Settings → Environment Variables** e adicione `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (server-only). Escolha `Production` e `Preview`, se necessário. **Não use prefixo `NEXT_PUBLIC_`** na chave privada.
4. Publique uma branch de testes e valide login, lançamento, mapas, abas especiais, vencidos, transferências e permissões. A chave do Vercel não deve aparecer no código servido ao navegador.
5. O Vercel já faz deploy automático quando conectado ao GitHub. O Action de validação fica responsável por testar; não duplique o deploy Vercel num segundo pipeline sem necessidade.

## 6. Ativar o redirecionamento GitHub Pages → Vercel

Somente **depois de testar** a aplicação Vercel, edite `docs/config.js` com a URL de produção e configure GitHub Pages para usar a branch `main` e a pasta `/docs`.

O GitHub Pages continuará com o endereço antigo; os links apontarão para a aplicação Vercel.

## Limitações do pacote atual

Este projeto permanece **base de homologação**. A autenticação implementada usa **PIN e tabela própria de sessões no Supabase**, não o Supabase Auth; migrar para Auth exige alteração adicional. OneSignal, regras avançadas de autorização de celular e alguns fluxos administrativos/Queima podem estar incompletos e precisam ser comparados ao sistema original antes da troca definitiva.

A execução real não foi realizada aqui: você precisará criar o projeto Supabase, configurar os Secrets e acionar o workflow na sua conta.
