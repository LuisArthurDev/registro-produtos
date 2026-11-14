# V43 — Conciliação do relatório de situação da Queima (XLSX)

Base: v42. **Antes de publicar a interface, execute SQL 025 no Supabase.**

## Relatório analisado

Arquivo `data (3).xlsx`, aba Sheet1. A linha 3 é o cabeçalho. Colunas relevantes: A Data, B Produto (Código Interno — descrição), D Loja, H Data de Validade, I Aproado (S/N, grafia original), J Unidade e L Preço. O relatório **não informa Lote nem Registro da Queima**; o sistema não inventa esses dados. A data H é usada como Validade da Gôndola quando o item é aprovado.

Na amostra enviada, há 2.743 linhas com situação S/N: **1.048 S**, **1.695 N**; dos S, **129 com preço em L** e **919 sem preço em L**. Itens N são ignorados. Linhas S sem preço ficam pendentes de revisão e não são aprovadas automaticamente. Os números são do arquivo fornecido, não do banco Supabase.

## Uso

1. Execute `supabase/025_conciliar_queima_relatorio_aprovados.sql` no SQL Editor (arquivo inteiro) ou GitHub Actions, etapa `conciliar_queima_relatorio_v43`.
2. Faça deploy do projeto v43 e recarregue a PWA.
3. Na aba **Queima**, clique **Conferir relatório XLSX** e selecione o relatório.
4. Verifique a prévia. Por padrão, a conferência não cria produtos novos. Marque **Primeira importação** se quiser incluir e aprovar registros S que não estejam na Queima e sejam elegíveis. Marque **Correções futuras** se quiser atualizar quantidade, preço e validade da gôndola de itens já aprovados.
5. Clique **Aplicar conciliação** somente após conferir o resumo. O banco aplica o lote em uma transação.

## Regras de segurança

- Importa somente linhas S; N não altera nada.
- Para registros já pendentes, aprova automaticamente apenas quando o cruzamento for único e houver preço em L.
- Primeira importação respeita o prazo mínimo de **7 dias**, Fórmulas Especiais e proibição de abas especiais.
- Itens sem preço, sem catálogo ou com correspondência ambígua são sinalizados e não alterados.
- O relatório não possui Lote/Registro, portanto novos registros ficam com esses campos não informados.
- Chave de origem estável evita reimportação duplicada; exclusões são lógicas e auditadas.
- Itens aprovados ganham botão **Editar** para quantidade, validade da gôndola e preço; todos os itens podem ser excluídos com confirmação e auditoria.
- A conciliação é limitada a 1.500 linhas S por execução. A amostra cabe no limite.

## Testes

`npm run check` e `python -m unittest discover -s tests -p 'testar*.py' -q`.

**Atenção:** os testes locais não comprovam a execução no Supabase real. A migração e a primeira importação devem ser homologadas em ambiente controlado, com backup e revisão da prévia.
