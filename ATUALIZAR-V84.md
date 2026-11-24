# V84 — Novo lançamento no mapa de funcionários

## Correções
- Administrador da loja pode selecionar funcionários ativos da mesma loja em Novo lançamento.
- Preservação do funcionário escolhido após cada gravação; modal permanece aberto.
- Limpeza apenas dos campos de produto (EAN, lote, validade, quantidade) para registrar o próximo.
- API confirma que o destino é um funcionário ativo da loja antes de chamar gravar_lancamento.
- Gerente continua restrito a abas especiais; funcionário continua limitado ao próprio mapa.
- Alteração de versão do JavaScript e Service Worker para evitar cache desatualizado.

## Instalação
Substitua os seis arquivos mantendo suas pastas e publique novamente. Não há SQL novo neste pacote.

## Verificação
Sintaxe do frontend e backend validada. A função SQL gravar_lancamento preexistente não foi executada aqui; teste com usuário administrador e funcionário ativo.
