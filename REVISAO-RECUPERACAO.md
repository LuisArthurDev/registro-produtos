# Recuperação do Registro de Produtos

## Alterações desta revisão

- Corrigido o roteamento do `Code.gs` para as ações `listarEstoqueVencidos` e `encaminharEstoqueMapa` que já eram chamadas pelo `painelconferente.html`.
- Incluída autorização dessas ações no bloqueio central do servidor.
- A consulta do estoque de vencidos limita os registros à loja da sessão autenticada.
- O encaminhamento valida administrador de loja, loja do registro, funcionário ativo, vínculo do funcionário à mesma loja e bloqueia abas especiais.
- O registro é gravado no mapa de destino antes de ser removido da aba `Vencidos`; a operação usa `LockService` e invalida o cache após concluir.
- Ampliada a camada de tema do Painel Conferente para fundos, cards, tabelas, formulários, filtros, modais, navegação, estados vazios e elementos com fundos claros inline.
- Mantido o seletor manual claro/escuro e a preferência automática do sistema operacional.

## Validações executadas

- Sintaxe JavaScript do `Code.gs` e `login.gs` em conjunto.
- Sintaxe dos arquivos JavaScript do repositório.
- Sintaxe dos cinco blocos JavaScript inline do `painelconferente.html`.
- Conferência das chamadas `jsonpPainel(...)` do painel contra o roteamento e a lista de autorização do servidor.
- Conferência dos caminhos dos arquivos de tema referenciados pelo painel.

## Importante antes de publicar

A revisão estática não substitui um teste conectado à planilha real. Faça uma cópia de segurança da planilha, publique uma nova versão da implantação do Apps Script e teste login por perfil, loja, consultas, edição, exclusão, transferência e encaminhamento de vencidos com contas de teste. Não execute `configurarPlanilha()` sem conferir antes a estrutura atual da aba `Transferencias`, pois essa função pode migrar os dados dessa aba.
