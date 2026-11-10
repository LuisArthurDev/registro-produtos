# Atualização v17 — login móvel e restrição do Dashboard

## Alterações

- **Funcionário no celular:** após autenticar, entra em `/lancamentos.html`, mesmo que o endereço tenha conservado um `#dashboard` antigo. O Dashboard do Painel Conferente não aparece no menu nem pode ser carregado por URL/hash.
- **Funcionário no computador:** entra em `/visualizacao.html`, onde vê apenas seu próprio mapa, os vencimentos, retiradas e sinalizações permitidas.
- **Administrador de loja no celular:** após login, entra em `/lancamentos.html`. O botão **Painel Conferente** permite abrir `/#dashboard` mediante clique explícito; abrir esse link não causa redirecionamento de volta para Lançamentos.
- **Administrador Geral:** mantém acesso apenas ao Painel Geral, sem passar pelo Dashboard do Conferente.
- **Gráfico circular de Queima:** permanece exclusivamente no Dashboard do Painel Conferente. A `visualizacao.html` mantém a consulta de informações sobre Queima de itens, mas não exibe gráfico circular.

## Instalação

1. Faça backup e substitua os arquivos no mesmo repositório. O pacote de atualização inclui `public/assets/app.js`, `public/sw.js` e os testes.
2. Aguarde o novo deploy no Vercel, reabra a PWA ou force a atualização do navegador para limpar o cache antigo. O cache foi atualizado para `registro-validades-v17-mobile-funcionario-sem-dashboard`.
3. Teste com um login de funcionário no celular (ele deve abrir Lançamentos), um login de funcionário no computador (Visualização) e um administrador no celular (Lançamentos, com link para Painel Conferente).
4. Para garantir a restrição, experimente `/#dashboard` como funcionário. O navegador deverá sair dessa rota e abrir apenas as páginas autorizadas.

**Não é necessária uma nova migração SQL**: esta versão modifica apenas o roteamento do frontend e os testes, preservando a API e os bancos de dados da v16.

## Verificação

- Testes Node.js para redirecionamento e permissões de rota.
- Testes Python existentes para migração e integridade.
- O navegador de testes deste ambiente impede o acesso ao localhost (`ERR_BLOCKED_BY_ADMINISTRATOR`); portanto, confirme o comportamento visual também no seu Vercel após o deploy.
