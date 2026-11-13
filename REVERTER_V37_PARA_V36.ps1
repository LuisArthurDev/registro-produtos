# Executar no PowerShell dentro da pasta do repositório, DEPOIS de extrair a atualização.
# Remove exclusivamente os arquivos experimentais da v37. Não altera dados do banco.
$remover = @(
    "ATUALIZAR-V37-GERADOR-TDB-TESTE.md",
    "tests/tdb-binario-experimental-v37.test.js",
    "scripts/gerar-tdb-teste.mjs",
    "public/assets/procfit-modelo-teste.tdb",
    "public/assets/procfit-gerador-tdb.js"
)
foreach ($caminho in $remover) { if (Test-Path -LiteralPath $caminho -PathType Leaf) { Remove-Item -LiteralPath $caminho -Force } }
Write-Host "Reversao v36: componentes binarios experimentais v37 removidos."
