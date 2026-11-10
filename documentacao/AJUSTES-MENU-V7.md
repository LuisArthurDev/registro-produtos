# Atualização do menu e lançamento móvel — v7

Implementado nesta revisão:

- Menu lateral compacto, com barra de rolagem **invisível**, preservando rolagem interna por mouse, touchpad, toque e navegação por teclado.
- Ícones SVG consistentes (14 opções no administrador de loja e 2 no painel geral), sem dependências de fontes externas.
- Menu recolhe/expande clicando no símbolo ◈ da marca, sem segundo botão de recolhimento.
- Barra lateral mantém o perfil, o único link para `/lancamentos.html` e a opção Sair sempre no rodapé.
- Link de lançamentos é um endereço do Vercel, com página própria e layout de tela cheia no celular; scanner EAN compartilhado.
- Checkboxes com 17 × 17 px; remoção programática de cópias do botão de lançamentos injetadas no menu.
- Service Worker atualizado para cache `registro-validades-v7-sidebar-icons` para a PWA carregar os estilos novos.

**Conferência:** `npm run check` passa 43 testes. Testes visuais isolados em Chromium nas resoluções 1440×900, 1280×720, 1024×600, 390×740 e 320×660 confirmam barra invisível, rolagem disponível e ausência de overflow horizontal; não são testes do backend real.

**OneSignal:** há um worker preparado em `/push/onesignal/OneSignalSDKWorker.js` e instruções em `CONFIGURAR-ONESIGNAL-VERCEL.md`, mas a assinatura e os envios não estão ativados. Não configure o agendamento até implementar e testar a API de envio.
