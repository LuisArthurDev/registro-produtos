# V48 — Relatório Procfit: importar somente NOVOS produtos (sem alterações automáticas nos existentes)

## Problema confirmado nos logs

O painel retornava erros como:

`POST /api/queima/conciliar-relatorio - Error: canceling statement due to statement timeout`.

Esse erro é do PostgreSQL/Supabase (`57014`) e não indica, por si só, que o XLSX está inválido. A função anterior fazia múltiplas consultas por linha do relatório, o que aumentava o tempo de execução para arquivos grandes.

## Mudanças na v48

- **Removido o checkbox “Correções futuras”.** O relatório é usado **somente para adicionar e aprovar novos produtos**. Os campos de quantidade, preço da gôndola e validade da gôndola dos registros existentes **nunca são atualizados pelo relatório**, mesmo quando seus valores no Excel mudarem.
- **Removido o checkbox “Primeira importação”.** A primeira importação e as seguintes seguem a mesma regra: **adicionar somente os produtos que ainda não estão na Queima**.
- Produtos que já estejam na Queima com o mesmo EAN e validade (pendentes, aprovados ou relançados), ou que tenham sido excluídos, são **ignorados**, sem alterar a aprovação, o lote, o Registro, a quantidade, o preço, a validade ou o responsável.
- Somente linhas com **S** (coluna I), Código Interno válido e único no catálogo, **preço informado na L**, quantidade válida na J e validade na H de pelo menos **7 dias** são candidatas a novo cadastro.
- Linhas com **N**, sem preço, de Fórmulas Especiais, só relacionadas a mapas especiais protegidos, já existentes e excluídas são ignoradas e contabilizadas.
- O relatório não possui Lote nem Registro: permanecem sem informação, em vez de receber valores inventados. A primeira aprovação de um produto novo é feita automaticamente; itens sem responsável continuam no fluxo de sugestões/atribuição da v46.
- A edição manual na própria Queima (quantidade, preço da gôndola e validade da gôndola) permanece disponível.

## Otimização de desempenho

1. A nova **SQL 028** substitui a função `public.conciliar_queima_relatorio_v43` com **processamento em lote** (catálogo consultado uma vez por lote, busca de existentes indexada, seleção de novos em conjunto). Elimina a comparação antiga que consultava as tabelas individualmente para cada linha.
2. A API exige **até 40 itens aprovados por chamada**, reduzindo o risco de `statement timeout`.
3. A interface divide o relatório em lotes de 40, mostra o progresso e soma os resultados.
4. A **prévia** (botão Conferir aprovações) analisa o relatório inteiro **sem alterar a Queima**. Não é possível confirmar quando a prévia falhar.
5. A **confirmação** insere/aprova cada lote em sua própria transação. Se um lote falhar, os anteriores poderão ter sido confirmados. **Reimporte o mesmo arquivo para continuar**: a chave do relatório e a verificação de EAN+validade evitam duplicação ou correção de registros existentes. Não descarte o arquivo original.
6. O servidor proíbe `corrigir_aprovados=true` inclusive de clientes antigos. A SQL também bloqueia essa opção.

### Observação sobre a prévia

A prévia é uma estimativa por lote. Se o mesmo produto e validade aparecerem em lotes distintos do XLSX, a confirmação manterá somente a primeira inclusão e as demais serão classificadas como existentes; o total efetivamente incluído pode ser menor que o previsto. O sistema nunca deve criar duplicatas deliberadamente.

## Instalação obrigatória — SQL 028 + Vercel

**Pré-requisitos:** seu Supabase já deve ter recebido as migrações até **SQL 027** (v45; a v46/v47 não exigem SQL adicional).

1. Faça backup do banco Supabase e do repositório atual; teste primeiro em ambiente de homologação.
2. Atualize o GitHub com o ZIP completo **v48**, ou aplique o ZIP incremental **sobre a v47**.
3. Execute `supabase/028_queima_relatorio_somente_novos_em_lotes.sql` **completo** no **Supabase → SQL Editor** (do `BEGIN;` ao `COMMIT;`). Como alternativa, vá a **GitHub Actions → Supabase - preparar e importar → Run workflow** e escolha a etapa `queima_so_novos_lotes_v48`.
4. Confirme o sucesso sem erros. **Depois** faça o deploy da v48 no Vercel. A ordem é necessária: a interface antiga enviava até 1500 itens em uma chamada e a nova SQL limita a 40; a interface nova usa esse limite.
5. Atualize/recarregue a PWA no navegador para ativar o cache `registro-validades-v48-queima-so-novos-otimizada`.
6. Na aba Queima, carregue o XLSX e confira a prévia. Verifique se o sistema mostra novos candidatos e itens existentes ignorados. Clique em **Cadastrar e aprovar novos** e acompanhe o contador dos lotes.
7. Reimporte o mesmo XLSX: não deve alterar quantidade/preço/validade dos registros existentes nem criar duplicados. Para corrigir algo, use o botão **Editar** no registro aprovado.

**IMPORTANTE:** não execute novamente migrações anteriores que substituem `public.conciliar_queima_relatorio_v43` depois da SQL 028 sem reaplicar a 028 por último. As migrações anteriores contêm a função antiga com correções automáticas.

### Validação

- `npm run check` — testes JavaScript (API, filtros, parser, processamento em lotes, migrações).
- `python -m unittest discover -s tests -p 'testar*.py' -q` — testes Python.
- **Não foi executada a SQL em seu Supabase real**, pois não há acesso ao seu banco nesta sessão. O teste local não confirma o tempo de execução na sua infraestrutura. Se voltar a receber `57014`, compartilhe o novo código de referência e o tamanho do lote; não aumente o timeout sem investigar o banco.
