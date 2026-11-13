> **Atualização v35:** filtros mantidos após recarregar e marcação em lote de Fórmulas Especiais. Leia [o guia da v35](ATUALIZAR-V35-FILTROS-FORMULAS-LOTE.md). Requer SQL 021 no Supabase após SQL 020.

> **Versão v34 — Fórmulas Especiais, histórico completo pelo olho na Visualização, Queima com Validade e Preço da Gôndola.** [Guia de instalação](ATUALIZAR-V34-FORMULAS-ESPECIAIS-GONDOLA-HISTORICO.md) — executar **SQL 020** antes do deploy.

> **v33:** campo Validade dos lançamentos com segunda barra automática ao digitar o ano. Veja [ATUALIZAR-V33-VALIDADE-ANO-AUTOMATICO.md](ATUALIZAR-V33-VALIDADE-ANO-AUTOMATICO.md). Nenhuma migração SQL é necessária.

> **Versão v32** — Mapa de Destino permanece selecionado após cada lançamento. A aba **Estoque** oferece **Selecionar todos filtrados** e **Descer selecionados para o mapa** com confirmação e transação no banco (SQL 019). Veja [instruções da v32](ATUALIZAR-V32-DESTINO-FIXO-DESCIDA-ESTOQUE-EM-LOTE.md).

> **Versão v31 — Conferência do mapa com estoque importado:** inclui mapas dos funcionários e a aba especial **Estoque**, excluindo Termolabil, Psicotropicos e Antibioticos da conferência e da cópia para o Conector Procfit. Veja [ATUALIZAR-V31-CONFERENCIA-SEM-ABAS-ESPECIAIS.md](ATUALIZAR-V31-CONFERENCIA-SEM-ABAS-ESPECIAIS.md). Não requer nova migração SQL.

> **Atualização v30:** cópia de todos os itens filtrados da conferência com estoque, inclusive após 100+ páginas; carregamento completo e seguro de mapas e saldos via API paginada. Consulte [ATUALIZAR-V30-PROCFIT-TODAS-PAGINAS.md](ATUALIZAR-V30-PROCFIT-TODAS-PAGINAS.md). Não exige nova migração SQL.

> **Atualização v28:** saldo não localizado = 0 na conferência; cópia para Procfit somente pela conferência, com prévia e fallback; tabelas mais compactas sem scroll horizontal. Ver [guia v28](ATUALIZAR-V28-PROCFIT-CONFERENCIA-TABELAS.md).

> **v27 — Tabelas em linhas, abas internas por nome e salvamento em lote da organização por Grupo.** Veja [ATUALIZAR-V27-LINHAS-ABAS-SALVAR-ORGANIZACAO.md](ATUALIZAR-V27-LINHAS-ABAS-SALVAR-ORGANIZACAO.md). Requer aplicar SQL 018 após SQL 017.

# Atualização v26.1 — 11/11/2026

Catálogo com **Grupo** importado por ODS (par EAN + Código Interno), organização por Grupo, importação tolerante de Estoque ODS/CSV, cópia TSV para **Conector Procfit — v1.0** e tabelas responsivas sem scroll horizontal.

**Leia primeiro:** [ATUALIZAR-V26-GRUPOS-ESTOQUE-PROCFIT-RESPONSIVO.md](ATUALIZAR-V26-GRUPOS-ESTOQUE-PROCFIT-RESPONSIVO.md). Execute as migrações 016 e 017 pelo Action `grupos_produtos` antes de publicar o frontend.

## Atualização v23 — Seções em grade (10/11/2026)

Na aba **Seções**, os cards de funcionários agora são organizados em grid responsivo, sem rolagem horizontal, com rolagem vertical interna nas listas de seções. As regras de organização, atribuição, recomendações e visibilidade da v22 foram preservadas. Para detalhes, consulte `ATUALIZAR-V23-GRID-FUNCIONARIOS.md`. Não requer migração do Supabase.

---

# Versão v22 — Seções, ocultação e exclusões das listagens

