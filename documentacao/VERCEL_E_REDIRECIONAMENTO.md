# Implantar Vercel e conservar endereço GitHub Pages

## 1. Publicar Vercel primeiro

Use o **mesmo repositório** que publica o GitHub Pages, mantendo na raiz `public/`, `api/`, `package.json` e `vercel.json`. Não publique `private_data/` nem `.env` (excluídos pelo `.gitignore`). Em Vercel → Add New Project importe esse repositório com Root Directory = `./`.

Não precisa framework: o HTML/CSS/JS estão em `public/` e a API em `api/index.js`. Em Project → Settings → Environment Variables, cadastre:

- `SUPABASE_URL` = URL `https://...supabase.co`
- `SUPABASE_SECRET_KEY` = chave **secret** de servidor `sb_secret_...`

Depois do deploy, abra `https://SEU-PROJETO.vercel.app/api/health`, que deve indicar `supabaseConfigurado: true` (isso não garante conectividade real ao banco). Teste login e CRUD com usuários migrados.

As chaves secretas do Supabase **não podem aparecer no JavaScript do navegador, no GitHub ou no HTML de redirecionamento**. Consulte [Supabase — new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) e [Vercel rewrites](https://vercel.com/docs/routing/rewrites).

## 2. Configurar o redirecionamento GitHub Pages

Abra `docs/config.js` e altere a linha:

```javascript
window.VERCEL_DESTINO = 'https://SEU-PROJETO.vercel.app';
```

para o seu domínio real, por exemplo:

```javascript
window.VERCEL_DESTINO = 'https://meus-mapas.vercel.app';
```

**Não altere a URL por conta própria para outro domínio** nem insira chaves ou tokens nesse arquivo.

Configure o GitHub Pages em **Settings → Pages → Deploy from a branch → main → /docs**, depois de validar a aplicação nova. Não copie as páginas para a raiz do repositório: essa raiz pertence ao Vercel. O redirecionamento foi feito em HTML/JS para compatibilidade com repositórios de projeto (`usuario.github.io/repositorio/`), onde um arquivo de redirecionamento Vercel não altera a origem do GitHub Pages.

Links antigos suportados:

- `index.html` → `/`
- `lancamento.html` → `/#lancamentos`
- `visualizacao.html` → `/#mapas`
- `painelconferente.html` e `painelgeral.html` → `/#dashboard`
- `instalar.html` → `/`

O navegador troca o endereço com `location.replace()`, e a interface mostra um link manual. Não são repassados parâmetros antigos da URL para evitar vazamento de dados de sessão.

## 3. Aplicativo instalado no celular

Um PWA instalado do domínio antigo **não vira automaticamente o PWA do domínio novo**. O redirecionamento abre a nova URL, mas para instalar o novo aplicativo é recomendado usar “Adicionar à tela inicial” já no domínio Vercel. Eventualmente será necessário limpar o cache antigo e remover o atalho anterior.

## 4. Voltar atrás

Guarde cópia do GitHub Pages original em outro branch/backup, sem apagar o banco Sheets antigo. Se o novo sistema falhar na homologação, republique a versão anterior no GitHub Pages e não faça lançamentos em duas bases paralelas sem estratégia de sincronização.
