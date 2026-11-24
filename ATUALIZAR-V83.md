# V83 — Identidade, cargo Gerente, Seções e Histórico

**Antes de publicar:** faça backup do Supabase e execute `supabase/039_identidade_gerente_historico_v83.sql` no SQL Editor, após a migração 038. A migração é transacional. Em seguida publique os arquivos alterados do ZIP e recarregue o site para renovar a PWA.

## Regras

- **Matrícula opcional:** cadastrada por administrador e normalizada sem zeros à esquerda. Ex.: `0154575` é armazenada como `154575`. Login aceita tanto nome quanto matrícula, observando loja e PIN. Matrículas devem ser únicas por loja.
- **PIN provisório:** novos usuários e aqueles que recebem redefinição administrativa recebem `pin_inicial_pendente=true`. O próprio usuário autenticado pode trocar uma vez por emissão do PIN provisório, informando o PIN atual. O administrador pode ver o sinalizador. A alteração invalida outras sessões.
- **Contas antigas:** não é possível identificar criptograficamente qual PIN antigo corresponde ao padrão inicial sem saber esse PIN. Assim, contas existentes começam com status **não identificado**. Se necessário, o administrador redefine o PIN para reemitir a troca inicial; a migração NÃO redefine senhas por conta própria.
- **Gerente:** o Administrador Geral pode transformar qualquer login de uma loja em Gerente na tela de administração de contas. Gerente acessa as abas operacionais principais e Seções; pode registrar lançamentos em abas especiais. Não pode administrar funcionários, alterar a própria permissão nem acessar Painel Geral, Histórico administrativo ou APIs de escrita fora dos fluxos autorizados.
- **Seções:** impressão de responsáveis por grupo e permissão para grupo já salvo, mesmo que não esteja mais no catálogo. A organização não move registros do mapa.
- **Histórico:** consulta pelo período inclusivo e em páginas de 25, evitando carregar o histórico completo. Índice de loja/data adicionado.
- **Inativação:** mantém os lançamentos e os deixa como Sem responsável, inclusive na Queima e na organização. A migração também revisa os itens associados a contas já inativas. Revise o backup antes de executar.

## Verificações após a publicação

1. Cadastrar matrícula `0154575` e entrar usando `154575` ou nome.
2. Redefinir o PIN de uma conta de teste, entrar, trocar uma vez, confirmar que não oferece troca inicial novamente.
3. No Painel Geral, promover um funcionário de teste a Gerente e verificar acesso às abas operacionais e Seções, mas não a Funcionários.
4. Fazer um lançamento em aba especial e testar o bloqueio a operações administrativas.
5. Salvar Seções e imprimir a tabela de responsáveis.
6. Filtrar Histórico de 01/11/2026 a 24/11/2026 e avançar a página.
7. Inativar funcionário de teste e verificar a atribuição Sem responsável, inclusive em Queima.

Nenhuma dessas verificações de integração em ambiente Supabase de produção foi executada aqui.