Leia [ATUALIZAR-V22-SECOES-VISIBILIDADE.md](ATUALIZAR-V22-SECOES-VISIBILIDADE.md) **antes** de publicar. É necessário executar a etapa de migração `visibilidade_secoes` (SQL 015) **antes de fazer o deploy do código atualizado**. O quadro agora aparece como **Seções** no menu.

# Versão v21 — Ícones, Organização de Seções e mês opcional

Leia [ATUALIZAR-V21-ICONES-SECOES-MES-OPCIONAL.md](ATUALIZAR-V21-ICONES-SECOES-MES-OPCIONAL.md) antes de publicar.

# Atualização v20 — equipes, titularidade e Painel Geral

Leia [ATUALIZAR-V20-FUNCIONARIOS-E-PAINEL-GERAL.md](ATUALIZAR-V20-FUNCIONARIOS-E-PAINEL-GERAL.md) antes de publicar. A migração SQL 012 é obrigatória **antes** de liberar esta versão em produção.

## v19 — Cadastro de lojas no Painel Geral

O **Painel Geral não está associado a nenhuma loja fixa**. A conta Luis Arthur pode manter
**Loja 151** como contexto ao usar o modo **Administrador de Loja**, enquanto o modo
**Administrador Geral** consulta e cadastra lojas de todo o sistema.

Em **Painel Geral → Cadastrar loja** informe código numérico (até 12 dígitos) e nome.
Se a loja já existir, o sistema informa a duplicidade e não substitui seus dados.
Após cadastrar, a nova unidade fica disponível no seletor ao criar administradores.
**Não há migração SQL adicional**: `public.lojas` já existe no esquema inicial.
O endpoint `POST /api/geral/lojas` verifica o modo Geral no servidor, não confia em
loja do navegador e grava auditoria com `loja_id = null` para a ação global.

# V18 — Login duplo Admin + Geral (Luis Arthur)

O login pode alternar entre Administrador de Loja e Administrador Geral usando o mesmo PIN. Antes de publicar, leia [ATIVAR-LOGIN-DUPLO-LUIS-ARTHUR.md](ATIVAR-LOGIN-DUPLO-LUIS-ARTHUR.md) e aplique o SQL 011 em homologação.

# Atualização v17 — funcionários sem Dashboard

Consulte [ATUALIZACAO-V17-LOGIN-MOBILE-SEM-DASHBOARD-FUNCIONARIO.md](ATUALIZACAO-V17-LOGIN-MOBILE-SEM-DASHBOARD-FUNCIONARIO.md).

## Versão v16 — Visualização Administrador e Gráfico da Queima com 3 situações

Veja [ATUALIZACAO-V16-VISUALIZACAO-GRAFICO-QUEIMA.md](ATUALIZACAO-V16-VISUALIZACAO-GRAFICO-QUEIMA.md).

## Atualização v14 — Visualização do próprio mapa

Leia [ATUALIZAR-VISUALIZACAO-FUNCIONARIOS.md](ATUALIZAR-VISUALIZACAO-FUNCIONARIOS.md). O arquivo `public/visualizacao.html` foi restaurado como página dedicada, com acesso seguro ao próprio mapa e ao histórico de vencidos/sinalizações. Antes do deploy execute `atualizar_visualizacao` no GitHub Actions.

## Novidade — Correções de 10/11/2026

Consulte [ATUALIZACAO-LOGIN-ONESIGNAL-PERDAS-TRANSFERENCIAS-2026-11-10.md](ATUALIZACAO-LOGIN-ONESIGNAL-PERDAS-TRANSFERENCIAS-2026-11-10.md). Antes de usar os botões novos, execute as migrações SQL `008` (se pendente) e `009` no GitHub Actions.

# Atualização de fluxos e transferências

Consulte [ATUALIZAR-FLUXOS-OPERACIONAIS.md](ATUALIZAR-FLUXOS-OPERACIONAIS.md) antes de publicar.

# Registro de Validades — migração para Supabase + Vercel

