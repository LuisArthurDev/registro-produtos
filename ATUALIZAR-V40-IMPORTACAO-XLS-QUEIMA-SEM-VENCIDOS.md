# Atualização v40 — Importação XLS da Queima, Registro e bloqueio de vencidos

**Base: v39 (Visualização somente Mapa/Lançamentos).** A atualização é aditiva: não apaga os lançamentos existentes. A importação real no Supabase e o deploy no Vercel ainda não foram executados aqui.

## Visualização

A página `visualizacao.html` mantém **somente Mapa/Lançamentos**, com os dois modos **Por mês de lançamento** e **Validade (a vencer)**. As abas **Vencidos/Retirados** e **Sinalizações** não aparecem nessa página para nenhum perfil. Essa restrição é herdada da versão v39 e preservada na v40.

## Queima — importar o relatório Procfit

Acesse **Painel Conferente → Queima → Importar Queima XLS** e escolha o relatório exportado pelo Procfit, no formato `Queima-<numero>.xls`, por exemplo `Queima-166240.xls`. O leitor interpreta o arquivo binário XLS (Excel 97–2003), incluindo datas seriais do Excel, lotes, produto (Código Interno), EAN opcional, Motivo 4 e Quantidade.

O número **Registro da Queima** vem do próprio nome do arquivo. O relatório de exemplo contém **100 linhas e 260 unidades**. Linhas com Código Interno são conciliadas com a tabela `produtos` para localizar o EAN correspondente; códigos não localizados ou ambíguos são ignorados com uma contagem específica, não associados a um produto errado. Linhas repetidas do mesmo produto continuam sendo ocorrências distintas (uma por linha física).

A prévia informa quantas linhas estão vencidas e serão ignoradas; a confirmação submete o lote inteiro em **uma transação** via `public.importar_queima_xls_v40`. O índice único `(loja_id, registro_queima, linha_importada)` impede importar a mesma linha mais de uma vez ao repetir o relatório. O resumo contabiliza importados, vencidos, duplicados, EAN/Código não encontrado, Fórmulas Especiais, abas especiais e linhas inválidas.

**Produtos vencidos não entram na Queima:** validade anterior à data atual em `America/Sao_Paulo` é bloqueada na API e também pelo trigger SQL. Essa verificação protege a importação XLS, o cadastro manual, os encaminhamentos de Mapa e o relançamento. Validade igual ao dia atual não é bloqueada *apenas* pela regra de vencimento. Data inexistente, sem validade ou inválida não é aceita.

## Registro e dados da Gôndola

- **Registro da Queima** é obrigatório para novos lançamentos manuais e para encaminhar itens do Mapa à Queima. A listagem mostra esse número por linha.
- **Validade da Gôndola** e **Preço da Gôndola** **não são solicitados ao cadastrar**; são informados apenas ao clicar **Aprovar**, nos respectivos campos de aprovação.
- A criação de lançamentos é feita como **pendente**. Registros de Queima aprovados precisam ter ambos os campos de Gôndola preenchidos. Aprovações continuam manuais, jamais executadas automaticamente pelo leitor do relatório.
- Continuam bloqueadas Fórmulas Especiais e abas especiais, exceto **Estoque**.

## Instalação — a ordem é obrigatória

1. **Faça backup do Supabase** e do repositório. Teste com loja/ambiente de homologação antes de executar com dados reais.
2. Verifique se as migrações anteriores foram aplicadas, em especial **SQL 020** e **SQL 021**.
3. Atualize os arquivos do repositório com a v40. Se estiver na **v39**, pode utilizar o ZIP de atualização menor, sobrescrevendo os arquivos. Também é possível usar o projeto completo.
4. Acesse **GitHub → Actions → Supabase - preparar e importar → Run workflow**. Escolha a etapa **`importacao_queima_xls_v40`**. Ela executa `supabase/022_importacao_xls_queima_validade.sql` no banco configurado por `SUPABASE_DB_URL`. Confirme que concluiu **sem erros**.
5. Após a SQL 022, publique o deploy do **Vercel**, usando o mesmo Supabase. Recarregue a PWA para carregar o cache `registro-validades-v40-importar-queima-nao-vencidos`.
6. No Painel Conferente, importe primeiro um relatório de **teste**. Abra a prévia, confirme Registro, códigos, lotes, validades, quantidades e totais. Repita o mesmo arquivo para confirmar que não duplica lançamentos.
7. Teste um item vencido (deve ser ignorado) e um pendente para aprovação (deve exigir Validade e Preço da Gôndola). Não faça aprovação no Procfit automaticamente.

**Sem conexão de produção:** os testes locais validam leitura, interface, payload da API, regras de data e presença das funções/trigger SQL, mas **não são uma execução real da migração ou da gravação no seu Supabase de produção**. Antes de uso operacional, execute o workflow no ambiente correto e confira o retorno.
