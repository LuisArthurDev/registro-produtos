# Redirecionamento publicado pelo GitHub Pages

Esta pasta (`/docs`) é a origem do GitHub Pages. Todos os arquivos HTML aqui redirecionam para o Vercel, usando `docs/config.js`.

Configure **Settings → Pages → Deploy from a branch → main → /docs**. Não escolha a raiz (`/(root)`): a raiz contém o aplicativo Vercel.

**Atenção:** editar `docs/config.js` e configurar o Pages para `/docs` só depois de testar a versão no Vercel. O endereço antigo pode ficar temporariamente indisponível quando você trocar a origem do Pages; mantenha backup do branch anterior para restaurar.

# GitHub Pages → Vercel

1. Publique e valide primeiro a aplicação em `https://SEU-PROJETO.vercel.app`.
2. Edite **apenas** `config.js`, substituindo `SEU-PROJETO.vercel.app` pelo domínio HTTPS real. Não adicione caminhos, parâmetros ou barra final.
3. Publique o conteúdo **desta pasta** na raiz do repositório GitHub Pages (ou no diretório usado como fonte de publicação) e apague as páginas HTML antigas da versão hospedada lá. Não publique a pasta `private_data` ou `.env`.
4. No GitHub, em Settings → Pages, verifique a fonte de publicação; aguarde o site estar publicado.
5. Teste a URL principal e links antigos `/lancamento.html`, `/visualizacao.html`, `/painelconferente.html`.

A página usa `location.replace` para não empilhar o endereço antigo no histórico, com botão manual se JavaScript permitir. As rotas antigas são mapeadas para hash da nova SPA. Parâmetros de URL **não são transferidos**, por proteção de credenciais. O arquivo `pwa.js` substitui o service worker antigo para deixar de cachear páginas desativadas; em instalações PWA antigas pode ser necessário remover o atalho/limpar dados do site uma vez.

**Não configure o redirecionamento antes de concluir a migração do banco e testar login/lançamento no Vercel.**