**Estado: base funcional para homologação, NÃO pronta para substituir a produção.**

Nova arquitetura (sem Google Apps Script nas rotas já migradas):

```
GitHub Pages (apenas redirecionamento)
         └──> Vercel: public/ (PWA) + api/index.js (APIs)
                     └──> Supabase: Postgres + RLS
```

Este pacote inclui o frontend, APIs, schema, scripts de migração e o redirecionamento GitHub Pages. É o pacote de **código sem dados privados**, organizado para um único repositório. **Não está conectado a um Supabase real.** A URL do Vercel e chaves do Supabase ainda precisam ser configuradas. Não considere o projeto concluído para produção sem testes com dados reais.

## Atualização de compatibilidade do Painel Conferente (09/11/2026)

O painel recebeu menus recolhíveis, Mapa de Validades com novo lançamento em modal, filtros/paginação/impressão/exportação, Controle de Validade, estoque especial, perdas, Queima e Vencidos, Produtos EAN, Pendências e Painel Geral exclusivo. A instalação da função transacional requer executar **GitHub Actions → Supabase - preparar e importar → etapa `atualizar_painel`** antes de testar no Vercel.

**Atenção — paridade ainda em homologação:** o envio OneSignal e a autorização individual de aparelhos agora possuem implementação no projeto, com agendamento pelo Actions de 8h, mas ainda precisam de configuração de chaves, teste com dispositivos reais e ativação explícita (`NOTIFICATIONS_ENABLED=true`). Algumas rotinas externas do Procfit continuam pendentes. Consulte [MATRIZ-PARIDADE-PAINEL-CONFERENTE.md](documentacao/MATRIZ-PARIDADE-PAINEL-CONFERENTE.md) para o levantamento completo e os testes de homologação. Não substitua a produção até validar essas lacunas.

## Um único repositório no GitHub

Primeiro teste a migração em uma branch `migracao-supabase`, preservando a `main` com o sistema atual. A aplicação Vercel usa a raiz (`/`): `public/`, `api/` e `vercel.json`. O GitHub Pages usa **Settings → Pages → Deploy from a branch → main → /docs**. A documentação foi movida para `documentacao/` para que a pasta `/docs` tenha o `index.html` de redirecionamento. Ative o redirecionamento apenas depois de homologar o Vercel e configure `docs/config.js` com a URL real. Veja `PUBLICACAO-REPOSITORIO-UNICO.md`.

## Pastas

| Pasta | Finalidade |
|---|---|
| `public/` | Frontend responsivo de página única (login, mapas, lançamento, catálogo, funcionários, Estoque especial, saldo Procfit, ocorrências e painéis) |
| `api/index.js` | API Vercel com PIN hash, sessão, autorização de loja, CRUD e operações atômicas |
| `supabase/` | Banco PostgreSQL, RLS, funções de lançamento e transferência de lote |
| `scripts/` | Importação do SQLite `produtos-ean` e dos registros históricos; conversor ODS→CSV |
| `private_data/` | Dados privados apenas no computador local; **não incluídos neste ZIP nem no GitHub** |
| `docs/` | Site de redirecionamento, publicado pelo GitHub Pages a partir de `main` + `/docs` |
| `documentacao/` | Passo a passo, análise dos GS, limites e checklist de homologação |

## Implantação — ordem obrigatória

