# Atualização v53 da Queima

A v53 inclui as alterações de layout da v52 e publica a interface com URLs
versionadas. A lista de funcionários das sugestões é consultada por páginas
ordenadas por ID. Se o histórico ou a organização de grupos estiver indisponível,
o modal pode apresentar resultados parciais e ainda oferecer a escolha manual.

## Publicação

1. Extraia o ZIP e atualize o repositório conectado ao Vercel. Preserve os
   caminhos `api/` e `public/`, incluindo `api/sugestoes-queima.js`.
2. Confirme que o deploy de produção concluiu e recarregue a página ou reabra a
   PWA para atualizar os arquivos.
3. Abra a Queima em um computador e em um celular. Confira se as linhas ficam
   compactas, se o menu lateral começa recolhido e se o botão ⋯ abre os detalhes.
4. Abra Sugestões sem responsável em um produto de um grupo grande e confira
   se o seletor mostra os funcionários ativos da loja.

A v53 não adiciona migração SQL.
