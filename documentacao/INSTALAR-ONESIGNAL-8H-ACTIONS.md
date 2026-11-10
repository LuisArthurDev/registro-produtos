# Instalação OneSignal + GitHub Actions (8h)

**Projeto:** Registro de Validades · Supabase + Vercel + GitHub Pages

**App ID já configurado no código:** `2e84a1da-d84f-4f22-a24f-8515dd357558`

**Situação:** código e workflows preparados; **o envio real permanece desligado** até configurar os segredos, autorizar um dispositivo, testar e definir `NOTIFICATIONS_ENABLED=true` no Vercel. Não é necessário adicionar chaves privadas ao código ou compartilhar credenciais.

## 1 — Configurar o site Web no OneSignal

1. Acesse <https://dashboard.onesignal.com> → seu app → **Settings → Push & In-App → Web**.
2. Selecione **Custom Code**; a URL do site precisa ser o endereço HTTPS **definitivo do Vercel**, exemplo `https://seu-site.vercel.app`. O GitHub Pages apenas redireciona: não configure a URL do Pages como origem de push.
3. Copie a **App REST API Key** em **Settings → Keys & IDs**; nunca salve essa chave no GitHub. Confirme que é a chave REST do mesmo App ID do projeto.
4. Este pacote já inclui o worker `public/push/onesignal/OneSignalSDKWorker.js` e o SDK Web nas páginas `index.html` e `lancamentos.html`.
5. Depois do deploy, acesse `https://SEU-SITE.vercel.app/push/onesignal/OneSignalSDKWorker.js`: deve aparecer a linha `importScripts(...)`, sem erro 404. O domínio precisa ser exatamente o cadastrado no OneSignal.
6. **Web SDK:** não ative a opção *Token Identity Verification* no painel OneSignal: a documentação atual explica que ela ainda não é suportada no Web SDK. O projeto usa a própria sessão do Vercel para autorizar o cadastro e envio, restringindo o destino por `subscription_id` autorizado.

## 2 — Configurar o Vercel (sem expor senhas)

No projeto Vercel: **Settings → Environment Variables** → selecione **Production** → cadastre:

| Variável | Valor |
| --- | --- |
| `ONESIGNAL_APP_ID` | `2e84a1da-d84f-4f22-a24f-8515dd357558` |
| `ONESIGNAL_REST_API_KEY` | REST API Key privada do painel OneSignal |
| `NOTIFICATION_CRON_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `NOTIFICATIONS_ENABLED` | `false` durante os testes; após aprovação, `true` |
| `SUPABASE_URL` | Já usada pelo sistema |
| `SUPABASE_SECRET_KEY` | Já usada pelo sistema |

Para criar o `NOTIFICATION_CRON_SECRET` sem instalar nada, no PowerShell do Windows:

```powershell
$b = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($b)
$rng.Dispose()
-join ($b | ForEach-Object { $_.ToString("x2") })
```

**Guarde o valor em local seguro**, não compartilhe. Em seguida faça **Deployments → Redeploy** (as variáveis são incorporadas em uma nova implantação).

## 3 — Criar as tabelas no Supabase pelo GitHub Actions

1. Envie os arquivos atualizados ao **mesmo repositório** `registro-produtos` na branch padrão (`main`, se esse for o nome).
2. Em **Actions → Supabase - preparar e importar → Run workflow**, selecione:
    - `etapa = configurar_notificacoes`
    - `confirmar_gravacao = false` (essa etapa apenas aplica o SQL de tabelas; não importa dados)
3. Execute e confirme a mensagem `Tabelas push_dispositivos/notificacao_envios criadas`.
4. O SQL aplicado é `supabase/005_notificacoes_onesignal.sql`, com RLS e reserva de envios para impedir duplicação.

Se o menu de Actions não apresentar essa etapa, confirme que `.github/workflows/migracao-supabase.yml` está na branch padrão e atualizado.

## 4 — Configurar os Secrets do Actions

GitHub → seu repositório → **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valor |
| --- | --- |
| `NOTIFICATION_CRON_SECRET` | **Exatamente o mesmo** segredo do Vercel |
| `VERCEL_NOTIFICATION_URL` | `https://SEU-SITE.vercel.app/api/notificacoes/cron` |

**A URL deve ser HTTPS**, nunca o endereço do GitHub Pages. Não inclua o segredo na URL. O workflow envia em `Authorization: Bearer ...`. Não é necessário colocar a REST API Key do OneSignal no GitHub: ela fica somente no Vercel.

## 5 — Preparar e autorizar o dispositivo (loja piloto)

