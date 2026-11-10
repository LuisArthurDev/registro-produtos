# Matriz de compatibilidade — Painel Conferente (legado → Supabase/Vercel)

Data da revisão: 09/11/2026. Origem de referência: `painelconferente.html` legado + especificações do usuário. **Este pacote é para HOMOLOGAÇÃO; não declara paridade funcional total.** Os testes automatizados e de navegador utilizaram APIs simuladas; nenhum ambiente Supabase/Vercel real foi modificado nesta revisão.

## Critérios de perfis

| Permissão | Funcionário | Administrador de loja | Administrador Geral |
|---|---|---|---|
| Consultar seu mapa e lançar | Sim | Sim, pela loja e seus funcionários | Não utiliza Painel Conferente |
| Consultar todos os mapas da loja | Não | Sim | Usa Painel Geral |
| Gerir funcionários e redefinir PIN | Não | Sim, apenas da própria loja | Pode gerir administradores no Painel Geral |
| Consultar outra loja | Não | Não | Sim, exclusivamente pelo Painel Geral |
| Criar administrador de loja | Não | Não | Sim |
| Criar novo perfil Geral pela interface | Não | Não | Não |

Validação de loja também é realizada na API, não apenas pelo menu. Uma conta Geral existente deve ser provisionada pela migração/configuração segura. A API recusa criação de outros Gerais pelo painel.

## Funcionalidades restabelecidas no código desta versão

| Área | Implementação | Testes necessários para homologar |
|---|---|---|
| Login | Loja memorizada no navegador, bloqueada para edição até clicar X; PIN e sessão preservados no fluxo normal | Logout e novo login, troca de loja, internet lenta e cache PWA |
| Navegação | Menu lateral recolhível (desktop) e móvel, rotas por perfil, acesso ao lançamento em modal e retorno ao Painel Conferente | Dispositivos Android, iPhone, telas pequenas |
| Mapa de validade | Filtros por funcionário, EAN, lote, mês de registro, período de validade e situação; 15/25/50 itens, paginação, CSV, impressão | Confrontar com todos os mapas originais e lançamentos anteriores |
| Novo lançamento | Dentro da página Mapa de Validades, em modal; EAN, lote, validade, quantidade, mês automático, reenviar com requestId | Bipe, duplicidade, interrupção de internet, gravação real |
| Editar lançamento | Modal para EAN, lote, validade e quantidade, mantendo mês original | Alteração refletida no banco e no histórico |
| Ações em massa | Seleção e encaminhamento para Vencidos e Queima com RPC transacional | Validar regras de negócio e quantidade com planilha real |
| Indicadores | KPIs de dashboard e status, cálculo de Vencido/A vencer/Vendável | Comparar números com painel legado da mesma data e loja |
| Controle de validade | Relatórios, filtros, vencimentos próximos, CSV e impressão | Confrontar faixas de vencimento com regra operacional |
| Produtos EAN | Cadastro por modal, consulta e validação por EAN/código | Testar duplicados e zeros à esquerda |
| Estoque (mapa especial) | Lote, validade, quantidade e operação 'Descer para o mapa' | Confrontar movimentações e saldo do mapa após transferência |
| Saldo Procfit | Importação CSV/ODS, EAN como texto, vínculo por produto/loja | Conferir exportações reais do Procfit, cabeçalhos e saldos |
| Queima | Descrição após EAN, motivo 4, lista, filtros, aprovação, relançamento | Confirmar regras de motivo e transação em Supabase real |
| Vencidos | Descrição após EAN, tratamento de EAN ausente sem renderizar `null`; retiradas/danificados | Conferir códigos ausentes com dado original; evitar associação arbitrária |
| Perdas/Danificados | Tela de perdas, lançamentos de ocorrência, indicadores e filtros | Conferir procedimento operacional real e trilha de auditoria |
| Sinalizações | Registro, consulta, edição de situação, busca e filtros | Conferir motivo e histórico completo |
| Transferências | Listagem, cadastro, filtro, CSV, impressão | Conferir o fluxo completo e 21 linhas pendentes de reconciliação |
| Funcionários | Cadastro, ativação/inativação, celular próprio como flag, redefinição de PIN com expiração das sessões | Testar por diferentes perfis e lojas |
| Histórico | Consulta por loja, busca, intervalo, impressão e CSV | Confirmar que operações antigas e novas aparecem |
| Pendências | Consulta, modal de correção, manutenção do original para auditoria | Rodar `003_pendencias.sql`; conferir status no Supabase |
| Painel Geral | Menu e página separados, administração de loja, cadastro de administradores, reset de PIN | Verificar que Geral não entra no Painel Conferente |

