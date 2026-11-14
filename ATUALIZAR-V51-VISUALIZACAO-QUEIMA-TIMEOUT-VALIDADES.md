# V51 — Visualização apenas Mapa + Queima, correção de timeout 57014 e edição das duas validades

**Base:** projeto completo v50. Atualização incremental disponível para quem está com a v50 publicada.

## 1. Visualização do funcionário e administrador

- Em `visualizacao.html` existem **apenas Mapa/Lançamentos** com os modos **Por mês de lançamento**, **Validade (a vencer)** e **Queima (aprovados)**.
- As abas antigas **Vencidos/Retirados** e **Sinalizações** não são renderizadas para nenhum perfil, inclusive administrador. As ações legítimas de sinalizar um lançamento ou encaminhar um vencido continuam disponíveis dentro do mapa.
- **Queima (aprovados)** exibe somente os itens que tenham vínculo de lançamento no mapa autorizado, origem comprovada nesse mapa ou atribuição explícita àquele funcionário. Não exibe Queimas pendentes, relançadas ou excluídas. O backend também verifica a loja e o usuário; não depende da tela para proteger os dados.
- **Administrador de loja** continua restrito às suas abas especiais na Visualização (`Estoque`, `Termolabil`, `Psicotropicos`, `Antibioticos`) e pode escolher qual delas visualizar. O funcionário vê apenas o próprio mapa.
- A nova aba exibe Produto/EAN ou Código Interno, Lote, Validade do Produto, Validade da Gôndola, Preço, Quantidade informada e Situação. Está disponível somente para consulta; não permite aprovar nem editar a Queima pelo perfil de funcionário.
- **Aviso fixo:** *A quantidade informada na Queima pode estar incorreta. Confira o produto e o estoque antes de utilizar essa quantidade como saldo.*
- No celular, as informações da Queima aparecem em linhas com campos distribuídos em duas colunas, **sem rolagem horizontal**. Os botões de filtro e exportação continuam acessíveis.

## 2. Prévia XLSX: timeout do Supabase (`57014`)

O erro apresentado foi `canceling statement due to statement timeout` ainda no **primeiro lote**. A v51 tenta resolver a causa sem aumentar limites arbitrariamente:

1. `SQL 030` cria índices no banco para procurar Queimas ativas/excluídas por loja e validade, além de Código Interno normalizado.
2. A função de conciliação materializa os **EANs do catálogo uma vez por lote**, substituindo subconsultas repetidas do catálogo para cada Queima comparada.
3. A API e a interface passam a usar **lotes de até 10 itens** (antes 40).
4. Se receber especificamente `57014`, a interface divide o lote novamente (até um item), tenta essas partes menores e mantém progresso. Outros erros **não são repetidos automaticamente**.
5. **A prévia permanece somente leitura.** Se qualquer subconjunto falhar, não é possível confirmar a importação.
6. Na confirmação, lotes anteriores podem ter sido gravados se um lote posterior falhar; a mesma planilha pode ser reenviada porque existe prevenção de duplicidade por chave do relatório e código/validade. Os existentes não são atualizados.

**Importação Procfit preservada:** somente itens com `S`, que ainda não estejam na Queima, e com validade **posterior ao dia atual**. Preço/EAN/quantidade ausentes permanecem pendentes para correção manual. A regra de sete dias para novos lançamentos manuais não foi modificada.

**Limitação:** os testes locais não comprovam o desempenho do Supabase real. Se até o lote de **um item** exceder o tempo do banco, precisaremos do novo erro para verificar índices, bloqueios e plano de execução.

## 3. Edição das duas validades na aba Queima

No Painel Conferente, abra **Queima → Editar** em um item **aprovado**:

- **Validade do Produto** — modificável e independente.
- **Validade da Gôndola** — modificável e independente.
- **Quantidade** e **Preço da Gôndola** — continuam disponíveis para correção manual.
- Se o produto foi importado sem preço ou quantidade verificável, pode editar as datas **sem inventar esses valores**. A quantidade pendente continua sinalizada enquanto não for informada.
- Todas as alterações são validadas na API e registradas na auditoria, incluindo os valores anteriores e novos.
- A SQL 030 permite a correção de datas em um item **já aprovado** mesmo se ele passou a ter menos de sete dias de validade. Isso **não afrouxa as regras para novos lançamentos**.

## Instalação obrigatória, na ordem certa

**Antes:** faça backup do banco e do repositório. Se você já instalou a SQL 029 da v50, **não precisa repeti-la**.

1. Atualize os arquivos do repositório no GitHub: ZIP completo da v51 ou ZIP incremental **sobre a v50**. Confirme que o módulo `api/sugestoes-queima.js` está no repositório (a ausência dele já provocou HTTP 500 no login).
2. No Supabase **do mesmo projeto usado pelo Vercel**, execute o arquivo **`supabase/030_conciliacao_queima_indice_lotes_editar_validade.sql`** inteiro no SQL Editor, do `BEGIN;` ao `COMMIT;`. Alternativamente, **GitHub Actions → Supabase - preparar e importar → Run workflow → `queima_timeout_e_validade_v51`**.
3. Confirme o sucesso da SQL 030 **antes de publicar o frontend e a API no Vercel**: o servidor novo limita a 10 itens e a função SQL nova também exige esse limite.
4. Publique a versão v51 no Vercel e atualize a PWA. Seu Service Worker agora tem nome `registro-validades-v51-visualizacao-queima-timeout-validades` para invalidar a interface antiga. Se ainda vir as abas antigas, faça recarga forçada ou limpe os dados do site.
5. Em **Visualização** (funcionário e administrador), valide apenas os três modos. Confirme que os itens da Queima estão aprovados, vinculados ao perfil correto e exibem o aviso de quantidade.
6. Em **Queima**, teste a edição das duas validades em um item aprovado (de preferência no ambiente de homologação). Teste a prévia XLSX com o arquivo original: o progresso deve começar pelo lote 1 de até 10 itens.

**Atenção:** reexecutar a SQL 029 **depois** da SQL 030 substitui a função otimizada pela antiga e pode fazer o timeout voltar. Se precisar reaplicar uma migração anterior, reaplique a SQL 030 por último.

## Verificações locais

- Testes Node.js de API, interface, limites, edição, atribuição e prevenção de acesso cruzado.
- Testes Python de processamento legado.
- Teste em navegador Chromium com viewport móvel, conferindo os três modos, aviso e aprovação restrita a leitura.

A implantação real do SQL 030 **não foi executada neste ambiente**; ainda depende de homologação no Supabase de produção.
