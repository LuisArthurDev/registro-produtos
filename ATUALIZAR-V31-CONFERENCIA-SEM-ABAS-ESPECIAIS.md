# Atualização v31 — Conferência e cópia para Procfit: funcionários + Estoque

Esta atualização é incremental sobre a **v30** e não altera a estrutura do Supabase.

## Regra da Conferência do mapa com estoque importado

**Incluídos na conferência e na cópia para Conector Procfit — v1.0:**

- Mapas dos funcionários (`tipo_mapa = funcionario`)
- **Estoque** (`tipo_mapa = Estoque`, `mapa_nome = Estoque`), a única aba especial permitida

**Excluídos da conferência e da cópia:**

- **Termolabil** (Termolábil)
- **Psicotropicos** (Psicotrópicos)
- **Antibioticos** (Antibióticos)
- Qualquer outro tipo de mapa não explicitamente permitido

O filtro é aplicado **antes de distribuir o saldo entre os lotes**. Assim, um lançamento em uma aba especial excluída não consome saldo de um produto que também está no mapa de um funcionário ou em Estoque. A exportação possui uma segunda verificação para impedir que um registro indevido seja copiado caso apareça acidentalmente na lista conferida.

## Mantidos sem alteração

- Cópia de **todas as páginas** da conferência, mesmo com 100 ou mais páginas, respeitando os filtros.
- Quantidade corrigida pelo saldo importado do ODS.
- Estoque não localizado = 0; quantidade corrigida 0 é ignorada na cópia.
- Lista para o Procfit com as colunas **Código Interno, EAN, Lote, Validade, Quantidade**, separadas por TAB.
- Cópia por navegador, prévia e alternativa manual `Ctrl+C`.
- O Mapa de Validade normal continua com as abas especiais visíveis, como anteriormente; **a exclusão vale somente para Conferência com Estoque e sua exportação**.
- Nenhum mapa, produto ou saldo é excluído/modificado pela comparação.

## Publicação

1. Substitua os arquivos pelo ZIP completo v31 ou aplique o ZIP incremental **somente sobre a v30**.
2. Confirme o deploy do Vercel e recarregue a PWA para receber a versão do cache `registro-validades-v31-procfit-estoque-unica-especial`.
3. **Não é necessária nova migração SQL**.
4. Abra **Mapa de Validade → Conferir com estoque**, selecione o mês e teste registros de funcionários, Estoque e outras abas especiais. A conferência deve listar funcionários e Estoque, mas nenhuma das outras especiais.
5. Clique **Copiar para Conector Procfit — v1.0**, confira a prévia antes de colar em ambiente de teste do conector.

## Validação local

- **250 testes JavaScript aprovados**, incluindo 6 testes novos para a regra de abas especiais.
- **24 testes Python aprovados**.
- Teste de 100 páginas mistas (10.000 registros) com filtro de tipos e cópia apenas dos elegíveis.

**Atenção:** a conferência foi validada localmente com dados simulados. O Supabase de produção e o Conector Procfit não foram acionados; valide antes de executar movimentações definitivas.
