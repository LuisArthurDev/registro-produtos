# V50 — Primeira importação do relatório Procfit: incluir todos os produtos S NOVOS, mesmo sem preço ou catálogo

## Regra solicitada

O arquivo **XLSX do relatório de situação do Procfit** é a fonte das aprovações. A primeira importação e as seguintes devem **cadastrar e aprovar todos os produtos com S (coluna I) que ainda não foram lançados na Queima**, sem bloquear por falta de preço, quantidade informada, catálogo, EAN, Fórmula Especial ou aba especial.

**Única condição de elegibilidade do produto:** a data de validade (coluna H) precisa ser futura. Para proteger a regra anterior de que produtos que vencem hoje também não podem ser enviados, são **bloqueados os vencidos, os que vencem hoje e aqueles cuja validade não pode ser verificada**. Produtos que vencem amanhã já podem entrar **neste importador Procfit**.

As regras de **7 dias** e de **Fórmula Especial** permanecem para lançamentos **manuais e envio a partir do Mapa**, mas são dispensadas somente para linhas `S` importadas deste relatório identificadas pela origem Procfit.

- **I = S**, ainda não lançado: **cadastrar e aprovar** automaticamente.
- **I = N**: ignorar completamente.
- **Já cadastrado na Queima**, pendente, aprovado ou relançado: manter sem qualquer alteração. Itens excluídos anteriormente também não serão reintroduzidos.
- **Preço L ausente ou inválido**: cadastrar aprovado com `preco_gondola = NULL`, indicando **Preço pendente** para edição manual.
- **Código/EAN não encontrado no catálogo**: cadastrar mesmo assim, preservando o Código Interno e a descrição original da coluna B; **EAN fica NULL**, nunca inventado.
- **Quantidade J ausente/não válida**: cadastrar com quantidade **0 e `quantidade_pendente=true`**, sinalizando pendência, sem inventar unidade. Na edição manual, preencher a quantidade real.
- **H sem data válida**: não importar porque não é possível verificar se está vencido; a prévia contabiliza `sem_validade`.
- **Lote e Registro não aparecem no relatório**: continuam ausentes, sem valores fictícios.
- Badge **Aprovado via importação**, verificação e **Sem responsável/Sugestões** continuam disponíveis.

## O que mudou no sistema

- **SQL 029**: atualiza somente a função de conciliação de aprovados do Procfit, adapta os triggers de aprovação e vencimento **apenas para essa origem**, adiciona `codigo_interno`, `descricao_original`, `produto_relatorio` e `quantidade_pendente` à Queima e permite EAN NULL **somente** em importações Procfit identificadas.
- **Leitor XLSX**: preserva todas as linhas `S`, inclusive as que antes eram descartadas por não terem preço, quantidade, código ou data. Datas inexistentes entram na prévia como `sem_validade` e são ignoradas pelo banco.
- **API**: não rejeita os itens S por ausência desses dados e mantém a restrição administrativa de importar em lotes de 40; correções futuras automáticas continuam proibidas.
- **Modal**: mantém **Primeira importação XLSX** e sua caixa de seleção, mostra a contagem dos novos itens e as exclusões por vencimento/data ausente e destaca **Preço pendente**.
- **Edição manual**: atualizar quantidade de aprovado retira a marca `quantidade_pendente`.

## Instalação — migração SQL 029 obrigatória

1. Faça backup do Supabase e do repositório. Verifique se todas as migrações até a **SQL 028** já foram executadas.
2. Atualize os arquivos do repositório para **v50** (projeto completo ou atualização sobre a v49), mantendo `api/sugestoes-queima.js` no caminho correto para não quebrar o login.
3. Execute no Supabase **o script inteiro** `supabase/029_importacao_queima_todos_s_sem_preco.sql`, do `BEGIN;` ao `COMMIT;`. Alternativamente, publique o workflow e execute **GitHub Actions → Supabase - preparar e importar → Run workflow → `queima_todos_s_nao_vencidos_v50`**.
4. Confirme a migração sem erros. Depois faça deploy no Vercel e recarregue o site/PWA.
5. Abra **Queima → Primeira importação XLSX**, escolha o arquivo, confira a prévia e confirme. Se houver falha de lote, reenvie o mesmo relatório; o sistema preserva itens existentes e evita duplicá-los.
6. Teste em ambiente de homologação: S sem preço, S sem EAN, S com validade amanhã, S vencendo hoje e N, além de reimportação sem duplicidades.

**Atenção:** a SQL 029 redefine três funções de trigger e a RPC de conciliação. Não reexecute SQLs antigas (020, 023, 025, 028) **depois** dela, pois essas versões restaurariam restrições anteriores; se for necessário, reaplique **029 por último**. A alteração relaxa a exigência de EAN especificamente para dados cuja origem seja o relatório Procfit. Teste outros consumidores da tabela Queima antes de aplicar em produção.

## Validação local

Foram testados: leitura de linhas S sem informações; distinção S/N; envio da API com preço/código/validade nulos; proteção da origem no banco; diferenciação entre importação e lançamentos manuais; integridade da interface e do módulo de sugestões. **Não foi feito deploy no Vercel nem migração no Supabase de produção**; a execução real ainda requer homologação.
