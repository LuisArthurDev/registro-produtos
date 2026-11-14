# v54 — Controle de Vencidos histórico

Extraia o ZIP na raiz do repositório v53. Aplique a SQL
`supabase/031_queima_atribuicao_lote.sql` no SQL Editor do Supabase para habilitar
a opção de atribuição em lote no modal da Queima. Depois publique a v54 no Vercel.
A importação histórica e a transferência em lote dos Mapas usam tabelas e
funções que já existem na v53.

## Importar setembro e outubro uma vez

1. No Storage do Supabase, envie a planilha original ao bucket **privado**
   `migracao`, com o nome `controle-vencidos.xlsx`, na raiz do bucket.
   Se utilizar outro bucket, configure a variável de Actions `CONTROLE_BUCKET`.
2. O workflow usa os secrets existentes `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.
   Em **Actions → Importar Controle de Vencidos (setembro e outubro de 2026)**,
   clique em **Run workflow**. Informe a loja (padrão 151) e execute com
   **Gravar** desmarcado para conferir os totais e a resolução pelo catálogo.
3. Execute novamente marcando **Gravar** e mantendo a mesma planilha e loja.
   Se a gravação for interrompida, execute novamente com o mesmo arquivo,
   sem alterar a ordem das linhas. A chave é loja, mês e linha original.
4. Em **Funcionários → Transferir lançamentos**, escolha **Sem responsável**
   como origem, filtre por **Grupo** e, se quiser, por mês. Selecione o
   funcionário de destino e marque **todos os filtrados** para atribuir em lote.

O arquivo contém 542 lançamentos (1.341 unidades) em setembro e 309
(815 unidades) em outubro. A importação usa a coluna **Validade**, mantém lote
e quantidade, e define o mês pelo nome da aba. Quando a Data da Coleta está
fora daquele mês, a data de lançamento usa o primeiro dia do mês às 12h de São Paulo.
As linhas entram nos Mapas como **Sem responsável**, incluindo itens históricos
que já venceram. A planilha não contém aprovação de Queima.

O script resolve Código Interno pelo catálogo. Códigos internos ambíguos ou sem EAN
vão para Pendências com os dados originais. Depois de informar o EAN em Pendências,
o registro fica disponível para atribuição. Os grupos vêm do catálogo.

## Queima

Em **Sugestões sem responsável**, selecione um produto e marque
**Atribuir todos os itens sem responsável do mesmo grupo**. O painel mostra a
quantidade antes de confirmar e usa uma transação para aplicar a atribuição.
A sugestão de funcionário continua baseada no produto selecionado. Se o grupo
não estiver no catálogo, a atribuição individual continua disponível.
