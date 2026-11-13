# v36 — restauração do botão Copiar dados para o Procfit

## Alteração

Restaurada, na aba **Mapa de Validade → Conferir com estoque importado**, a ação **Copiar para Conector Procfit — v1.0**, em substituição à ação **Preparar arquivo Procfit (JSON)** da v36 anterior. Esta é uma correção da v36, não uma reinstalação da v37.

- Copia as linhas elegíveis da conferência **de todas as páginas** (a paginação da tela não limita a lista).
- Preserva o Código Interno, EAN (inclusive zeros à esquerda), Lote, Validade e Quantidade Corrigida.
- Mantém a exclusão de Fórmulas Especiais, registros não elegíveis e quantidades corrigidas zero.
- Apresenta prévia, **Copiar novamente** e **Selecionar tudo** como alternativa para navegadores que bloqueiam a área de transferência.
- Não cria arquivos TDB e não requer novas migrações SQL.

## Instalação

**Projeto completo:** substitua os arquivos no repositório pelo conteúdo do ZIP completo.

**Atualização incremental:** sobre a versão **v36-restaurada**, substitua pelos arquivos do ZIP da atualização. Faça deploy no Vercel e recarregue a PWA para receber o novo service worker. Se ainda aparecer JSON, feche outras abas do app e recarregue novamente.

## Verificação

Execute `npm run check` na raiz e `python -m unittest discover -s tests -p 'testar*.py' -q`. Validado localmente com 285 testes JavaScript e 24 testes Python. O acesso à área de transferência depende de permissão do navegador; teste no ambiente publicado antes de usar em produção.
