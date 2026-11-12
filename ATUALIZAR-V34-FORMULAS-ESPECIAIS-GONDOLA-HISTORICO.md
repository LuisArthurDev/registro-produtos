# Atualização v34 — Fórmulas Especiais, histórico da Queima e dados da gôndola

Esta atualização parte da **v33** do Registro de Validades e preserva os lançamentos antigos.

## Instalação — siga esta ordem

1. **Faça backup** do Supabase e do repositório. Homologue com produtos de teste antes de liberar a Queima em produção.
2. Confira se as migrações **001 a 019** foram aplicadas no **mesmo projeto Supabase** que o Vercel utiliza.
3. Atualize o GitHub com os arquivos da v34. Em **Actions → Supabase - preparar e importar → Run workflow**, escolha a etapa `formulas_especiais_queima_gondola`. Ela executa **`supabase/020_formulas_especiais_queima_gondola.sql`**.
4. Confirme que a etapa foi concluída **sem erros**. Se necessário, no Supabase SQL Editor execute `NOTIFY pgrst, 'reload schema';` e verifique as colunas `public.produtos.formula_especial`, `public.queima.validade_gondola` e `public.queima.preco_gondola`.
5. Depois faça o **deploy no Vercel** e recarregue a PWA, para obter o novo cache `registro-validades-v34-formulas-queima-gondola-historico`.
6. Teste os controles com um produto comum e outro marcado como Fórmula Especial. Verifique os lançamentos pela Visualização e o bloqueio do produto especial na Queima e na cópia Procfit.

> **Atenção:** a v34 necessita da SQL 020 **antes do deploy**, pois API e frontend passam a consultar novas colunas e funções.

## Produtos EAN e Mapa de Validade — Fórmulas Especiais

- O administrador pode marcar e desmarcar a condição **Fórmula Especial** em **Produtos EAN**, inclusive no formulário de edição, e por meio da ação correspondente no **Mapa de Validade**.
- O indicador aparece no mapa; o produto continua visível e seus lançamentos são preservados.
- Quando a condição está ativa, o produto **não pode ser enviado à Queima** nem inserido na exportação do **Conector Procfit — v1.0**.
- A conferência do mapa com o estoque importado continua considerando apenas mapas dos funcionários e a aba especial **Estoque**. Na cópia, o sistema consulta novamente os EANs marcados antes de preparar a lista; se a checagem falhar, a cópia é interrompida.
- A marcação é feita para os produtos escolhidos pelo administrador; nenhum produto recebe a condição automaticamente.

## Visualização — olho e histórico completo da Queima

- O ícone **olho** fica na frente de cada item do mapa e abre o histórico completo da Queima para o **mesmo EAN**, incluindo lotes diferentes, lançamentos manuais e antigos, entradas repetidas, pendentes, aprovadas e relançadas.
- Cada ocorrência é mostrada separadamente, com lote, validade, quantidade, situação, data do lançamento e, quando preenchidos, **Validade da Gôndola** e **Preço da Gôndola**.
- Usuários funcionários veem apenas ocorrências permitidas para o próprio mapa; administradores da loja veem ocorrências da sua loja.
- `visualizacao.html` oferece **somente consulta**: o administrador não tem ação de lançar na Queima por essa página.

## Queima — novas regras e campos

- Produtos de **Fórmulas Especiais** e itens provenientes de **Termolabil, Psicotropicos e Antibioticos** não podem ser enviados à Queima. A aba especial **Estoque** continua permitida, assim como mapas comuns dos funcionários.
- As regras são verificadas na interface, pela API e por um *trigger* no Supabase, protegendo também rotas legadas.
- Ao cadastrar um item na Queima são obrigatórios **Validade da Gôndola** e **Preço da Gôndola**. O preço é em **reais (R$)**, aceita centavos e não pode ser negativo.
- Ao enviar vários itens do mapa à Queima, cada item recebe a sua **própria** validade e o seu **próprio** preço. A nova RPC `encaminhar_mapa_queima_itens_v34` realiza a operação em uma transação; se houver um erro, o lote é revertido.
- Ao **relançar**, os dados da gôndola do registro anterior são preservados.
- Registros antigos da Queima continuam existentes: quando não possuírem esses campos, a visualização os mostrará como **não informados**. A instalação não altera retroativamente essas entradas.

## Verificação técnica realizada

- `npm run check`: **276 testes JavaScript aprovados**.
- `python -m unittest discover -s tests -p 'testar*.py'`: **24 testes Python aprovados**.
- Teste local de interface com Chromium: ícone de olho abrindo o histórico completo, ocorrências aprovadas e repetidas, além de envio em lote com dois produtos e dados de gôndola diferentes.

**Limitação:** não houve execução da SQL 020 no banco de produção do usuário nem movimentações reais no Procfit; é indispensável testar o fluxo no Supabase conectado antes do uso operacional.
