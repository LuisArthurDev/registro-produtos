# Correção do erro 23514: loja_codigo ao importar

O erro `lojas: HTTP 400`, código PostgreSQL `23514`, ocorreu ao tentar registrar como loja um identificador `MANUAL_...` de duas linhas de `Vencidos`. A planilha original possui **duas colunas chamadas LojaOrigem**. Para essas linhas, a coluna **J** armazena um identificador de registro e a coluna **K** armazena a loja real **151**.

## Aplicar exclusivamente pelo GitHub Actions + Supabase Storage

1. **No repositório GitHub**, substitua `scripts/importar_dados.py` e os workflows em `.github/workflows/` por estes arquivos. Inclua `tests/testar_importacao.py`.
2. **No Supabase → Storage → bucket privado `migracao`**, substitua o arquivo `dados-migracao.zip` pelo ZIP **corrigido** entregue separadamente. O nome do objeto deve permanecer exatamente `dados-migracao.zip`, na raiz do bucket. Não extraia os CSVs e não publique o ZIP no GitHub, Vercel nem GitHub Pages.
3. **No GitHub Actions**, execute `Supabase - preparar e importar` com `etapa = validar`. A validação esperada é: `usuarios = 17`, `produtos_validos = 82498`, `mapas_para_importar = 1296`, `mapas_revisar = 3`, `vencidos_para_importar = 33`, `vencidos_revisar = 0`, `queima_para_importar = 1`, `historico = 45`.
4. Se `validar` passar, execute `etapa = importar`, `escopo = todos`, marque `confirmar_gravacao = true` e mantenha os mesmos secrets `MIGRATION_PIN_SEED` e `PINS_PASSPHRASE` anteriores.
5. Com `importar` concluído, execute `etapa = finalizar` e confira as contagens do banco antes de redirecionar o GitHub Pages.

**Não é necessário executar `estrutura` novamente**, pois o esquema de lojas existente está correto. Uma nova execução do importador usa chaves de origem e `ignore-duplicates` para reduzir risco de duplicação. Se alguma tentativa anterior importou usuários, preserve a mesma `MIGRATION_PIN_SEED`; não gere PINs divergentes.

## O que foi tratado

- **Vencidos:** duas linhas `Vencidos:33` e `Vencidos:34` foram corrigidas para loja 151, confirmada na **coluna K**, linhas 33 e 34, da planilha original. A alteração foi registrada no `manifest.json` do ZIP privado.
- **Mapas:** dois EANs fora do padrão e um lote original de **257 caracteres** são preservados integralmente em `migracao_pendencias`. Não haverá truncamento nem descarte silencioso; isso resulta em 1.296 lançamentos importáveis de um total de 1.299.
- **Proteção no script:** códigos de loja fora do padrão não entram em `lojas`. Registros inconsistentes de mapas, Vencidos ou Queima ficam em `migracao_pendencias` para revisão.
- **Testes:** validação offline, simulação de envio de todos os registros com respostas simuladas (sem acesso à rede) e testes unitários. A conexão real e a execução no Supabase precisam ser validadas no Actions.

## Se surgir outro HTTP 400

Compartilhe somente o nome da tabela, o código PostgreSQL e a mensagem de erro. Nunca publique `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`, ZIP privado ou PINs.
