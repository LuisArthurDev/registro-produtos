# Visualização do próprio mapa — atualização v14

## Arquivos incluídos

A página **`public/visualizacao.html`** é um endereço próprio no Vercel, com o mesmo login, CSS, tema e autenticação de `lancamentos.html`.

- **Qualquer funcionário** vê o botão **Visualizar meu mapa** na página Lançamentos; o link abre `https://vconferencia.vercel.app/visualizacao.html`.
- O funcionário vê exclusivamente lançamentos do seu login e da sua loja; não consegue escolher outro funcionário nem obter dados alheios por URL/API.
- O **Administrador de Loja** consegue consultar os mapas da loja, filtrando por funcionário/aba, e tem acesso ao botão **Painel Conferente**. Funcionários comuns nunca recebem esse botão.
- O **Administrador Geral** continua restrito ao Painel Geral, não podendo operar mapas nesta página.

## Funcionalidades recuperadas do antigo `visualizacao.html`

1. Histórico **Por mês de lançamento** ou **Validade (a vencer)**, opção **Todos os meses**, filtros por mês, situação, EAN, descrição, lote e validade.
2. Indicadores: registros, quantidade, a vencer com dias restantes, vencidos (considerando as regras da loja), retiradas e, para administradores, quantidade de funcionários nos mapas.
3. Tabela com descrição, EAN, mapa, lote, validade, quantidade, mês, situação, paginação de **15/25/50** e exportação CSV/impressão.
4. Abas **Vencidos / Retiradas** e **Sinalizações** do próprio mapa, inclusive registros legados vinculados pelo nome do mapa de origem.
5. **Editar**, **Excluir** (exclusão lógica com auditoria) e **Sinalizar ao Administrador** em cada lançamento. Motivos: **Não Entrou na Queima**, **Muita Quantidade** ou **Outras** (descrição obrigatória).
6. **ⓘ Queima** mostra os registros daquele produto vinculados ao lançamento, com data e aprovação.
7. **Encaminhar para Vencidos** para produtos dentro da janela de retirada, sempre com confirmação e gravação transacional. Usa 60 dias para seções comuns e 15 para alimentos/nutrição/conveniência, sem permitir repetir a retirada de um mesmo lançamento.

## Como instalar

1. Faça backup do repositório e do Supabase e envie os arquivos para uma **branch de homologação** do mesmo GitHub.
2. Antes de liberar o link no Vercel, execute em **GitHub → Actions → Supabase - preparar e importar → Run workflow** com `etapa=atualizar_visualizacao`. A etapa aplica `supabase/010_visualizacao_funcionarios.sql`; não reimporta mapas nem modifica o histórico existente.
3. **Pré-requisito:** as migrações anteriores **008** (`atualizar_operacoes`) e **009** (`atualizar_perdas_transferencias`) devem ter sido aplicadas. SQL 010 usa as colunas `excluido_em` criadas anteriormente.
4. Confirme o deploy e abra o Vercel em `/lancamentos.html`. Use o botão **Visualizar meu mapa**.
5. Teste com pelo menos um funcionário e um administrador: o funcionário deve ver apenas seu mapa; edição/exclusão/sinalização devem deixar auditoria; somente administrador deverá ver o link de acesso ao Painel Conferente.
6. Confirme que o GitHub Pages encaminha `docs/visualizacao.html` para `https://vconferencia.vercel.app/visualizacao.html`.

## Observações e limites

- A tela exibe retiradas antigas sem `lancamento_id` **somente quando a coluna `mapa_origem` corresponde ao login do funcionário**. Linhas antigas sem nenhum vínculo identificável não são exibidas ao funcionário, para evitar vazamento de dados de outros mapas. O administrador ainda pode conciliá-las na aba Perdas.
- Este recurso precisa de conexão para ler, editar ou sinalizar; a sincronização offline automática completa continua pendente.
- A interface foi testada com dados simulados em Chrome/Chromium; **não** foi efetuada movimentação real de estoque nem alteração de registros na instância Supabase do usuário.
- Regras especiais de produtos, critérios de retirada e histórico devem ser homologados em ambiente de teste antes de liberar operações reais.
