# Atualização v41 — Prazo mínimo de 7 dias até o vencimento para Queima

Esta atualização substitui somente a **regra de prazo de lançamento na Queima** da versão v40. Preserva o leitor de relatórios `Queima-<Registro>.xls`, os registros existentes, o histórico, a aprovação com dados de Gôndola, Fórmulas Especiais e a Visualização somente Mapa/Lançamentos.

## Regra exata

A validade do produto deve ser **igual ou posterior à data atual da loja + 7 dias de calendário**, considerada a data local de **America/Sao_Paulo**.

Exemplo para **14/11/2026**:

| Validade | Situação |
| --- | --- |
| 13/11/2026 ou antes | Bloqueado (vencido) |
| 14/11/2026 (hoje) | Bloqueado |
| 15 a 20/11/2026 (1–6 dias) | Bloqueado |
| 21/11/2026 (7 dias) | Permitido, se passar nas demais regras |
| 22/11/2026 em diante | Permitido, se passar nas demais regras |

O cálculo utiliza dias de **calendário**, não a diferença de horas entre `agora` e uma data sem horário. Isso evita divergências relacionadas a UTC, feriados, transição de mês ou virada do ano. A API e o Supabase fazem a validação novamente no instante da gravação.

## Abrangência

- **Mapa de Validade → Lançar na Queima:** botão bloqueado para validade de 0 a 6 dias; itens já vencidos continuam com a ação própria de retirar como Vencido. A seleção múltipla também é bloqueada quando houver algum produto sem o prazo mínimo.
- **Queima → Novo lançamento:** impede cadastrar com validade vencida, hoje ou nos próximos 6 dias; o Registro continua obrigatório. Os dados de Gôndola continuam sendo exigidos **apenas na aprovação**.
- **Queima → Importar relatório XLS:** a prévia informa itens aptos, vencidos e não vencidos com menos de 7 dias. A importação ignora os dois tipos de itens inaptos e mantém os demais válidos. O resumo passa a incluir `ignorados_prazo_insuficiente`, mantendo `ignorados_vencidos` para vencidos de fato.
- **Relançamento:** também é protegido pelo trigger PostgreSQL, pois cria um novo registro na Queima.
- **Mudança da validade de um registro de Queima:** o banco impede que uma edição burle a regra. **Aprovar um lançamento pendente já existente não altera a validade do produto**, portanto esta migração não bloqueia aprovações somente por ter chegado a menos de 7 dias após o lançamento original.

As demais condições operacionais não foram alteradas: Motivo 4, restrições de Fórmulas Especiais, abas especiais, Registro do Procfit, idempotência por linha do XLS e preenchimento manual de Validade/Preço da Gôndola na aprovação.

## Instalação — SQL 023 obrigatória

1. Faça **backup** do Supabase e do repositório; use um ambiente de homologação antes de publicar na loja.
2. Confira que a **v40** e a migração **SQL 022** já foram implantadas no mesmo Supabase do Vercel.
3. Atualize o GitHub com o conteúdo da **v41** (ZIP completo ou ZIP de atualização sobre a v40).
4. Execute **GitHub → Actions → Supabase - preparar e importar → Run workflow**. Selecione a etapa **`queima_prazo_minimo_7_dias_v41`**. Ela executará `supabase/023_queima_prazo_minimo_7_dias.sql`.
5. Confirme sucesso sem erros. **Só depois** faça deploy no Vercel e recarregue a PWA, cujo cache passou a ser `registro-validades-v41-queima-validade-minima-7-dias`.
6. Em homologação, teste produtos que vencem em **0, 6, 7 e 8 dias**, tanto por cadastro manual quanto por envio do Mapa e importação XLS. Confirme que os de 7 e 8 dias permanecem sujeitos às demais verificações.

> **Não execute novamente a SQL 022 isoladamente após a SQL 023**, pois ela contém as funções antigas da v40 e sobrescreveria a regra dos 7 dias. Caso precise reaplicar a 022, execute **023 novamente depois**.
>
> A SQL 023 é incremental, não apaga nem altera registros históricos. Atualiza funções e o trigger de prazo, preservando permissões do serviço.

## Validação feita

- `npm run check` — **311 testes JavaScript aprovados**.
- `python -m unittest discover -s tests -p 'testar*.py' -q` — **24 testes Python aprovados**.
- Testes de limites: 6 dias = bloqueado; 7 dias = aceito; datas inválidas = bloqueadas; calendário atravessando fim do mês e virada do ano.
- Testes de proteção em API (cadastro manual, envio de mapa), presença do trigger/RPCs na SQL 023, permissões e manutenção da aprovação com dados da Gôndola.

A SQL 023 **não foi executada no Supabase real do usuário**. A implantação e a integração real com o Procfit ainda precisam de homologação.
