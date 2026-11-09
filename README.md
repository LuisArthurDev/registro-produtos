# Registro de Validades — migração para Supabase + Vercel

**Estado: base funcional para homologação, NÃO pronta para substituir a produção.**

Nova arquitetura (sem Google Apps Script nas rotas já migradas):

```
GitHub Pages (apenas redirecionamento)
         └──> Vercel: public/ (PWA) + api/index.js (APIs)
                     └──> Supabase: Postgres + RLS
```

Este pacote inclui o frontend, APIs, schema, scripts de migração e o redirecionamento GitHub Pages. É o pacote de **código sem dados privados**, organizado para um único repositório. **Não está conectado a um Supabase real.** A URL do Vercel e chaves do Supabase ainda precisam ser configuradas. Não considere o projeto concluído para produção sem testes com dados reais.

## Um único repositório no GitHub

Primeiro teste a migração em uma branch `migracao-supabase`, preservando a `main` com o sistema atual. A aplicação Vercel usa a raiz (`/`): `public/`, `api/` e `vercel.json`. O GitHub Pages usa **Settings → Pages → Deploy from a branch → main → /docs**. A documentação foi movida para `documentacao/` para que a pasta `/docs` tenha o `index.html` de redirecionamento. Ative o redirecionamento apenas depois de homologar o Vercel e configure `docs/config.js` com a URL real. Veja `PUBLICACAO-REPOSITORIO-UNICO.md`.

## Pastas

| Pasta | Finalidade |
|---|---|
| `public/` | Frontend responsivo de página única (login, mapas, lançamento, catálogo, funcionários, Estoque especial, saldo Procfit, ocorrências e painéis) |
| `api/index.js` | API Vercel com PIN hash, sessão, autorização de loja, CRUD e operações atômicas |
| `supabase/` | Banco PostgreSQL, RLS, funções de lançamento e transferência de lote |
| `scripts/` | Importação do SQLite `produtos-ean` e dos registros históricos; conversor ODS→CSV |
| `private_data/` | Dados privados apenas no computador local; **não incluídos neste ZIP nem no GitHub** |
| `docs/` | Site de redirecionamento, publicado pelo GitHub Pages a partir de `main` + `/docs` |
| `documentacao/` | Passo a passo, análise dos GS, limites e checklist de homologação |

## Implantação — ordem obrigatória

1. Crie um **projeto novo** no Supabase e execute `supabase/001_schema.sql` no SQL Editor.
2. Copie `.env.example` para `.env` na sua máquina. Configure `SUPABASE_URL` e `SUPABASE_SECRET_KEY`; **NUNCA** envie a chave secreta a `public/`, GitHub ou chat.
3. Execute `python scripts/importar_dados.py` para validar dados. Revise `private_data/inconsistencias.csv` e `private_data/transferencias_REVISAR.csv`.
4. Execute `python scripts/importar_dados.py --apply` em ambiente seguro (com variáveis no terminal). Consulte `documentacao/IMPORTACAO.md`.
5. Execute `supabase/002_apos_importacao.sql`, confira contagens no SQL Editor e distribua de forma segura os PINs recém-gerados.
6. Importe este mesmo repositório no Vercel (Root Directory: `./`, sem `private_data/`), configure as variáveis de ambiente e teste `https://SEU-PROJETO.vercel.app/api/health`.
7. Homologue login, permissões, cadastro, lançamento, duplicidade, mapas, retirada de Estoque e importação de saldo, em desktop e celular.
8. Só **depois de aprovar a homologação**, edite `docs/config.js` com a URL definitiva, faça merge para `main` e configure o GitHub Pages para publicar a pasta `/docs` (sem copiar arquivos para a raiz). **Não substitua a `main` enquanto o Pages ainda publica a raiz: isso pode interromper o sistema atual.**

Para executar testes de sintaxe e segurança localmente: `npm run check` (Node.js 20+).

## Limitações atuais

Os fluxos principais já possuem código substituto, mas **não há paridade completa** com `code.gs` / `login.gs`. Antes de trocar o sistema real, concluir especialmente:

- OneSignal: cadastro do dispositivo, segmentação por funcionário e loja, notificações agendadas a cada 6h, painel administrativo e ciclo de vencidos.
- Autorização de celular próprio por dispositivo; a flag existe, mas o fluxo do antigo `login.gs` ainda não foi reproduzido.
- Operações especiais completas de Vencidos, Sinalização e Queima (aprovação/relançamento, motivo 4 e ações históricas), regras da seção e sincronização Procfit.
- Importação ODS/XLSX diretamente no navegador; atualmente aceita CSV e fornece conversor ODS→CSV por script.
- Trabalho offline completo, sincronização e alertas de possíveis conflitos; há reenvio idempotente em um lançamento pendente, mas não fila offline de vários itens.
- Migração revisada das 21 transferências com cabeçalhos inconsistentes e solução dos códigos EAN pendentes.
- Políticas de backup, recuperação, limite de acesso, proteção antiabuso do login e observabilidade em produção.

### Privacidade e segurança

O backend usa exclusivamente a chave `SUPABASE_SECRET_KEY` **no servidor**. Sessões são identificadas por token aleatório com hash SHA-256 no PostgreSQL, e PINs novos são armazenados como scrypt. As senhas legadas do Google Sheets não são copiadas para contas novas. Todas as tabelas restringem acesso público, e a API determina permissões por loja.

**Importante:** o PIN administrativo gerado no processo de migração deve ser alterado e entregue individualmente. `private_data/novos_pins_gerados.csv` contém credenciais e nunca deve ser versionado ou compartilhado.

Consulte `PUBLICACAO-REPOSITORIO-UNICO.md`, `documentacao/STATUS_E_LACUNAS.md` e `documentacao/VERCEL_E_REDIRECIONAMENTO.md` antes de publicar.

## Implantação pela nuvem (GitHub Actions + Vercel)

Leia **[CONFIGURACAO-ACTIONS-VERCEL.md](CONFIGURACAO-ACTIONS-VERCEL.md)** para criar as tabelas e migrar o histórico pelo workflow manual, sem rodar comandos no Windows.
