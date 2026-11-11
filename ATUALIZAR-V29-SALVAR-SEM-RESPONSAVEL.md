# V29 — Salvar organização de Grupos com quadros sem responsável

Base: projeto v28 (Vercel + Supabase). Atualização somente de frontend e testes; **não altera os lançamentos**.

## Correção

Em **Painel Conferente → Seções**, o botão **Salvar organização** aceita grupos na coluna **Sem responsável**:

- Grupos ainda não salvos no Supabase são identificados como pendentes, mesmo quando não têm funcionário atribuído. Antes, a tela confundia essa condição com uma atribuição já gravada e mantinha o botão desabilitado.
- Pode salvar vários grupos, inclusive **todos sem responsável**, numa única operação.
- Pode atribuir um grupo a alguém e depois arrastá-lo de volta para **Sem responsável**, salvando a remoção do vínculo.
- Grupos **já salvos** sem responsável não voltam a ficar pendentes só por estarem sem dono.
- Grupos novos ocultos/excluídos do quadro não entram automaticamente no lote; alterações explícitas de responsável são preservadas.
- A coluna Sem responsável é apenas de organização: **não move, altera ou exclui registros do mapa**, nem atribui lançamentos reais a funcionários.

O banco recebe `responsavel_id: null` para grupos sem responsável; a SQL 018, já distribuída na v27, aceita esse valor. **Não existe migração nova para esta atualização.**

## Instalação

1. Certifique-se de que a migração SQL 018 (`salvar_organizacao_grupos`) foi aplicada anteriormente.
2. Atualize o GitHub com os arquivos do pacote de atualização, preservando os caminhos.
3. Confirme que o Vercel concluiu o deploy e reabra/atualize a PWA. O Service Worker agora usa o cache `registro-validades-v29-grupos-sem-responsavel`.
4. Entre como Administrador de Loja e abra **Seções**.
5. Deixe grupos na coluna **Sem responsável**, clique em **Salvar organização** e recarregue a página. As atribuições devem permanecer iguais.
6. Experimente mover um grupo para um funcionário e depois voltar para **Sem responsável**; confirme que ambas as alterações podem ser salvas.

## Verificações

- 238 testes JavaScript e 24 testes Python aprovados no ambiente local.
- Testes específicos cobrem todos os grupos sem dono, lote misto de atribuídos e não atribuídos, desvinculação, grupo novo ainda não persistido e grupos ocultos.
- A API foi testada de forma simulada aceitando `responsavel_id: null`; o banco de produção não foi acessado.
- A navegação pelo Chromium neste ambiente foi bloqueada; confira o comportamento no seu Vercel antes de liberar para operação.
