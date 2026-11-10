# Atualização dos lançamentos, mapas, transferências, Queima e notificações

Versão de homologação – 09/11/2026. **Não ativa automaticamente alterações no Supabase**.

## Instalar na ordem correta

1. Faça backup do repositório e do Supabase antes de alterar o sistema em produção.
2. Envie os arquivos do pacote ao **mesmo repositório GitHub** na branch de testes.
3. Abra **GitHub → Actions → Supabase - preparar e importar → Run workflow** e selecione `etapa=atualizar_operacoes`. Essa etapa roda `supabase/008_operacoes_lancamento.sql` pela conexão PostgreSQL já configurada em `SUPABASE_DB_URL`. **Não use `estrutura` nem `importar`: isso não é uma reimportação de dados**.
4. Confirme o sucesso do SQL. Ele adiciona `request_id` às transferências, mantém registros de mapa excluídos com `excluido_em` e atualiza as funções de Queima / encaminhamento. Não apaga dados antigos.
5. Aguarde o deploy no Vercel da mesma branch e teste com uma conta fictícia em uma loja de homologação. Somente após confirmar o funcionamento publique na branch de produção.
6. Reabra a PWA ou atualize a página, para que o Service Worker v9 descarte o cache antigo.

## Regras implementadas

- **Login móvel:** após login normal no celular, abre `/lancamentos.html`. O administrador tem link **Painel Conferente**. Funcionário comum não recebe este link. O Admin Geral continua no Painel Geral.
- **Novo lançamento:** o botão do topo foi removido; o lançamento continua disponível na aba Mapa de Validade e na página dedicada. O nome encontrado no catálogo aparece acima do EAN.
- **Funcionário:** mapa definido pelo nome do login, sem seletor. A API ignora qualquer mapa enviado por funcionário.
- **Administrador de Loja:** no formulário de Lançamentos pode escolher aba especial (Estoque, Termolábil, Psicotrópicos, Antibióticos) ou **Transferência recebida**. A origem e o romaneio são obrigatórios e a loja de destino é sempre a da conta. A aba **Transferências** usa a mesma API, com identificador de tentativa para evitar reenvios duplicados.
- **Validade:** entradas `01/26`, `1/26`, `31/01/26` e `31/01/2026` são aceitas. Mês/ano é gravado como **último dia do mês**. O backend recebe ISO `YYYY-MM-DD`.
- **Som:** um bipe curto ocorre somente após confirmação de gravação; depende de permissão de áudio do aparelho/navegador.
- **Histórico:** consulta o nome do usuário no Supabase; `autor_original` permanece como fallback para eventos importados.
- **Mapa:** Editar, Excluir, Lançar na Queima ou Lançar como Vencido de acordo com status; exclusão preserva relacionamentos e auditoria. Estoque mantém ação Descer para Mapa.
- **Queima:** registro pendente do mês atual: Aprovar ou Excluir; pendente de mês anterior: Relançar ou Excluir; aprovado/relançado: sem nova aprovação. SQL e API reforçam a regra.
- **Notificações:** a solicitação de permissão é iniciada pelo clique (antes de aguardar o SDK remoto), com instruções visíveis em caso de bloqueio. Continuam opcionais para todos os perfis e sem aprovação administrativa.

## Limitações / homologação obrigatória

- Testes de lógica e API simulada foram realizados, mas **nenhum lançamento, transferência ou notificação foi enviado ao seu Supabase/Vercel real neste ambiente**.
- Faça testes com contas de funcionário e administrador, conferindo as tabelas `mapa_lancamentos`, `transferencias`, `queima`, `vencidos` e `auditoria`.
- O fluxo completo de **fila offline automática e sincronização posterior** continua pendente. Hoje, as tentativas de mapa/transferência ficam guardadas no dispositivo para retomada manual em caso de falha.
- Os envios automáticos OneSignal continuam dependendo das chaves privadas do Vercel e de teste real em aparelhos. Não é necessário compartilhar essas chaves.
- A paridade integral com todos os botões da versão legada ainda requer validação funcional junto ao sistema antigo, além das novas ações descritas aqui.

## Verificações

`npm run check` — 87 testes JavaScript aprovados (incluindo API simulada).

`python -m unittest discover -s tests -p 'testar*.py' -q` — 21 testes Python aprovados.

Use a branch de homologação e não substitua a aplicação operacional até concluir os testes.
