# v49 — Restaurar botão de Primeira importação XLSX na Queima

Esta atualização foi feita sobre a **v48** e **não requer migração nova** no Supabase. **A SQL 028 da v48 deve estar instalada** para o fluxo de conferência em lotes.

## O que reapareceu

Em **Painel Conferente → Queima** há dois caminhos explícitos para o relatório XLSX do Procfit:

1. **Primeira importação XLSX** — abre o seletor do relatório e deixa **Primeira importação** marcada no modal. Destina-se à primeira carga de itens `S` que ainda não existem na Queima.
2. **Conferir relatório XLSX** — abre o mesmo leitor com **Primeira importação** desmarcada. Destina-se às importações posteriores e inclui somente itens novos.

A opção **Primeira importação** voltou a aparecer também como **caixa de seleção dentro do modal**. É possível alterá-la antes de confirmar; ao mudar o modo, a prévia é refeita sem gravação.

**Importante:** os dois modos aplicam a regra segura da v48: somente inserem e aprovam itens **novos**, nunca corrigem ou reprovam registros existentes. A distinção serve para identificar explicitamente o uso de primeira carga e as importações posteriores. Não há botão de *Correções futuras* e o Supabase continua a rejeitar `corrigir_aprovados=true`.

## Regras preservadas

- Coluna **I = S** para os itens aprovados; **N** ignorado.
- Coluna **L** contém preço válido e é obrigatória para cadastrar.
- Produto deve existir no catálogo, sem restrição por Fórmula Especial ou aba especial.
- Validade deve ser **pelo menos 7 dias depois da data local da loja**.
- O XLSX não informa Lote nem Registro. Esses campos permanecem sem informação, sem valores inventados.
- Novas aprovações continuam com badge **Aprovado via importação**, possibilidade de **Verificado** e **Sem responsável** com sugestões.
- Quantidade, preço e validade da gôndola de itens já aprovados continuam editáveis **somente manualmente**.
- Prévia e confirmação continuam sendo enviadas em **lotes de até 40**, com idempotência e sem correções de registros antigos.

## Como publicar

1. Mantenha um backup do repositório.
2. Se já usa a **v48**, aplique o ZIP de atualização **sobre a raiz do repositório**; preserve o caminho `api/sugestoes-queima.js` que está incluído preventivamente na atualização. **Não deixe os arquivos dentro de uma pasta adicional** (por exemplo `registro_validades_v49/...`).
3. Faça o commit em `main` e confirme o **deployment de produção do Vercel**.
4. Reabra o painel, recarregue a PWA e procure **Primeira importação XLSX** ao lado de **Conferir relatório XLSX**.
5. Na primeira carga, clique no novo botão, envie o XLSX, verifique a prévia e confirme. Nos relatórios seguintes, use **Conferir relatório XLSX**.

A correção é de **interface e API**; **não execute SQL nova** para a v49.

## Proteção de inicialização do Vercel

O incremental inclui novamente `api/sugestoes-queima.js`, módulo necessário para que `api/index.js` inicialize. A ausência desse arquivo já causou erros `ERR_MODULE_NOT_FOUND` com HTTP 500 no `/api/login` e `/api/sessao`. O arquivo deve estar presente em **`api/`** e ser publicado com o backend.

## Verificação local

- Testes JavaScript da aplicação aprovados, incluindo conferência em lotes e modo inicial explícito.
- Testes Python da aplicação aprovados.
- Importação local da API confirmou a presença do módulo `api/sugestoes-queima.js`.

O deploy na produção e a execução real no Supabase não foram realizados aqui.