1. Crie um **projeto novo** no Supabase e execute `supabase/001_schema.sql` no SQL Editor.
2. Copie `.env.example` para `.env` na sua máquina. Configure `SUPABASE_URL` e `SUPABASE_SECRET_KEY`; **NUNCA** envie a chave secreta a `public/`, GitHub ou chat.
3. Execute `python scripts/importar_dados.py` para validar dados. Revise `private_data/inconsistencias.csv` e `private_data/transferencias_REVISAR.csv`.
4. Execute `python scripts/importar_dados.py --apply` em ambiente seguro (com variáveis no terminal). Consulte `documentacao/IMPORTACAO.md`.
5. Execute `supabase/002_apos_importacao.sql`, confira contagens no SQL Editor e distribua de forma segura os PINs recém-gerados.
6. Importe este mesmo repositório no Vercel (Root Directory: `./`, sem `private_data/`), configure as variáveis de ambiente e teste `https://SEU-PROJETO.vercel.app/api/health`.
7. Homologue login, permissões, cadastro, lançamento, duplicidade, mapas, retirada de Estoque e importação de saldo, em desktop e celular.
8. Só **depois de aprovar a homologação**, edite `docs/config.js` com a URL definitiva, faça merge para `main` e configure o GitHub Pages para publicar a pasta `/docs` (sem copiar arquivos para a raiz). **Não substitua a `main` enquanto o Pages ainda publica a raiz: isso pode interromper o sistema atual.**

Para executar testes de sintaxe e segurança localmente: `npm run check` (Node.js 20+).

## Limitações atuais

Os fluxos principais já possuem código substituto, mas **não há paridade completa** com `code.gs` / `login.gs`. Antes de trocar o sistema real, concluir especialmente:

- OneSignal: inscrição voluntária por usuário no dispositivo e envio via GitHub Actions a cada 8h já têm código. Ainda é necessário testar em celulares reais, conferir o consentimento e ativar o envio somente após homologação.
- Autorização de celular próprio por dispositivo; a flag existe, mas o fluxo do antigo `login.gs` ainda não foi reproduzido.
- Operações especiais de Vencidos, Sinalização e Queima foram adicionadas à nova API, mas sua equivalência com os procedimentos do legado e sua execução real no Supabase ainda precisam ser homologadas.
- A importação ODS/CSV já está implementada no navegador para saldo Procfit. XLSX ainda precisa de conversão e o ODS deve ser testado com exportações reais.
- Trabalho offline completo, sincronização e alertas de possíveis conflitos; há reenvio idempotente em um lançamento pendente, mas não fila offline de vários itens.
- Migração revisada das 21 transferências com cabeçalhos inconsistentes e solução dos códigos EAN pendentes.
- Políticas de backup, recuperação, limite de acesso, proteção antiabuso do login e observabilidade em produção.

### Privacidade e segurança

O backend usa exclusivamente a chave `SUPABASE_SECRET_KEY` **no servidor**. Sessões são identificadas por token aleatório com hash SHA-256 no PostgreSQL, e PINs novos são armazenados como scrypt. As senhas legadas do Google Sheets não são copiadas para contas novas. Todas as tabelas restringem acesso público, e a API determina permissões por loja.

**Importante:** o PIN administrativo gerado no processo de migração deve ser alterado e entregue individualmente. `private_data/novos_pins_gerados.csv` contém credenciais e nunca deve ser versionado ou compartilhado.

Consulte `PUBLICACAO-REPOSITORIO-UNICO.md`, `documentacao/STATUS_E_LACUNAS.md` e `documentacao/VERCEL_E_REDIRECIONAMENTO.md` antes de publicar.

## Implantação pela nuvem (GitHub Actions + Vercel)

Leia **[CONFIGURACAO-ACTIONS-VERCEL.md](CONFIGURACAO-ACTIONS-VERCEL.md)** para criar as tabelas e migrar o histórico pelo workflow manual, sem rodar comandos no Windows.

## Diagnóstico de migração via Storage

Se o workflow parar em `Run python scripts/baixar_dados_privados.py`, consulte [`CORRECAO-DOWNLOAD-STORAGE.md`](CORRECAO-DOWNLOAD-STORAGE.md). O script agora mostra o código HTTP sem publicar credenciais.

## Workflow do GitHub Actions

Se o workflow não aparecer ou não iniciar, consulte [RECUPERAR-GITHUB-ACTIONS.md](RECUPERAR-GITHUB-ACTIONS.md).

## Correção da importação (loja_codigo)

Leia [CORRECAO-IMPORTACAO-LOJA.md](CORRECAO-IMPORTACAO-LOJA.md) para substituir o bundle privado e repetir as etapas no GitHub Actions.