## Lacunas ainda existentes — NÃO considerar concluídas

- **OneSignal (atual)**: consentimento opcional para todos os perfis, **sem aprovação por administrador** e sem depender de `Celular próprio`. Backend e cron a cada 8 horas incluídos; **ainda exigem configuração das chaves e homologação real**. O envio manual amplo ainda não foi homologado.
- **Validação de aparelho para login** no sistema antigo Apps Script (distinta do consentimento OneSignal) ainda não foi migrada completamente. Ela não deve ser confundida com a permissão para receber notificações.
- **Importação automática de estoque via GitHub/Procfit**: CSV/ODS manual funciona no frontend em testes, mas robô Windows/integração Procfit e atualização programada permanecem separados.
- **Equivalência exata de todos os cálculos**: nova interface implementa 60/15/3/160 dias e faixa indicativa de 3–9 meses. Faixas que o legado calcula por mês-calendário precisam comparação caso a caso antes de produção.
- **Scanner por câmera**, quando disponível no legado, não foi reproduzido no fluxo de Queima; leitor físico/teclado continua possível.
- **Impressão específica/formatos históricos**: impressão via navegador e CSV disponíveis; layouts exatos de relatórios legados não foram homologados.
- **PWA offline integral**: existe retenção e reenvio idempotente de um lançamento pendente; fila com vários itens offline ainda requer implementação.
- **Reconciliação histórica**: 21 transferências, EANs inconsistentes e pendências devem passar pelo painel/rotinas de revisão. Não alterar histórico sem confirmação.
- **Testes reais**: Supabase, OneSignal, Vercel e dispositivo físico não acessados nesta revisão.

## Implantação sem interromper operação

1. Faça backup da branch atual e das tabelas Supabase antes de alterar o repositório.
2. Aplique o ZIP dos arquivos alterados na branch de homologação. **Não substitua `docs/config.js`** nem o redirecionamento da produção nesta etapa.
3. No GitHub Actions, workflow `Supabase - preparar e importar`, execute manualmente `etapa = atualizar_painel`, usando os Secrets já configurados. Este estágio roda `003_pendencias.sql` e `004_painel_conferente.sql` (aditivas).
4. Faça deploy Preview no Vercel, confirme `SUPABASE_URL` e `SUPABASE_SECRET_KEY` em variáveis privadas e abra `/api/health?check=1`.
5. Teste login de funcionário, admin de loja e Geral, separação de lojas, lançamento novo, duplicidade, edição, Queima/Vencidos, estoque, impressão, relatórios, PIN, pendências e histórico usando um lote de teste.
6. Só considere produção após fechar as lacunas necessárias ao uso real, conferir dados e validar os processos no Supabase; **não ative o redirecionamento GitHub Pages antes disso**.

## Evidências locais

- `npm run check`: 23/23 testes aprovados, incluindo sintaxe de API e frontend.
- `python -m unittest discover -s tests -p 'testar*.py'`: 21/21 testes aprovados.
- Teste em navegador Chromium com API simulada: navegação de Admin e Geral, filtros, modais, Queima com descrição, Vencidos sem `null`, menu e separação de perfis; sem exceções de página observadas.
- Leitura sintética de ODS no navegador: EAN com zeros à esquerda preservados.
- **Limite**: testes automatizados não equivalem a homologação das regras operacionais e dos dados reais.
