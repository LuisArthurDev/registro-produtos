# v19 — Cadastrar lojas no Painel Geral (global)

### Conceito dos perfis

- **Painel Geral:** gestão de **todas as unidades**, sem loja fixa ou filtro 151.
- **Luis Arthur no modo Admin de Loja:** atua na **Loja 151**.
- **Luis Arthur no modo Administrador Geral:** pode listar e cadastrar qualquer loja, e depois cadastrar administradores associados a elas. O PIN é o mesmo; a elevação de acesso segue as regras temporárias da v18.

### Como instalar

1. Atualize os arquivos do ZIP no repositório GitHub que publica no Vercel, preferencialmente primeiro em ambiente de testes.
2. Aguarde o deploy e atualize o navegador/PWA (reabra a página se houver cache).
3. Faça login como Luis Arthur; mude para o **Painel Geral** usando o PIN e o botão **Acessar Painel Geral**.
4. Clique em **Cadastrar loja**. Digite um código numérico que ainda não exista e um nome (exemplo fictício: `152` e `Loja 152 - Centro`).
5. Clique em **Cadastrar loja**. A unidade aparecerá na tabela; depois abra **Administradores de loja** e selecione a nova loja para cadastrar um responsável.

### Segurança e banco

O endpoint `POST /api/geral/lojas` requer modo **Geral ativo no servidor**. Se a conta estiver no modo Admin de Loja, a API retorna 403, inclusive quando a chamada for feita manualmente. A API não usa a Loja 151 como destino implícito.

O código tem de 1 a 12 dígitos; o nome, de 2 a 120 caracteres. Duplicatas são rejeitadas com HTTP 409. A auditoria da operação global é gravada sem uma loja associada (`loja_id=null`), com o ID da conta e o código/nome da nova loja.

**Nenhuma nova SQL é necessária**: a tabela `public.lojas` já está no esquema 001. Esta atualização não muda a Loja 151 de Luis Arthur, não modifica PINs e não interfere nos mapas.

### Testes

Os testes automatizados validam: acesso do Geral, bloqueio dos outros perfis, código e nome inválidos, duplicidade, retorno global das lojas e vínculo do administrador à loja criada. Ainda é necessário testar no Supabase/Vercel real antes de liberar em produção.