## Atualização do scanner de EAN por câmera

Veja `documentacao/SCANNER-CAMERA-E-INTERFACE.md` para instalação e testes do scanner no Android/iPhone e `documentacao/PLANO-OFFLINE-DISPOSITIVOS-ONESIGNAL.md` para integrações ainda pendentes.


## OneSignal e agendamento de 8h (novo)

O App ID público está configurado. Para criar as tabelas, cadastrar as chaves em Vercel/Actions, autorizar um aparelho e ativar os três horários diários, leia [INSTALAR-ONESIGNAL-8H-ACTIONS.md](documentacao/INSTALAR-ONESIGNAL-8H-ACTIONS.md). **O envio permanece desativado por padrão e não foi testado com o Supabase/OneSignal reais.**

## Atualização: todos podem optar por notificações + senha própria do Geral (09/11/2026)

Esta versão altera o fluxo OneSignal para perguntar **Deseja receber notificações?**
na entrada do site (login e página dedicada de Lançamentos). O usuário pode escolher
**Permitir notificações** ou **Agora não**, e mudar depois no menu Notificações.
A permissão nativa é solicitada apenas após tocar em Permitir, e a escolha fica
associada à conta no dispositivo para não ser herdada por outro funcionário.
Não exige habilitar `Celular próprio` nem obter aprovação do administrador.

O Administrador Geral também tem **Alterar minha senha** no Painel Geral, exigindo
o PIN atual, o novo PIN de 6 a 12 números e sua confirmação. As outras sessões
são encerradas atomicamente, mantendo a sessão corrente.

**Antes do deploy no Vercel, execute no GitHub Actions** (workflow 
`Supabase - preparar e importar`) as etapas `notificacoes_para_todos` (SQL 006)
e `pin_administrador_geral` (SQL 007). Essas migrações são aditivas e não apagam
produtos, mapas ou lançamentos. Caso ainda não tenha criado as tabelas do
OneSignal, execute `configurar_notificacoes` (SQL 005) antes da 006.

Veja `documentacao/NOTIFICACOES-TODOS-E-PIN-GERAL.md`. A implementação foi testada
localmente com simuladores; o recebimento real de Web Push, a inscrição dos
celulares e a execução do cron devem ser homologados no seu domínio Vercel.

## V24 — Conferência do ODS importado e pendências de EAN

Consulte `ATUALIZAR-V24-ODS-PENDENCIAS-AVISOS.md` para aplicar primeiro a migração SQL 016 e publicar as correções. A conferência compara mapas com o estoque **já salvo** no Supabase, sem exigir novo upload ou modificar dados automaticamente.

## V29 — Organização de Grupos com responsáveis opcionais

Na aba **Seções**, agora é possível clicar em **Salvar organização** quando há grupos novos em **Sem responsável**, inclusive quando todos estão sem dono. O histórico e os lançamentos permanecem intactos; o campo de responsável da organização é salvo como `NULL`.

Consulte `ATUALIZAR-V29-SALVAR-SEM-RESPONSAVEL.md`. Não há nova migração SQL; a SQL 018 precisa estar aplicada.


## Correção da v36 — Copiar dados para Procfit

O botão da conferência foi restaurado para **Copiar para Conector Procfit — v1.0**, com prévia e fallback Ctrl+C. Consulte `ATUALIZAR-V36-COPIA-DADOS-PROCFIT.md`. A preparação JSON da v36 anterior não é mais o botão ativo.

## V38 — Exportar XLS da Conferência

O botão **Exportar XLS** gera seis colunas (`Motivo`, `Codigo`, `Ean`, `Lote`, `Validade`, `Quantidade`) com o Código Interno como identificador preferencial; somente na ausência dele usa EAN. Quantidades são corrigidas pelo saldo, com filtros e regras de exclusão. Consulte [ATUALIZAR-V38-EXPORTAR-CONFERENCIA-XLS.md](ATUALIZAR-V38-EXPORTAR-CONFERENCIA-XLS.md).
