# v55 — Atribuição por seção e exclusão em lote

1. Extraia o ZIP na raiz do repositório v54, mantendo os caminhos dos arquivos.
2. Com a SQL 031 da v54 aplicada, execute
   `supabase/032_atribuicao_sem_responsavel_secoes.sql` no SQL Editor do Supabase.
3. Publique no Vercel e reabra a PWA.

Em **Queima** e **Funcionários**, clique em **Sugestões sem responsável**.
O modal exibe cada seção com a contagem de lançamentos, a soma de unidades e um
seletor. Quando houver responsável ativo configurado para a seção, ele vem
selecionado. Se a seção não tiver titular ativo, o sistema sugere um funcionário
se todos os grupos presentes tiverem esse mesmo titular ativo. Nos demais casos,
escolha o destino manualmente. Revise as escolhas e confirme a distribuição
de uma vez. Itens sem seção conhecida ficam na linha **Sem seção**.

No **Mapa de Validade**, filtre, por exemplo, pela coluna Lote e clique em
**Selecionar todos filtrados → Excluir em lote**. Também é possível selecionar
registros individualmente. A confirmação mostra a quantidade de selecionados
dentro dos filtros atuais, inclusive em outras páginas. A exclusão é lógica,
registrada na auditoria e restrita ao administrador da loja. Cada confirmação
é transacional. Se um item não estiver mais disponível, atualize a consulta.
