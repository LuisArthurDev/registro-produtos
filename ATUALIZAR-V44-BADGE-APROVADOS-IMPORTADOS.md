# Atualização v44 — Aprovado via importação, filtros e botão Verificado

Esta entrega inclui também o trabalho da **v43 (conciliação do relatório Procfit `data (3).xlsx`)**. A base pública anterior entregue era a **v42**.

## Objetivo

Na aba **Queima** do Painel Conferente, as ocorrências **que foram aprovadas pela conciliação do relatório XLSX do Procfit** recebem o marcador **Aprovado via importação** até serem conferidas por um administrador.

O filtro **Aprovação por importação** possui quatro opções:

- **Todos os registros** — lista normal.
- **Todos aprovados via importação** — inclui conferidos e não conferidos.
- **Aprovados via importação · a verificar** — somente os itens com marcador pendente.
- **Importados já verificados** — itens que tiveram o marcador retirado pelo botão Verificado.

O filtro é preservado após atualizações de dados, via mecanismo de filtros persistentes por usuário, loja e aba.

### Como usar Verificado

1. Abra **Queima** e selecione **Aprovados via importação · a verificar**.
2. Confira o produto, quantidade, validade e preço da gôndola.
3. Clique **Verificado**, no próprio registro, e confirme.
4. O badge pendente desaparece. A aprovação continua válida, sem alteração de estado, quantidade, preço ou validade.
5. O sistema grava **data/hora e administrador responsável**. O registro passa a aparecer em **Importados já verificados**.

O botão só é oferecido para itens **aprovados pela importação** e **ainda não verificados**. Itens aprovados manualmente não recebem esse marcador apenas por constarem no relatório. O registro de origem (`origem_relatorio_chave`) é preservado após a conferência para manter a idempotência: importar o mesmo relatório novamente **não reativa o badge**.

## Migrações obrigatórias antes do deploy

A v44 inclui **duas migrações novas em relação à v42**. Faça backup antes e aplique-as **nessa ordem**, no Supabase da loja:

1. **SQL 025 — conciliar_queima_relatorio_v43**: `supabase/025_conciliar_queima_relatorio_aprovados.sql`.
   - Github Actions → **Supabase - preparar e importar** → **Run workflow** → etapa `conciliar_queima_relatorio_v43`.
2. **SQL 026 — verificar_aprovacoes_importadas_v44**: `supabase/026_verificacao_aprovacoes_importadas.sql`.
   - Run workflow → etapa `verificar_aprovacoes_importadas_v44`.

Espere a conclusão de cada etapa, sem erros, **antes de publicar o frontend no Vercel**. Depois faça o deploy do projeto ou da atualização incremental e recarregue a PWA para atualizar o Service Worker.

As duas migrações preservam os registros existentes. A SQL 026 adiciona:

- `public.queima.aprovado_via_importacao` (`boolean`)
- `public.queima.importacao_verificada_em` (`timestamptz`)
- `public.queima.importacao_verificada_por` (UUID do administrador)

Ela também atualiza a função de conciliação para marcar como **importada** exclusivamente a transição para aprovação causada pelo relatório, e identifica os aprovados importados anteriormente **que possuem `origem_relatorio_chave`**. Não identifica automaticamente ocorrências históricas aprovadas por associação na v43 sem essa chave, pois não existe evidência individual suficiente para garantir sua origem.

> **Importante:** nunca execute somente o trecho interno de uma função SQL. No SQL Editor do Supabase, execute o script completo (inclusive `BEGIN;` e `COMMIT;`). O GitHub Actions evita esse risco.

## Funcionalidades preservadas

- Leitor `data (3).xlsx`, com colunas H (Validade), I (S/N), L (Preço).
- Prévia da conciliação; correções futuras opcionais; primeira carga opcional.
- Edição de quantidade, preço da gôndola e validade da gôndola nos aprovados.
- Exclusão lógica com histórico/auditoria.
- Bloqueio de novos lançamentos na Queima quando faltarem menos de 7 dias até a validade.
- Fórmulas Especiais, controles do mapa e exportação XLS do Procfit.

## Testes locais

- `npm run check`: **333 testes JavaScript** aprovados.
- `python -m unittest discover -s tests -p 'testar*.py' -q`: **24 testes Python** aprovados.
- Chromium: badge inicial; filtro pendente; clique em Verificado; desaparecimento do badge; filtros de importados verificados e todos importados.

**Limitação:** não houve conexão com o Supabase de produção. Os testes de API usaram um banco simulado e os testes visuais rodaram localmente. Faça a homologação na sua loja antes de utilizar em produção.
