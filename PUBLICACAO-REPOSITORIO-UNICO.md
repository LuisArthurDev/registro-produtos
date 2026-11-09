# Repositório único: GitHub Pages + Vercel + Supabase

## Estrutura final

```text
registro-produtos/                 ← mesmo repositório GitHub de sempre
├── api/index.js                  ← backend do Vercel
├── public/                       ← site/PWA servido pelo Vercel
│   ├── index.html
│   └── assets/
├── docs/                         ← GitHub Pages APENAS redireciona
│   ├── index.html
│   ├── lancamento.html
│   ├── visualizacao.html
│   ├── painelconferente.html
│   ├── painelgeral.html
│   ├── 404.html
│   └── config.js                  ← URL do Vercel
├── supabase/                     ← scripts SQL
├── scripts/                      ← importação de dados (local)
├── documentacao/                 ← guias técnicos (não fazem parte do site)
├── tests/
├── .gitignore
├── package.json
└── vercel.json
```

## Publicação segura, em sequência

1. Faça um backup do repositório atual e da planilha original. **Não altere a `main` ainda**: se o GitHub Pages publica a raiz, substituir o `index.html` de uma vez pode derrubar o sistema antigo.
2. Crie uma branch **`migracao-supabase` no mesmo repositório** e coloque nela os arquivos deste ZIP, na raiz. Não versionar `.env`, backups nem `private_data/`.
3. Configure o banco Supabase e importe dados. Veja `documentacao/IMPORTACAO.md` e `documentacao/STATUS_E_LACUNAS.md`.
4. No Vercel, clique em **Add New → Project → Import Git Repository**, selecione esse mesmo repositório, configure **Root Directory = `./`**, sem framework obrigatório, e configure a **Production Branch** para `migracao-supabase` enquanto testa. No painel Vercel, cadastre **`SUPABASE_URL` e `SUPABASE_SECRET_KEY`** (nunca no GitHub).
5. Teste a URL `https://<seu-projeto>.vercel.app/api/health` e realize testes completos de login, permissões, lançamentos, Estoque especial, Queima, visualização, PWA e notificações. Algumas funções legadas ainda estão pendentes conforme `documentacao/STATUS_E_LACUNAS.md`.
6. **Somente quando a substituição estiver homologada**, edite `docs/config.js` na branch `migracao-supabase` para `window.VERCEL_DESTINO = 'https://seu-projeto.vercel.app';` usando a sua URL real.
7. Faça merge da branch `migracao-supabase` em `main` (ou ajuste o Pages para publicar `/docs` diretamente dessa branch) e, em **GitHub → Settings → Pages → Build and deployment**, selecione **Deploy from a branch**, branch **main**, pasta **/docs**, e salve. Se a origem atual do Pages for `/`, faça a mudança de fonte imediatamente após o merge para minimizar interrupção. Depois mantenha o Vercel acompanhando `main` como Production Branch.
8. Teste links antigos (`/lancamento.html`, `/visualizacao.html`), confirme o destino correto. Para PWA instalado no domínio antigo, instale novamente no domínio do Vercel. Se o aplicativo antigo continuar abrindo em vez do redirecionamento, remova o atalho PWA anterior e limpe os dados do site antigo no navegador; `docs/sw.js` ajuda a desativar o Service Worker quando ele receber uma atualização.

## Por que duas pastas?

O Vercel publica `public/` e executa `api/` a partir da raiz. O GitHub Pages só consegue selecionar a raiz ou `/docs` como fonte da publicação de um branch. Guardar o redirecionamento em `/docs` resolve a convivência no mesmo repositório sem misturar frontend, API e destino antigo.

## Atenção à transição

- **Não ative o redirecionamento antes de validar a nova versão:** pode causar paralisação do sistema usado diariamente.
- As URLs antigas deixam de usar o backend Google Apps Script assim que o redirecionamento for ativado.
- **Uma conexão com o Supabase não foi configurada neste ZIP.** A migração exige projeto criado, SQL executado, dados importados e credenciais configuradas pelo responsável.
- Este ZIP é **somente código**, sem senhas, colaboradores, planilha ou banco SQLite. Os dados devem ser importados localmente a partir do backup privado, sem envio ao repositório GitHub.
- Mantenha um plano de retorno para os arquivos/branch anteriores até acabar a homologação. Não opere lançamentos nos dois bancos sem estratégia de sincronização.
