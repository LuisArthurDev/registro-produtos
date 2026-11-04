# Login individual, perfis e isolamento por loja

## Arquivos alterados

- `index.html`: continua sendo a tela de login. Depois de autenticar um administrador, mostra o botão **Entrar no Painel Conferente**.
- `lancamento.html`: continua sendo a tela de lançamento e passa a exigir uma sessão de funcionário. O nome do funcionário é preenchido automaticamente e o seletor fica bloqueado.
- `visualizacao.html`: exige sessão e limita os registros ao próprio funcionário ou, para administradores, aos funcionários da loja vinculada.
- `painelconferente.html`: exige perfil Administrador e envia o token da sessão em todas as chamadas ao servidor.
- `auth.js`: valida sessão, perfil, loja e logout.
- `login.gs`: autentica PINs e cria/valida sessões individuais.
- `code.gs`: valida autorização no servidor, limita mapas por funcionário/loja e protege operações administrativas.
- `erro.html`: página exibida para sessão ausente, expirada ou perfil sem autorização.

## Cadastro na aba Funcionarios

A partir da linha 2, mantenha as colunas existentes e use:

| Coluna | Conteúdo | Regra |
|---|---|---|
| A | Nome | Nome único do funcionário/administrador |
| B | Especial | Checkbox já utilizado pelo sistema |
| F | Check | Checkbox já utilizado pelo sistema |
| G | PIN | Hash com salt; não é texto simples |
| H | Administrador | `TRUE`/checkbox ou `SIM` para administrador; `FALSE` para funcionário |
| I | Loja | Número da loja, por exemplo `151` ou `152` |

**Preencha a coluna I para todos os funcionários e administradores.** Sem loja cadastrada, o login é recusado. Use o mesmo identificador de loja em todas as linhas da mesma unidade.

A coluna G não deve receber o PIN em texto puro. O sistema grava `salt:hash` quando o PIN é definido pelo painel. Para promover alguém que já possui PIN, basta marcar H como verdadeiro e preencher I. Para cadastrar mais um administrador, crie/promova a linha, marque H e I e peça a um administrador da mesma loja para definir o PIN pelo ícone de chave na aba Funcionários do Painel Conferente.

Se ainda não houver nenhum administrador com PIN válido, marque H e I para o primeiro administrador e execute manualmente `definirPinInicialAdmin(nome, pin)` no editor do Apps Script. Essa função não é publicada como endpoint; é apenas para bootstrap pelo proprietário do script.

## Regras de acesso

- Funcionário: só pode lançar no próprio mapa e consultar/editar os registros do próprio mapa.
- Administrador: só pode consultar e administrar mapas da própria loja.
- Administradores não entram nas listas operacionais de lançamento e visualização de mapas.
- Administradores aparecem na gestão de Funcionários do Painel Conferente da própria loja e podem ter o PIN redefinido por outro administrador dessa loja.
- A criação de um funcionário pelo painel grava automaticamente a loja do administrador conectado na coluna I.
- Transferências são restritas a administradores e filtradas pela loja de origem.
- A validação ocorre também no Apps Script; esconder opções no HTML não é considerado controle de segurança.

## Publicação

1. Faça uma cópia de segurança da planilha e do projeto Apps Script.
2. Atualize os arquivos `code.gs` e `login.gs` no projeto Apps Script, preservando as configurações/propriedades existentes (por exemplo, tokens e chaves do GitHub).
3. Publique uma **nova versão** da implantação do Web App. Mantenha a URL `/exec` atual; se a URL mudar, atualize a constante `API_URL` em `auth.js` e as constantes equivalentes nos HTMLs.
4. Envie os arquivos HTML/JS atualizados ao repositório GitHub Pages, incluindo `erro.html` e este documento.
5. Na aba `Funcionarios`, confira H e I de todos os cadastros.
6. Teste primeiro com um funcionário de uma loja e um administrador de outra loja antes de liberar para todos.

## Testes obrigatórios antes de produção

- Sem login, abrir diretamente `lancamento.html`, `visualizacao.html` e `painelconferente.html`: deve redirecionar para `erro.html`.
- Funcionário: login, lançamento no próprio nome, visualização apenas do próprio mapa e logout.
- Funcionário: tentar trocar o nome do mapa no HTML/URL ou enviar outro nome manualmente; o servidor deve recusar.
- Funcionário: tentar abrir o Painel Conferente; deve ser recusado.
- Administrador da loja 151: visualizar apenas funcionários da loja 151 e não conseguir consultar/editar registros da 152.
- Administrador: confirmar que outros administradores da mesma loja aparecem somente na gestão de Funcionários, e não nas listas de mapas.
- Logout: confirmar que voltar à página protegida exige novo login.

> Observação: o código foi submetido a verificações estáticas de sintaxe JavaScript. A integração real ainda precisa ser testada na implantação do Apps Script e na planilha, porque depende das permissões, cabeçalhos e dados atuais da sua conta.


## Administrador Geral (novo)

O sistema agora possui três perfis: Funcionário, Administrador de Loja e Administrador Geral. O Administrador Geral é único, não possui loja, não recebe aba de mapa e não aparece nas listas operacionais nem na gestão de funcionários do Painel Conferente. Ele utiliza a página `painelgeral.html` para criar administradores de loja.

### Criar o primeiro Administrador Geral

1. Na aba `Funcionarios`, crie uma linha para a pessoa que será Administrador Geral e preencha o nome na coluna A.
2. No editor do Google Apps Script, abra `login.gs` e localize `configurarAdministradorGeralInicial`.
3. Substitua os dois valores de exemplo no início da função pelo nome e por um PIN exclusivo de 4 a 6 números. Não compartilhe o PIN.
4. Selecione `configurarAdministradorGeralInicial` no editor e execute manualmente. A função grava o PIN com salt e hash na coluna G, grava `GERAL` na coluna H e deixa a coluna I vazia. Ela remove a validação de checkbox apenas da célula H desse cadastro.
5. Depois da configuração, apague o PIN em texto do código (substitua novamente pelo marcador) e publique uma nova versão da implantação do Apps Script. Entre pelo `index.html`; o Administrador Geral será direcionado automaticamente para `painelgeral.html`.

### Criar administradores de loja

No `painelgeral.html`, informe nome, número da loja e PIN inicial. O sistema cria o cadastro na aba `Funcionarios`, com H marcado como administrador e I preenchida com a loja. Não cria uma aba de mapa para o administrador. Somente o Administrador Geral pode usar essa função.

### Observações de segurança

- Não marque manualmente vários registros como `GERAL`. A função de configuração inicial impede a criação de um segundo Administrador Geral.
- O Administrador Geral não deve receber número de loja na coluna I.
- O Administrador de Loja continua limitado à própria loja e não pode criar outros administradores.
- Após substituir os arquivos no projeto Apps Script/GitHub Pages, publique uma nova versão do Web App e atualize os arquivos estáticos no GitHub Pages.
