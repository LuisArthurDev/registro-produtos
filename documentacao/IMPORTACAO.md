# Importação do Google Sheets e catálogo Produtos EAN

A pasta `private_data` foi gerada da planilha `MAPA DE VALIDADE.xlsx` enviada e do banco SQLite `produtos_ean.db` presente no ZIP do repositório.

## Dados preparados

- 1.299 lançamentos históricos do mapa: **1.296** importáveis, **2** EANs fora do padrão e **1** lote com 257 caracteres preservados em `migracao_pendencias`, sem truncamento.
- 17 contas reais (as categorias especiais não viram logins), com perfis e loja; **sem senhas antigas**.
- 33 linhas de Vencidos. Duas tinham `MANUAL_...` na primeira coluna `LojaOrigem`; a **segunda coluna da planilha original confirma loja 151** e foi usada no pacote privado corrigido. Muitas linhas usam código **interno**, não EAN; o script SQL só preenche o EAN quando o código interno for não ambíguo.
- 1 linha de Queima e 45 eventos históricos de auditoria.
- 21 linhas de Transferências aguardam reconciliação em `transferencias_REVISAR.csv` porque o cabeçalho original contém colunas repetidas e dados desalinhados.
- 82.972 entradas no SQLite: **82.498** EANs válidos entram em `produtos`, e **474** entradas fora do padrão são preservadas em `catalogo_pendencias` para análise (não são perdidas).
- A aba especial **Estoque não estava presente nesta versão do XLSX**; a estrutura existe, mas será necessário exportar/importar seus registros atuais para completá-la.

## Rodar em modo seco

```powershell
cd caminho\registro-produtos  # raiz do repositório
python scripts/importar_dados.py
```

## Rodar com credenciais, em local seguro

```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_SUA_CHAVE_PRIVADA"
python scripts/importar_dados.py --apply
```

No primeiro envio, são gerados PINs novos de forma reprodutível com `MIGRATION_PIN_SEED` em `private_data/novos_pins_gerados.csv`. Não envie esse arquivo por WhatsApp coletivo ou ao GitHub. Os PINs originais não podem ser recuperados de forma segura dos hashes antigos; o procedimento é redefini-los.

O importador usa o REST PostgREST do Supabase e `resolution=ignore-duplicates` para reduzir risco de repetição. A auditoria utiliza `origem_migracao` para evitar duplicidade nas reexecuções; mantenha a mesma seed dos PINs em toda tentativa. Não execute várias importações em paralelo.

Execute depois `supabase/002_apos_importacao.sql` no SQL Editor para vincular os mapas ao catálogo, completar apenas códigos internos não ambíguos de Vencidos e conferir contagens. Faça comparação de amostras com o XLSX original, inclusive produtos com EAN começando em 0.

### Estoque Procfit

A importação de saldo é diferente da aba especial Estoque. No painel Vercel, menu **Saldo Procfit**, aceite CSV com colunas `ean,codigo_interno,descricao,secao,quantidade` (arquivo pode usar `;` ou `,` separador). Para um ODS com essas colunas identificáveis:

```powershell
python scripts/converter_estoque_ods.py "Estoque.ods" "estoque_convertido.csv"
```

**Não** importe o CSV de saldo na tabela de mapa: ele não contém lote nem validade. O conversor não tenta adivinhar cabeçalhos ausentes.

### Lançamentos inválidos e mudanças históricas

`private_data/inconsistencias.csv` aponta problemas originais. Não atribua zeros à esquerda sem base verificável; a correção exige EAN da embalagem/catálogo. Transferências não são migradas automaticamente enquanto o mapeamento das colunas for ambíguo.
