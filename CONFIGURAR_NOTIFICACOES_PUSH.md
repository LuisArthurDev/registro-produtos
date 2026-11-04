# Configuração de notificações de vencidos

## O que já fica preparado no projeto

- Notificação do computador ao abrir `lancamento.html` ou `painelconferente.html`, se a permissão do navegador já tiver sido concedida e houver vencidos na loja/mapa.
- Aviso dentro do Painel Conferente com quantidade de registros vencidos e atalho para Controle de Validade.
- Opção de computador **Manter conectado**: ignora os 30 minutos de inatividade, mas mantém o limite absoluto de 8 horas.
- Integração de Push com OneSignal para avisos mesmo com o navegador fechado, após configuração da conta.
- O Apps Script verifica os mapas uma vez por hora e envia somente quando a lista de vencidos daquele funcionário muda; isso evita repetir a mesma notificação a cada hora.

## 1. Criar o aplicativo OneSignal

1. Acesse https://onesignal.com/ e crie uma conta.
2. Crie um aplicativo para Web Push.
3. Escolha configuração de site típico / Custom Code, conforme as opções apresentadas pelo OneSignal.
4. Configure o site como `https://luisarthurdev.github.io/registro-produtos/`.
5. Em Settings / Keys & IDs, copie o **App ID** e a **REST API Key**.
6. No arquivo `notificacoes.js`, substitua a string vazia em `ONESIGNAL_APP_ID` pelo App ID público. Não coloque a REST API Key nesse arquivo.
7. Faça commit dos arquivos do projeto no GitHub Pages. O arquivo `OneSignalSDKWorker.js` precisa ficar na raiz publicada do site.

## 2. Guardar a chave privada no Apps Script

1. Abra o projeto do Google Apps Script conectado à planilha.
2. Vá em Configurações do projeto > Propriedades do script.
3. Adicione estas duas propriedades:
   - `MV_ONESIGNAL_APP_ID` = App ID do OneSignal
   - `MV_ONESIGNAL_REST_API_KEY` = REST API Key do OneSignal
4. Salve. A chave privada fica no servidor, não no GitHub.

## 3. Ativar o envio automático

1. No editor do Apps Script, selecione e execute `configurarAgendamentoNotificacoesVencidos`.
2. Autorize as permissões solicitadas (planilha, chamadas externas e gatilhos).
3. Execute uma vez `verificarNotificacoesVencidos` para o primeiro teste.
4. Depois disso, o gatilho fará a verificação automaticamente a cada hora.

## 4. Ativar em cada dispositivo

1. Entre no sistema com o usuário correto.
2. Clique em **Ativar notificações** e permita as notificações do navegador.
3. Faça isso em cada celular/computador que deverá receber avisos.

No celular, o usuário precisa aceitar as notificações do site. A entrega em segundo plano depende do suporte do navegador e das permissões do sistema operacional. Em iPhone/iPad, o suporte a Web Push depende da versão do iOS/iPadOS e da instalação do site na Tela de Início.

## Observações importantes

- A primeira notificação Push só poderá ser enviada depois de configurar OneSignal e ativar a inscrição no dispositivo.
- A rotina de servidor envia notificações direcionadas ao funcionário e à loja cadastrados; não envia dados de outras lojas.
- O Push é enviado quando a lista de produtos vencidos muda. Se os mesmos itens continuarem vencidos, não haverá repetição horária. Se a lista zerar e depois voltar a ter vencidos, um novo aviso será enviado.
- A opção **Manter conectado** é exclusiva de computadores e desativa apenas o limite de inatividade. O limite absoluto de 8 horas continua valendo.
- Não compartilhe a REST API Key e não a coloque em arquivos `.js`, HTML ou no repositório GitHub.
