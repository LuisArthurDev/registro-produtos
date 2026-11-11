# Atualização v30 — Copiar TODOS os itens conferidos, sem limite de páginas

Base: v29. Atualização compatível com o Supabase existente, **sem nova migração SQL**.

## Alteração

O botão **Mapa de Validade → Conferir com estoque → Copiar para Conector Procfit — v1.0** utiliza a lista **completa dos registros filtrados na conferência**, e não a página mostrada. Por exemplo, com **100 páginas de 100 registros**, ele considera os **10.000 registros** antes de excluir os inelegíveis.

A cópia:
- Respeita os filtros do mapa (mês do lançamento, funcionário, busca, lote, validade e situação) no momento da conferência.
- Mantém a quantidade corrigida pelo ODS já importado.
- **Não copia** itens com quantidade corrigida zero ou não localizados no estoque; mantém esses registros na tela como quantidade zero.
- Preserva o formato TSV do Conector Procfit: `Código Interno<TAB>EAN<TAB>Lote<TAB>Validade<TAB>Quantidade`.
- Mantém EANs com zeros iniciais e o cabeçalho é incluído apenas uma vez.
- Continua disponível **somente** na aba de Conferência, nunca no Mapa normal.
- Mostra na janela de cópia quantos registros a conferência tem, o número de páginas e quantos itens são elegíveis. O usuário pode copiar novamente ou selecionar todo o texto caso o navegador bloqueie a área de transferência.

## Correção do limite de consulta

Antes, a API lia mapas e estoque em lote com teto de aproximadamente **16.000 registros**. Agora `/mapas` e `/estoque` aceitam leitura paginada com `limit` e `offset`, retornando `paginado: true`, `registros` e `proximoOffset` (nulo no final). O frontend percorre as páginas da API até completar a consulta. **O resultado de uma página não indica o fim** se o cursor aponta para uma próxima, inclusive quando a página está sem registros visíveis por causa das seções/grupos ocultos. Em caso de erro, a consulta é interrompida — não são exportados dados parciais silenciosamente.

A paginação visual (25/50/100 itens) é independente da consulta e da exportação. Foi removida a paginação automática duplicada da tabela de Conferência.

Para não afetar outros recursos do sistema, os endpoints **sem** os parâmetros `offset` e `limit` continuam aceitando os formatos de resposta anteriores.

## Instalação

1. Faça um backup e publique o código v30 no repositório que alimenta o Vercel. Se estiver usando a v29, pode aplicar apenas o ZIP de atualização v30.
2. Aguarde o deploy e recarregue a PWA para atualizar o Service Worker (`registro-validades-v30-procfit-todas-paginas`).
3. Entre em **Mapa de Validade → Conferir com estoque**, aplique o mês e demais filtros e confira o total de registros.
4. Use o seletor de **Itens por página** para navegar entre 25/50/100 linhas. Em qualquer página, clique **Copiar para Conector Procfit — v1.0**. A prévia deve mostrar o número completo de registros elegíveis e quantas páginas há.
5. Cole em um teste de importação do Conector Procfit; não realize movimentação definitiva antes de validar os registros.

## Testes

- **244 testes JavaScript** aprovados, incluindo uma simulação de **100 páginas e 10.000 registros** e testes de APIs com `offset` preservando filtros de seção.
- **24 testes Python** aprovados.
- Teste de interação do navegador não concluído: Chromium bloqueou a abertura da interface local neste ambiente (`ERR_BLOCKED_BY_ADMINISTRATOR`). A integração ainda precisa ser homologada com os dados reais do Supabase e o Conector Procfit.
