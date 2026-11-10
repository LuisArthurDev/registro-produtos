> **Separação importante:** esta seção antiga descreve autenticação de dispositivos para **acesso ao sistema**, não a inscrição em notificações. O OneSignal da versão atual requer somente consentimento do próprio usuário, sem aprovação de administradores.

# Plano de integração — offline, dispositivos e OneSignal (8 horas)

Este documento especifica as próximas integrações. **Não é uma declaração de que já estejam ativas**.

## Homologação dos cálculos, relatórios e operações

Comparar por loja e mapa, em ambiente de homologação, os totais do Google Sheets original e os registros do Supabase: unidades, registros, vencimentos por regra, mês de lançamento, Queima, Vencidos, Estoque (aba especial) e saldo Procfit. Validar a reversibilidade das ações, registro de auditoria e regras de acesso. Guardar relatório das diferenças sem sobrescrever dados originais e sem fazer operações de Queima em produção durante os testes.

## Fila offline de lançamentos

Implementar IndexedDB com registro por `requestId`, loja, usuário, mapa, EAN, lote, validade, quantidade e timestamps. Estados: aguardando envio, enviando, confirmado e exigindo revisão. A captura offline deve indicar visualmente que **não houve gravação no servidor**. Reenviar o mesmo `requestId` após reconexão; o servidor deve impor idempotência também no banco. Exigir nova autenticação válida antes de sincronizar. Manter dados por usuário/dispositivo e oferecer opção de revisar/excluir localmente lançamentos não enviados, com confirmação. Não salvar PIN nem chave secreta no IndexedDB.

## Autorização individual de dispositivos

Cadastrar um identificador de instalação aleatório por aparelho, vinculado a usuário e loja, com status pendente/aprovado/revogado; conferir permissões na API a cada sessão, não apenas no JavaScript. O perfil Administrador de Loja autoriza/revoga apenas aparelhos da própria loja. Só o Administrador Geral administra permissões globais, no Painel Geral. `celular_proprio` permanece um atributo do funcionário, diferente da autorização efetiva do aparelho. A autorização deve ser auditada e revogada quando um funcionário for inativado.

## OneSignal e notificações de vencimento a cada 8 horas

É preciso criar/configurar o aplicativo OneSignal para o domínio do Vercel, escolher a política de consentimento e guardar as credenciais **somente** nas variáveis de ambiente do backend (ex.: `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`). Vincular a assinatura push do aparelho autorizado ao usuário e loja; impedir que assinaturas antigas de usuários inativos recebam avisos. Criar endpoint autenticado e um job de envio que faça consulta de vencidos sem duplicar alertas usando chave de deduplicação por loja, categoria, janela de 8h e data. Mensagens por funcionário devem ter destinatário explícito; transmissão a todos exige autorização apropriada.

Para agendar, é possível usar workflow programado no GitHub Actions (`0 0,8,16 * * *` em **UTC**, equivalente a 21h, 5h e 13h do horário de Brasília) chamando um endpoint Vercel protegido por segredo próprio, sem expor a chave OneSignal. Agendamentos do GitHub Actions são aproximados e podem atrasar; para garantia de horário é necessário um agendador com SLA adequado. Testar primeiro em conta/loja piloto e conferir opt-in, tags e supressão de duplicidades antes de liberar a equipe.

**Não se deve configurar um agendamento de envios antes de validar os destinatários e a autorização de dispositivos.**
