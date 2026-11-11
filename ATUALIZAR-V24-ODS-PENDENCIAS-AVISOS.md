# V24 — Conferência com estoque já importado, EAN desconhecido e aviso de 8 horas

## Instalação (ordem importante)

1. Faça backup do Supabase e confirme que as migrações 001 a 015 já foram aplicadas.
2. Publique o novo `supabase/016_pendencias_ean_lancamentos.sql` e a etapa `pendencias_ean_lancamentos` do workflow no GitHub.
3. No **GitHub → Actions → Supabase - preparar e importar → Run workflow**, escolha `pendencias_ean_lancamentos` e confirme sucesso. A migração cria uma tabela, triggers e recupera pendências de EAN não cadastrados de lançamentos anteriores, sem apagar registros.
4. Só então faça deploy do código completo v24 no Vercel. Recarregue a PWA após o deploy (o Service Worker foi versionado).
5. Valide primeiro em ambiente de homologação.

## Conferência do Mapa de Validade

- Entre no Painel Conferente → **Mapa de Validade** → **Conferir com estoque**.
- Selecione o mês do mapa. A consulta usa os saldos de **Controle de Estoque / Saldo Procfit**, já importados do ODS e gravados no Supabase. **Não é preciso reenviar o arquivo ODS**.
- O saldo por produto é distribuído entre os lançamentos daquele mês por validade (primeiro os que vencem antes), impedindo que um único saldo seja contado várias vezes para lotes diferentes.
- **Quantidade corrigida** = menor entre unidades daquele lançamento e saldo ainda disponível para ele; **Quantidade mapa** fica logo abaixo, preservada.
- O código interno é prioritário. Caso falte, o EAN original é mostrado preservando zeros à esquerda. A descrição aparece discretamente abaixo do código.
- **Sem saldo importado** não equivale a saldo zero. Esses produtos aparecem com aviso e quantidade corrigida em branco, para revisão humana.
- A comparação é **somente leitura**: NÃO altera mapas, saldo Procfit, Queima, retiradas, responsáveis ou registros de auditoria. Pode exportar o resultado para CSV.
- **Importante:** o ODS representa o saldo disponível na data em que foi importado, mesmo quando você escolhe um mês de mapa antigo. Não é um extrato de estoque histórico. Reimporte o ODS no Controle de Estoque quando precisar atualizar a fotografia do saldo.

## EAN não encontrado

- Lançamentos com EAN válido (8–14 dígitos) sem cadastro em `produtos` são gravados normalmente.
- O trigger cria uma pendência vinculada ao ID do lançamento, prevenindo duplicatas em reenvios.
- O administrador encontra **Pendências → EAN desconhecido**, com ações **Corrigir / cadastrar EAN** e **Ignorar pendência**.
- Ignorar não remove o produto do mapa. Cadastrar o EAN posteriormente resolve automaticamente pendências ainda abertas.
- Pendências históricas de catálogo/migração também podem ser ignoradas; o conteúdo original é mantido.
- Administrações continuam limitadas às lojas autorizadas pela sessão.

## Aviso de 8 horas

- Os logs no GitHub Actions agora exibem um resumo de falha por aparelho **numerado**, etapa (`reservar_envio`, `onesignal`, `registrar_confirmacao_no_banco`) e motivo limitado a 160 caracteres.
- Não aparecem assinatura push, PIN ou credenciais nos logs.
- Se uma assinatura estiver inválida, reative as notificações naquele navegador e atualize o cadastro na aba Notificações.
- Se OneSignal aceitar o envio, mas o banco não conseguir atualizar o histórico, o backend tenta gravá-lo novamente antes de registrar a falha. A reserva por janela evita envios duplicados no mesmo intervalo.
- A resposta HTTP 200 pode indicar **resultado parcial** (`sucesso:false`); neste caso o workflow ainda falha deliberadamente e agora apresenta qual etapa deu problema.

## Testes e limitações

`npm run check` e `python -m unittest discover -s tests -p 'testar*.py' -q` validam o comportamento local. A consulta ao Supabase/OneSignal real e a execução SQL precisam ser testadas no ambiente de destino. Não é possível garantir envio de push para navegador com permissões desativadas ou assinatura revogada.
