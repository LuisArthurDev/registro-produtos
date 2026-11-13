# Atualização v35 — filtros persistentes + Fórmulas Especiais em lote

Base: **v34**. A nova versão conserva as funcionalidades de Fórmulas Especiais (bloqueio de Queima e Procfit), dados da Gôndola, histórico da Queima, organização por Grupo e integração Procfit.

## 1. Filtros permanecem selecionados

Quando uma aba recarregar seus dados — botão **Atualizar**, salvar/editar/excluir um lançamento, movimentar um produto, trocar de menu ou pressionar **F5** — o sistema mantém os filtros anteriores da aba. Isso inclui, quando disponíveis:

- Pesquisa textual (nome, código, EAN e lote), mês, funcionário/mapa, datas, situação, quantidade por página e seleção entre abas internas.
- Página da tabela para as abas de **Mapa de Validade**, **Controle de Validade**, **Tentativa de Venda**, **Queima e Histórico**, **Transferências** e **Visualização**. Se os resultados diminuírem, a página é ajustada à última página disponível.
- Aba **Conferir com estoque** ativa e paginação interna da conferência, quando houver resultados para o mês selecionado.
- O campo **Limpar filtros** continua funcionando: limpa os filtros da aba atual e salva esse novo estado.

Os filtros são guardados **somente no navegador**, usando `localStorage`, com chave individual por **usuário + loja + aba** (`rv_filtros_v35_...`). Não são enviados PINs nem dados de formulários de lançamento/edição. Outros navegadores/dispositivos não compartilham esses filtros automaticamente. Para começar do zero em outro dispositivo, basta usá-lo normalmente; a preferência salva localmente não é global. Os filtros não são usados como autorização: todas as operações continuam validadas no servidor.

## 2. Marcar vários produtos como Fórmula Especial

### Produtos EAN

1. Abra **Produtos EAN** e pesquise pelos produtos desejados.
2. Marque os checkboxes ao lado dos EANs, individualmente, ou clique em **Selecionar resultados desta busca** (até 200 por consulta exibida; a própria tabela pode ter paginação visual).
3. Você pode fazer outra pesquisa sem perder os EANs que já selecionou. O contador mostra o total selecionado.
4. Clique em **Marcar Fórmulas Especiais** ou **Desmarcar Fórmulas Especiais**; confirme a operação.
5. O sistema envia os EANs **uma única vez** para o Supabase. Produtos já classificados mantêm o estado desejado.

### Mapa de Validade e Estoque

1. Selecione os registros pelas caixas da tabela. Use **Selecionar todos filtrados** (Mapa) ou **Selecionar todos filtrados** (Estoque) para incluir outras páginas da lista.
2. Clique em **Marcar Fórmulas Especiais** / **Desmarcar Fórmulas Especiais**.
3. Caso vários lançamentos tenham o **mesmo EAN**, a classificação é aplicada ao produto **uma vez**, afetando todos os seus lançamentos. Os lançamentos continuam no mapa, mas a marcação bloqueia futuras Queimas e cópias para Procfit.

**Limite seguro:** até **500 EANs distintos** por operação. Se forem selecionados mais, divida em lotes. O sistema não faz atualização parcial nesse caso.

### Segurança e consistência

- **SQL 021** adiciona a função `public.marcar_formulas_especiais_lote`, disponível exclusivamente ao backend com credencial de serviço.
- O banco verifica o administrador ativo, a loja, a lista completa e cada EAN antes de modificar o catálogo.
- Um EAN inexistente, inválido ou duplicado **cancela a operação inteira**. Não há alteração parcial de produtos.
- A função modifica apenas `public.produtos.formula_especial` e `atualizado_em`; não altera quantidades nem apaga lançamentos, Queimas, saldos ou históricos.
- A proteção da **SQL 020** continua impedindo Fórmulas Especiais na Queima. O botão do Procfit reconsulta as Fórmulas Especiais antes de copiar.

## Instalação

1. **Faça backup do Supabase** e mantenha uma branch de homologação.
2. Confirme que todas as migrações anteriores estão aplicadas, **especialmente a SQL 020 da v34**.
3. Atualize o repositório GitHub para a v35.
4. Abra **GitHub → Actions → Supabase - preparar e importar → Run workflow**, escolha **`formulas_especiais_lote`** e execute. Essa opção aplica `supabase/021_formulas_especiais_lote.sql`.
5. Confirme que o workflow terminou com sucesso. **Depois** publique o frontend v35 no Vercel.
6. Atualize a página/PWA. O Service Worker foi alterado para `registro-validades-v35-filtros-formulas-lote`.
7. Teste marcando dois EANs em Produtos EAN, entre eles um com mais de um lançamento no Mapa de Validade; confirme que os registros recebem a mesma classificação. Teste também desmarcar.
8. Teste os filtros de Mapa de Validade e Conferência, trocando de aba e utilizando o botão Atualizar: os valores devem permanecer.

## Testes locais

- **285 testes JavaScript** (testes anteriores e novos cenários de marcação em lote, permissões, limite e falha atômica).
- **24 testes Python** anteriores.
- **Chromium em ambiente simulado:** restaurou pesquisa, mês, funcionário, tamanho de página, aba selecionada e página 7/100; também confirmou selecionar dois produtos em buscas separadas e enviar um único POST para a marcação em lote.

**Observação:** os testes foram locais e simulados. Não foi possível executar a SQL 021 no seu Supabase de produção nem testar a publicação real no Vercel. Homologue primeiro com produtos de teste.
