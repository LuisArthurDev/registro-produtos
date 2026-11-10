# Cobertura da migração de `code.gs` e `login.gs`

O `code.gs` fornecido contém 139 funções e o `login.gs`, 38 funções. A migração recria a **arquitetura principal**, mas não é uma tradução função a função; para decisões de produção, confira esta matriz.

| Área | Nesta versão Vercel + Supabase | Status |
|---|---|---|
| Catálogo EAN e código interno | Tabela `produtos`, busca, cadastro, importação inicial do SQLite, pendências | Implementado; precisa teste com Supabase real |
| Saldo do Procfit | Tabela separada, importação de CSV, consulta por loja | Implementado; ODS convertido via script |
| Funcionários | Login via nome/loja/PIN com hash scrypt, sessões, cadastro, ativar/desativar | Implementado, requer provisão dos PINs |
| Acesso por loja | Backend valida loja, funcionário enxerga próprio mapa, administrador enxerga loja | Implementado, necessita teste de penetração |
| Lançamentos | Transação em RPC, mês automático, registro de lote, status de duplicado, requestId | Implementado, teste de concorrência e conectividade pendente |
| Mapas especiais | Estoque, Termolábil, Psicotrópicos, Antibióticos na mesma tabela | Implementado, homologue permissões |
| Descer para mapa | RPC atômica subtrai Estoque e cria registro destino | Implementado, homologue saldos e mapa destino |
| Visualização | Lista todos os meses, filtros de status sem exigir data | Implementado, verifique política de vencimento por seção |
| Dashboard | Totais e vencimentos da loja | Base implementada, relatórios antigos não equivalentes |
| Vencidos / Queima / Transferências / Sinalizações | Tabelas, consultas básicas, criação e edição de campos selecionados | **Parcial**, não trocar produção |
| OneSignal e notificações 8h | SDK, consentimento individual sem aprovação administrativa, endpoint protegido, deduplicação e workflow incluídos; faltam chaves e teste real | **Implementado para homologação** |
| Celular próprio / autorização de dispositivo | Campo no banco, sem token por dispositivo | **Pendente** |
| Histórico admin | Tabela e visualização; importação dos 45 eventos históricos | Implementado em parte; operações antigas não completas |
| Apps Script | API nova não depende dele nas rotas implementadas | Demais recursos dependem de adaptação |
| PWA offline | Cache estático e uma tentativa pendente com requestId | **Parcial**; não é app totalmente offline |
| Vercel deploy | Arquivos e config preparados | Não publicado nesta sessão |
| GitHub Pages → Vercel | Página e redirecionamentos antigos incluídos | Pronto para configurar URL definitiva |

## Diferenças que exigem decisão antes da produção

- A regra de alerta usa 30 dias como padrão e 15 dias para seções alimentícias; revisar equivalência exata aos critérios de retirada e Queima da loja.
- A origem das 21 Transferências do XLSX está inconsistente e não deve ser importada automaticamente.
- Na planilha enviada não havia a aba especial Estoque; é necessário extrair sua versão mais atual.
- PINs antigos não são migrados; cada usuário receberá novo PIN.
- O navegador guarda token de sessão quando é escolhido “manter conectado”, seguindo a sessão do backend; a política final de dispositivo próprio precisa ser reconstruída.
- As abas especiais não geram contas de usuário: elas são categorias dentro de `mapa_lancamentos`.
- Os saldos do Procfit não são calculados pela soma dos mapas e não são alterados quando um lote desce do Estoque para a seção.

## Checklist antes de redirecionar GitHub Pages

1. Conferir contagens de produtos e mapas no PostgreSQL.
2. Verificar vínculo EAN/código interno e zeros à esquerda no cadastro.
3. Testar PIN errado, bloqueio temporário, funcionário inativo e acesso entre lojas.
4. Simular internet lenta, expiração de sessão, perda de resposta depois de gravar e reenvio com mesmo requestId.
5. Testar mapa especial Estoque, confirmação de duplicidade, desconto parcial e impossibilidade de saldo negativo.
6. Validar todos os relatórios, Queima, Vencidos, notificação individual e permissões administrativas — **não migrados integralmente ainda**.
7. Confirmar backup/restauração e rollback para GitHub Pages antigo antes do corte.