1. Entre como **Administrador de Loja** no Vercel, abra **Funcionários** e marque `Celular próprio` no cadastro do funcionário piloto.
2. No aparelho do funcionário, entre no sistema pelo **domínio do Vercel** e abra **Notificações → Ativar notificações neste aparelho**.
3. Permita notificações no navegador e confira o aviso `Cadastro realizado. Peça autorização ao administrador da sua loja.`
4. No Painel Conferente da mesma loja, abra **Notificações → Atualizar lista**, localize o aparelho e clique em **Autorizar**.
5. Clique em **Testar** (envio manual para **um único aparelho aprovado**). Confirme que recebeu a mensagem de teste antes de habilitar disparos automáticos.
6. **iPhone:** adicione a PWA à Tela de Início, abra-a pelo ícone e autorize notificações. O suporte requer iOS/iPadOS compatível com push de web apps (16.4+).
7. Após sair da conta, a sessão é encerrada e a assinatura do dispositivo perde a sessão ativa. Para voltar a receber, entre novamente; a autorização do aparelho continua armazenada.

Os avisos automáticos só contemplam mapas de funcionários, não incluem as abas especiais. Alertas usam **30 dias para seções comuns** e **15 dias para alimentos/conveniência/nutrição**, incluindo já vencidos. Cada funcionário recebe um **resumo dos seus próprios registros** (sem EAN/lote na notificação). A precisão das regras deve ser conferida com os procedimentos operacionais da loja antes de ativar produção.

## 6 — Ativar o agendamento a cada 8 horas

O arquivo **`.github/workflows/notificacoes-8h.yml`** já contém:

```yaml
on:
  schedule:
    - cron: '17 0,8,16 * * *'
  workflow_dispatch:
```

Esse horário representa aproximadamente:

| Horário UTC | Horário de Brasília (UTC−3) |
| --- | --- |
| 00:17 | 21:17 do dia anterior |
| 08:17 | 05:17 |
| 16:17 | 13:17 |

Para ativar:

1. Confirme que o workflow está na **branch padrão** e o Actions está habilitado.
2. No Vercel, altere `NOTIFICATIONS_ENABLED` para `true` e faça um **Redeploy**.
3. Em **GitHub → Actions → OneSignal - avisos de validade (8 horas)**, clique em **Run workflow** para testar a chamada. É seguro repetir: existe uma reserva única por aparelho, tipo e intervalo de 8 horas.
4. Examine o resumo `enviados`, `pulados`, `falhas`. Se `aparelhos:0`, confira celular próprio, aprovação e sessão ativa.
5. Após o teste, não é necessário clicar novamente. O GitHub Actions inicia o fluxo automaticamente em cada horário definido.

**Observação:** horários do Actions não são garantidos ao minuto; o GitHub pode atrasar/ocasionalmente pular execuções programadas em momentos de carga elevada. Em repositórios públicos inativos por 60 dias, o agendamento pode ser desabilitado pelo GitHub. Para conferir, visite a página Actions do workflow regularmente.

## 7 — Verificar mensagens e desfazer

- Enviou uma vez: tabela `notificacao_envios` no Supabase registra janela, aparelho e resultado; somente as requisições enviadas são marcadas `enviado`.
- O mesmo cron executado duas vezes no mesmo intervalo não faz um novo envio para o mesmo aparelho.
- Em caso de perda de conexão depois de enviar ao OneSignal, a reserva prioriza **não enviar em duplicidade**. Uma mensagem pode ficar sem confirmação; confirme nos logs do OneSignal e no Supabase.
- Para pausar imediatamente os disparos: altere `NOTIFICATIONS_ENABLED=false` e faça **Redeploy** ou desabilite o workflow `OneSignal - avisos de validade (8 horas)`.
- Se o envio falhar por configuração, confirme **Vercel → Logs** e o HTTP no GitHub Actions. **Nunca poste suas chaves**.

## Limitações importantes

- A primeira assinatura precisa de permissão do navegador, SDK acessível e domínio correto.
- A rotina está limitada a 60 aparelhos aprovados por execução, para evitar tempo de processamento excessivo em Vercel Functions. Se a equipe crescer, implemente divisão por lotes.
- A entrega efetiva depende do push do navegador, da conectividade e das configurações de bateria/notificações do aparelho; HTTP 200 do OneSignal confirma aceitação, não leitura pelo funcionário.
- Os fluxos com Supabase real, Vercel real e telefones reais **precisam ser testados** após configurar as chaves. Testes locais não substituem homologação.
- Este agendamento é pelo **GitHub Actions** (não pelo Vercel Cron); portanto funciona sem recurso de cron de 8 horas no Vercel Hobby.
