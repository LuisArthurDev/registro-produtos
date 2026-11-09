#!/usr/bin/env python3
"""Obtém um bundle ZIP de migração do Supabase Storage privado ou URL assinada.

Nunca imprime a URL/chaves e só extrai arquivos permitidos em private_data/.
"""
import os
import sys
import io
import zipfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'private_data'
MAX_DOWNLOAD = 120 * 1024 * 1024
MAX_EXTRACT = 250 * 1024 * 1024
ALLOWED = {'auditoria.csv', 'mapa_lancamentos.csv', 'usuarios_sem_senhas.csv',
           'vencidos.csv', 'queima.csv', 'transferencias_REVISAR.csv',
           'inconsistencias.csv', 'manifest.json', 'produtos_ean.db',
           'estoque_especial.csv'}
REQUIRED = {'auditoria.csv','mapa_lancamentos.csv','usuarios_sem_senhas.csv',
            'vencidos.csv','queima.csv','transferencias_REVISAR.csv','produtos_ean.db'}


def main():
    base = os.environ.get('SUPABASE_URL', '').strip().rstrip('/')
    secret = os.environ.get('SUPABASE_SECRET_KEY', '').strip()
    signed = os.environ.get('MIGRATION_BUNDLE_URL', '').strip()
    if signed:
        if not signed.startswith('https://'):
            sys.exit('MIGRATION_BUNDLE_URL precisa usar HTTPS.')
        url = signed
        headers = {'User-Agent':'registro-validades-import/1.0'}
    else:
        if not base.startswith('https://') or not secret:
            sys.exit('Configure SUPABASE_URL, SUPABASE_SECRET_KEY e o bundle privado.')
        bucket = os.environ.get('MIGRATION_STORAGE_BUCKET','migracao').strip()
        obj = os.environ.get('MIGRATION_STORAGE_OBJECT','dados-migracao.zip').strip()
        if not bucket.isascii() or not bucket.replace('-','').replace('_','').isalnum():
            sys.exit('Bucket inválido.')
        if obj != 'dados-migracao.zip':
            sys.exit('Para esta versão, o nome permitido é dados-migracao.zip.')
        url = f'{base}/storage/v1/object/authenticated/{bucket}/{obj}'
        headers = {'apikey':secret,'User-Agent':'registro-validades-import/1.0'}
        if secret.count('.') == 2:
            headers['Authorization'] = 'Bearer ' + secret
    print('Obtendo dados de migração do armazenamento privado...')
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            content = resp.read(MAX_DOWNLOAD + 1)
    except Exception as ex:
        sys.exit(f'Falha ao baixar pacote privado ({type(ex).__name__}); confira bucket, chave e autorização.')
    if len(content)>MAX_DOWNLOAD:
        sys.exit('Bundle excede 120 MB.')
    try:
        z = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        sys.exit('O arquivo obtido não é um ZIP válido.')
    extracted = set()
    total = 0
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    for item in z.infolist():
        if item.is_dir():
            continue
        name=item.filename.replace('\\','/')
        parts=name.split('/')
        if len(parts)!=2 or parts[0]!='private_data' or parts[1] not in ALLOWED:
            sys.exit('O bundle contém um caminho não permitido; use apenas private_data/ com arquivos de migração.')
        if item.external_attr >> 16 & 0o170000 == 0o120000:
            sys.exit('Links simbólicos não são permitidos no bundle.')
        if parts[1] in extracted:
            sys.exit('Arquivo duplicado no bundle privado.')
        total += item.file_size
        if total > MAX_EXTRACT:
            sys.exit('O bundle excede o limite de extração.')
        with z.open(item) as source, (DATA/parts[1]).open('wb') as target:
            import shutil
            shutil.copyfileobj(source,target)
        (DATA/parts[1]).chmod(0o600)
        extracted.add(parts[1])
    missing = REQUIRED - extracted
    if missing:
        sys.exit('Faltam arquivos obrigatórios no pacote: ' + ', '.join(sorted(missing)))
    print(f'Pacote privado validado: {len(extracted)} arquivos. Dados não serão publicados no GitHub.')


if __name__ == '__main__':
    main()
