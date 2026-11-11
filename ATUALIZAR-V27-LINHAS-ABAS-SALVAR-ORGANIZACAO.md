# Atualização v27 — Tabelas em linhas e Salvar organização

Base: v26.1 (Supabase, Vercel, PWA). A atualização é incremental e **não apaga lançamentos**.

## O que muda

1. **Tabelas em linhas:** Mapa de Validade, Conferir com Estoque, Queima, Perdas, Transferências, Produtos EAN, Histórico e demais listagens continuam com linhas, não cards. Até 1499 px as linhas compactas organizam campos em 2 ou 3 colunas internas, com separadores; em telas largas preservam o formato tradicional. A página não precisa de rolagem horizontal. O quadro **Seções por Grupo** é a única área que mantém cards.
2. **Abas internas com nomes:** botões dentro de `page-subnav`, `compare-tabs`, `view-tabs`, `view-month-modes` e controles de abas não são convertidos em ícones. Por exemplo, **Mapa de Validade** e **Conferir com estoque** aparecem por extenso; os botões de ação nas linhas seguem compactos com ícones, `title` e `aria-label`.
3. **Salvar organização:** ao arrastar um Grupo ou trocar o responsável no seletor, a organização muda instantaneamente **na tela**, mas ainda não é enviada ao banco. O botão **Salvar organização (N)** mostra quantos Grupos estão pendentes. **Desfazer alterações** descarta os movimentos locais; **Atualizar análise** avisa caso existam movimentos não salvos. Somente após o clique em Salvar uma requisição envia o lote completo.
4. **Grupo mais frequente:** o resumo dos funcionários indica claramente **Grupo mais frequente**, a partir dos Grupos dos produtos no catálogo, não da Seção.
5. **Banco:** a SQL 018 cria `public.salvar_organizacao_grupos`, que valida todos os Grupos, funcionário ativo, perfil, loja e duplicidades antes de gravar qualquer responsável. O lote é aplicado numa transação PostgreSQL: se falhar, nenhuma atribuição daquele lote é confirmada. Não toca nos mapas, produtos, históricos ou quantidades. As ações de ocultar/excluir grupos continuam gravadas separadamente conforme o funcionamento anterior.

## Instalação (ordem)

1. Faça backup do Supabase e mantenha uma branch de testes para homologar antes da produção.
2. Confirme que as migrações anteriores **até a SQL 017** já foram aplicadas no banco do site.
3. Atualize o repositório GitHub com os arquivos desta versão.
4. Em **GitHub → Actions → Supabase - preparar e importar → Run workflow**, selecione a etapa **`salvar_organizacao_grupos`**. Ela aplica `supabase/018_salvar_organizacao_grupos.sql`, com `SUPABASE_DB_URL` configurado para seu projeto.
5. Verifique o término do workflow e o deploy Vercel. Atualize a PWA/limpe o cache, se necessário, para utilizar `registro-validades-v27-linhas-grupos-salvar`.
6. Entre como Administrador de Loja, abra **Seções**, altere dois Grupos, verifique o contador, clique **Salvar organização** e recarregue: os responsáveis precisam permanecer como foram salvos.
7. Confira no celular as abas **Mapa de Validade / Conferir com estoque** e as tabelas, sem rolagem horizontal.

## Verificações realizadas

- 229 testes JavaScript e 24 testes Python (dados simulados e validações de código).
- Chromium local, em 320, 360, 390, 600, 760, 768, 900, 1024, 1280 e 1600 px: sem overflow horizontal no cenário de tabelas de 9 colunas, abas internas legíveis e botões de ação preservados.
- Teste visual de organização no navegador: alteração de dois Grupos sem POST intermediário e **um único POST** para salvar ambos.

**Limite:** não foi executada a SQL 018 no seu Supabase de produção nem verificado o comportamento com os seus dados reais. Faça uma implantação de homologação antes de liberar a nova função.
