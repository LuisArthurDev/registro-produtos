# Atualização v38 — Exportação XLS da conferência com preferência pelo Código Interno

## Origem

Aplicar sobre **v36 corrigida, com o botão Copiar para Conector Procfit restaurado**.

## Comportamento

Em **Mapa de Validade → Conferência do mapa com estoque importado**, o botão **Exportar conferência CSV** foi substituído por **Exportar XLS**. Ele gera um arquivo Excel 97–2003 (`.xls`) binário BIFF8/OLE com exatamente as colunas:

`Motivo | Codigo | Ean | Lote | Validade | Quantidade`

- **Motivo:** valor numérico fixo `4`.
- **Codigo:** Código Interno, inclusive o encontrado no estoque importado quando o mapa não o informar. Se existir, a coluna `Ean` permanece vazia.
- **Ean:** somente usado quando não existe Código Interno; nunca converter a número (preserva os zeros iniciais).
- **Lote:** texto sem alterar caracteres alfanuméricos.
- **Validade:** texto `DD/MM/AAAA` com `/`.
- **Quantidade:** inteira corrigida pela conferência com estoque, nunca acima do saldo.

A exportação percorre **todos os registros filtrados, independentemente da página atual**, exclui produtos marcados como Fórmulas Especiais, registros com quantidade corrigida zero e abas especiais diferentes de **Estoque**. O botão **Copiar para Conector Procfit** continua funcionando em paralelo, sem modificações.

## Implantação

1. Faça backup do repositório atual.
2. Se usa a **v36 corrigida**, extraia o pacote de atualização na raiz do repositório, sobrescrevendo os arquivos correspondentes. Alternativamente, substitua pelo projeto completo desta entrega.
3. Publique as alterações no GitHub e confirme o deploy no Vercel.
4. Recarregue a PWA para renovar o cache de recursos estáticos.
5. Abra a aba de conferência, escolha o mês, consulte o estoque, clique em **Exportar XLS** e confira as seis colunas antes do uso no Procfit.

**Não requer migração SQL.** Limite do formato XLS: 65.535 itens + cabeçalho; para mais itens, reduza os filtros. Este XLS é uma planilha, **não** um arquivo `.TDB` binário.

## Testes

- `npm run check`: 290 testes JavaScript aprovados, inclusive a regra Código Interno prioritário e a preservação de EANs com zero inicial quando faltar código.
- `python -m unittest discover -s tests -p 'testar*.py' -q`: 24 testes Python aprovados.

A validação foi local; homologar os dados reais no navegador publicado antes do uso operacional.
