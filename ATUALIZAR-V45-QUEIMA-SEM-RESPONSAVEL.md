# V45 — Queima importada sem responsável, com atribuição posterior

## Sobre a versão

Esta atualização é cumulativa à **v44** (conciliação XLSX de aprovados, badge e ação Verificado). Não altera regras de aprovação, correção, exclusão ou bloqueio de produtos com menos de 7 dias de validade.

### O que acontece após conciliar o relatório Procfit

- Para cada nova aprovação pelo **relatório XLSX**, o sistema procura mapas ativos de **funcionários** na **mesma loja**, com o mesmo **EAN e validade**.
- Se todos os mapas correspondentes tiverem um **único funcionário ativo em comum**, o item aprovado recebe esse funcionário como responsável.
- Se não houver mapa correspondente, se o único registro for um mapa especial, se não houver funcionário ativo, ou se houver vários titulares/ambiguidade, o aprovado fica **Sem responsável**.
- O status **Aprovado**, o badge **Aprovado via importação** e a ação **Verificado** continuam independentes da atribuição.
- Não inventamos o Lote nem criamos registro falso em `mapa_lancamentos`: o relatório XLSX não fornece o lote. A atribuição fica vinculada à **ocorrência aprovada na Queima** e é gerenciada diretamente naquela aba.
- Os itens já importados e aprovados pela v44 são classificados uma vez ao executar SQL 027. Reexecutar a SQL ou reimportar o relatório não desfaz a atribuição manual.

### Usando na Queima

1. Abra **Painel Conferente → Queima**.
2. No novo filtro **Responsável**, selecione **Sem responsável**.
3. Localize o item e clique em **Atribuir responsável**.
4. Escolha um funcionário ativo da loja e clique em **Salvar responsável**.
5. A coluna **Responsável** passa a mostrar o funcionário. O botão permite alterá-lo ou devolvê-lo a **Sem responsável** no futuro.

O gerenciamento acontece diretamente na Queima; **não** aparece como lançamento em um mapa individual até que um registro real de mapa com Lote seja criado por um dos fluxos usuais. Isto evita criar lotes fictícios.

### Instalação (obrigatório)

1. Faça backup do banco e do repositório.
2. Execute **supabase/027_queima_importada_sem_responsavel.sql** no **Supabase → SQL Editor**, colando **todo** o arquivo e executando o script completo. A função exige as SQLs 025 e 026 da v44.
3. Ou, após publicar os arquivos no GitHub, execute o workflow **Supabase - preparar e importar** com a etapa `responsaveis_queima_importada_v45`. Execute a etapa apenas uma vez; o script é idempotente.
4. Publique o frontend/backend da v45 no Vercel, depois force a atualização da PWA.
5. Abra a Queima, selecione **Sem responsável** e confira um produto importado. Teste a atribuição em uma loja de homologação antes de usar em produção.

**A ordem importa:** aplicar a SQL 027 primeiro, depois colocar a v45 no ar, para evitar que a interface chame uma função inexistente.

### Qual pacote instalar?

- `registro-validades-v45-queima-sem-responsavel-completo.zip`: versão completa pronta para substituir o projeto anterior.
- `atualizacao-v45-queima-sem-responsavel-sobre-v44.zip`: apenas arquivos alterados sobre a v44.

### Testes locais

- `npm run check` (tests Node.js, incluindo atribuição, permissão de loja, idempotência e interface)
- `python -m unittest discover -s tests -p 'testar*.py' -q`

**Não houve execução da SQL em um projeto Supabase real durante este preparo; homologação obrigatória.**
