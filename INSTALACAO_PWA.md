# Instalação do Registro de Mapa de Validade (PWA)

## Página de instalação

Depois de publicar os arquivos no GitHub Pages, acesse:

`https://luisarthurdev.github.io/registro-produtos/instalar.html`

No Android/Chrome, use **Instalar aplicativo** quando o botão aparecer. Se não aparecer, abra o menu ⋮ do Chrome e escolha **Instalar aplicativo** ou **Adicionar à tela inicial**. No iPhone/iPad, abra no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**. No computador, use o ícone/opção **Instalar** do Chrome ou Edge.

## Arquivos PWA adicionados

- `manifest.webmanifest`: nome, ícones, escopo e abertura em modo standalone.
- `icon-192.png`, `icon-512.png` e `icon-maskable-512.png`: ícones de instalação.
- `pwa.js`: registra o service worker dentro do escopo `/registro-produtos/`.
- `OneSignalSDKWorker.js`: worker já usado pelo OneSignal para push; é compartilhado para evitar dois workers concorrentes no mesmo escopo.
- `instalar.html`: página pública com instruções e botão de instalação quando o navegador oferece o evento de instalação.

## Publicação

1. Substitua/adiciona os arquivos do ZIP no repositório GitHub, preservando a estrutura de pastas.
2. Aguarde o GitHub Pages publicar.
3. Abra a URL acima no Chrome do celular.
4. Instale e depois abra o ícone **Mapa de Validade**. O login continua sendo obrigatório.

A instalação não é um APK e não libera acesso sem autenticação. O aplicativo continua dependendo de internet para consultar e gravar dados. A página de instalação e o manifest são públicos, mas não contêm dados da loja nem funções administrativas.

## Notificações

O registro PWA usa o `OneSignalSDKWorker.js` existente para manter o worker de push em um único escopo. O recebimento de push com o navegador fechado/tela bloqueada só estará ativo depois de concluir a configuração do OneSignal descrita em `CONFIGURAR_NOTIFICACOES_PUSH.md`, incluindo App ID público, chave REST somente nas propriedades do Apps Script e assinatura/permissão concedida no dispositivo.

Se o navegador já tinha instalado o site antes desta atualização, feche e abra o navegador novamente. Se necessário, remova o atalho antigo e instale outra vez para atualizar nome/ícone/manifest.
