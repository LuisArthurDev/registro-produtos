# Atualização v22 — Seções e exclusões das listagens

## Resumo

- **Menu do Painel Conferente:** `Organização de Seções` passa a chamar-se **Seções**, logo abaixo de Funcionários.
- **Ocultar:** tira o cartão apenas do quadro de organização; o produto continua em Produtos EAN, nos mapas e demais áreas.
- **Excluir:** exclui a seção *das listagens operacionais da loja* (inclusive Produtos EAN, mapas, Controle de Validade, Estoque, Queima, Perdas, Transferências e Sinalizações). **Não apaga produtos ou lançamentos do Supabase**. É reversível por **Gerenciar ocultas e excluídas → Restaurar**.
- **Brinde, Default e Serviços:** deixam de aparecer automaticamente nas áreas operacionais e em Produtos EAN. O filtro aceita caixa alta/baixa, acentos e variações comuns (ex.: `Servicoes`, `Servicos`, `SERVIÇOS`). Essas três categorias não podem ser restauradas pelo quadro.
- As alterações específicas do gestor têm escopo **somente da loja dele**; a exclusão das três categorias acima vale para todas as lojas.
- O histórico de auditoria e os dados arquivados continuam preservados, mesmo para seções excluídas da exibição; consultas diretas ao banco também continuam encontrando esses registros.
- Lançamentos novos de EANs cadastrados em seções excluídas são bloqueados com mensagem clara, evitando criar registros invisíveis.
- **Transferência em massa:** a SQL 015 impede que `todos os filtrados` mova itens de seções excluídas, inclusive em chamadas diretas à API.

## Instalação e ordem correta

1. Crie um backup do banco e faça o deploy primeiro em um ambiente de homologação/branch de testes.
2. Confirme que todas as migrações até a **SQL 014** estão aplicadas, especialmente `013_organizacao_secoes.sql` (a SQL 015 exige essa tabela).
3. Atualize no GitHub o arquivo `.github/workflows/migracao-supabase.yml` e `supabase/015_visibilidade_secoes.sql` para aparecer a nova etapa; **não libere o código novo no Vercel antes de aplicar a SQL 015**.
4. GitHub → Actions → **Supabase - preparar e importar** → **Run workflow** → `etapa = visibilidade_secoes`. Aguarde execução bem-sucedida.
5. Publique a API e `public/assets/` no Vercel. Feche/reabra a PWA ou atualize para receber o cache novo `registro-validades-v22-secoes-visibilidade`.
6. No modo Administrador de Loja, abra **Seções**. Teste ocultar, restaurar e excluir da exibição com uma seção de teste. Confira o filtro em Produtos EAN e em uma aba operacional.
7. Teste a conta de Funcionário: ela não pode modificar a configuração de seções. Teste a transferência por mês opcional; `todos` não pode incluir seções excluídas.

## Regras e segurança

- Configuração persistida em `public.organizacao_secoes`, colunas `oculta_no_quadro` e `excluida_das_listas`; nenhuma linha de `public.produtos` ou `public.mapa_lancamentos` é apagada.
- API `GET`, `PUT` e `PATCH /api/organizacao-secoes`; ocultação/exclusão/restauração exige Administrador da própria loja. Alterações são auditadas.
- Se houver registros sem seção no catálogo, eles permanecem visíveis. Corrija-os em Produtos EAN para classificá-los corretamente.
- EANs excluídos não aparecem nas pesquisas normais, mas a manutenção da tabela SQL, os backups e o Histórico preservam os dados originais.

## Testes executados

- `npm run check`: 184 testes JavaScript aprovados (incluindo 12 da v22).
- `python -m unittest discover -s tests -p 'testar*.py' -q`: 21 testes Python aprovados.
- Renderização do quadro com dados **simulados** no Chromium: larguras de 390 px e 1280 px, ocultação, restauração e exclusão da exibição funcionaram sem erros de JavaScript.
- **Não foram executadas** migrações nem testados dados reais do seu Supabase/Vercel; valide em homologação antes de produção.
