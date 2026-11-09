# Ajuste — Visualização por status sem filtro obrigatório de data

Arquivos alterados: `visualizacao.html` e `code.gs`.

## Comportamento atualizado

- O modo **Vencidos e status** seleciona **Todos os status** por padrão: Vencido, A vencer e Vendável.
- `visualizacao.html?aba=vencidos` e `visualizacao.html?aba=validade` entram diretamente nesse modo, sem exigir mês ou data.
- O campo de data continua disponível apenas como pesquisa opcional, sem restringir automaticamente a visualização quando o usuário muda de modo.
- Funcionários visualizam apenas seus registros, determinados pelo login. O filtro visual reforça a restrição do servidor.
- Administradores de loja podem selecionar funcionários da loja, pois o cadastro passa a ser solicitado no modo `gestao`.
- A lista de validade é exibida mesmo se a consulta auxiliar à Queima atrasar ou falhar; uma mensagem alerta que os prazos especiais de Nutrição/Conveniência podem ficar imprecisos.
- Falhas na consulta ao catálogo de produtos deixam de bloquear a listagem do mapa. O catálogo é completado após a resposta, e a seção/status são atualizados.
- A tela de carregamento é fechada se uma requisição falhar.

## Backend

`code.gs` agora agrupa registros por **funcionário/aba + EAN + lote + validade + loja de origem**, evitando misturar quantidades de mapas diferentes.

## Publicação

1. Substitua `visualizacao.html` no GitHub Pages.
2. Atualize `code.gs` no projeto existente do Apps Script (preservando `login.gs`) e **publique uma nova versão da implantação Web App**.
3. No celular, abra `visualizacao.html?aba=vencidos` já autenticado. Verifique Vencido, A vencer e Vendável sem preencher datas.
4. Teste com login de funcionário e administrador: o funcionário deve ver só o próprio mapa; o administrador pode alternar funcionários da loja.
5. Valide em homologação antes de publicar no ambiente de produção.

**Observação:** O modo exibe registros de validade ainda presentes nos mapas autorizados pelo Apps Script. Registros efetivamente retirados dos mapas e transferidos para outras abas não fazem parte da consulta `validades` original. A conexão real com a planilha não foi executada neste ambiente; foi feita inspeção estática da lógica e dos contratos do frontend/backend.
