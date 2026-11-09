#!/usr/bin/env python3
"""Importação inicial de catálogo SQLite e CSVs da planilha para Supabase.

Requer apenas Python 3.10+ (biblioteca padrão). Sem chave -> validação offline.
Por padrão NÃO envia nada. Use --apply após backup e revisão dos CSVs.
As senhas antigas NÃO são reaproveitadas; gera PINs novos e privados.
No GitHub Actions, os PINs são derivados de MIGRATION_PIN_SEED e cifrados antes de sair do runner.
"""
import argparse, csv, hashlib, hmac, json, os, re, secrets, sqlite3, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'private_data'
SPECIAL = {'Estoque', 'Termolabil', 'Psicotropicos', 'Antibioticos'}
LOJA_RE = re.compile(r'^[0-9]{1,12}$')
EAN_RE = re.compile(r'^[0-9]{8,14}$')


def read_csv(filename):
    with open(DATA / filename, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def batch(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def norm(s):
    import unicodedata
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD', str(s or '').strip().lower()) if unicodedata.category(c) != 'Mn').split())


def uid(name, store):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'registro-validades/2026/usuario/' + norm(name) + '/' + str(store or 'GERAL')))


def loja_valida(value):
    """Códigos MANUAL_* identificam lançamentos, não lojas do Procfit."""
    return bool(LOJA_RE.fullmatch(str(value or '').strip()))


def ean_valido(value):
    return bool(EAN_RE.fullmatch(str(value or '').strip()))


def motivo_mapa_invalido(row):
    if not loja_valida(row.get('loja_id')):
        return 'Código de loja inválido (não substituído automaticamente)'
    if not ean_valido(row.get('ean')):
        return 'EAN fora do padrão de 8 a 14 dígitos'
    lote = str(row.get('lote') or '').strip()
    if not 1 <= len(lote) <= 100:
        return 'Lote vazio ou com mais de 100 caracteres'
    try:
        quantidade = int(row.get('quantidade') or '')
    except (ValueError, TypeError):
        return 'Quantidade não numérica'
    if quantidade < 0:
        return 'Quantidade negativa'
    return None


def pendencia(row, table, reason):
    """Registra a linha integral para auditoria em vez de perder dados legados."""
    return {'origem_migracao': row['origem_migracao'],
            'tabela_origem': table, 'motivo': reason, 'dados': row}


def pin_hash(pin):
    salt = secrets.token_bytes(24).hex()
    digest = hashlib.scrypt(pin.encode('ascii'), salt=salt.encode('ascii'), n=16384, r=8, p=1, dklen=64)
    return f'scrypt${salt}${digest.hex()}'


def api(action, data=None, *, conflict=None, method='POST', url=None, key=None):
    params = '?on_conflict=' + urllib.parse.quote(conflict, safe=',') if conflict else ''
    endpoint = url.rstrip('/') + '/rest/v1/' + action + params
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8') if data is not None else None
    headers = {'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates,return=minimal'}
    if key.count('.') == 2:
        headers['Authorization'] = 'Bearer ' + key
    req = urllib.request.Request(endpoint, data=raw, method=method, headers=headers)
    for n in range(3):
        try:
            with urllib.request.urlopen(req, timeout=65) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:500]
            if e.code < 500 or n == 2:
                raise RuntimeError(f'{action}: HTTP {e.code} {detail}') from e
        except (urllib.error.URLError, TimeoutError) as e:
            if n == 2:
                raise RuntimeError(f'{action}: sem conexão ({e})') from e
        time.sleep(2 * (n+1))


def usuarios_no_banco(*, url, key):
    """Consulta IDs efetivos por nome/loja; suporta bases parcialmente migradas.

    Não presume que IDs de contas já existentes sejam os UUIDs determinísticos
    calculados pela versão atual do importador.
    """
    resultado = {}
    limite = 1000
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            'select': 'id,nome_normalizado,loja_id',
            'limit': str(limite),
            'offset': str(offset),
            'order': 'id.asc',
        })
        endpoint = url.rstrip('/') + '/rest/v1/usuarios?' + query
        headers = {'apikey': key, 'Accept': 'application/json'}
        if key.count('.') == 2:
            headers['Authorization'] = 'Bearer ' + key
        req = urllib.request.Request(endpoint, method='GET', headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=65) as resp:
                linhas = json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'replace')[:400]
            raise RuntimeError(f'Consulta de usuários: HTTP {exc.code} {detail}') from exc
        if not isinstance(linhas, list):
            raise RuntimeError('Consulta de usuários retornou formato inesperado.')
        for row in linhas:
            chave = (norm(row['nome_normalizado']), str(row['loja_id'] or ''))
            if chave in resultado and resultado[chave] != row['id']:
                raise RuntimeError('Há contas duplicadas por nome/loja no Supabase; revisar antes de importar.')
            resultado[chave] = row['id']
        if len(linhas) < limite:
            return resultado
        offset += limite


def chave_usuario(nome, loja):
    return (norm(nome), str(loja or ''))


def vincular_funcionarios(mapas, usuarios_remotos):
    """Aponta mapas para IDs REAIS do Supabase, sem criar associação falsa."""
    faltantes = set()
    saida = []
    for m in mapas:
        usuario_id = None
        if m['tipo_mapa'] == 'funcionario':
            chave = chave_usuario(m['mapa_nome'], m['loja_id'])
            usuario_id = usuarios_remotos.get(chave)
            if not usuario_id:
                faltantes.add(chave)
        saida.append({**m, 'funcionario_id': usuario_id, 'produto_id': None})
    if faltantes:
        lojas = ', '.join(sorted({loja for _, loja in faltantes}))
        raise RuntimeError(
            f'PRÉ-VALIDAÇÃO: {len(faltantes)} funcionário(s) referenciados pelos mapas '
            f'ainda não existem no Supabase (lojas: {lojas}). '
            'Execute o workflow com etapa=importar, escopo=usuarios, '
            'confirmar_gravacao=true e pular_usuarios=false. '
            'Depois execute escopo=operacionais. Não apague os produtos já importados.'
        )
    return saida


def send_rows(table, records, *, url, key, conflict=None, size=250):
    total = 0
    for group in batch(records, size):
        api(table, group, conflict=conflict, url=url, key=key)
        total += len(group)
        print(f'  {table}: {total}/{len(records)}', flush=True)


def catalogo(db_path):
    with sqlite3.connect(str(db_path)) as con:
        for ean, code, desc, secao in con.execute('SELECT ean, codigo_interno, descricao, secao FROM produtos'):
            yield {'ean': str(ean or '').strip(), 'codigo_interno': str(code or '').strip() or None,
                   'descricao': str(desc or '').strip(), 'secao': str(secao or '').strip()}


def main():
    p = argparse.ArgumentParser(description='Migração segura e reexecutável Supabase (inicia em modo seco).')
    p.add_argument('--apply', action='store_true', help='Envia dados; exige variáveis de ambiente com credenciais')
    p.add_argument('--only', choices=['todos','usuarios','produtos','operacionais','mapas','vencidos','queima','auditoria'], default='todos')
    p.add_argument('--catalogo', default=str(DATA / 'produtos_ean.db'))
    p.add_argument('--sem-usuarios', action='store_true', help='Não recria nem reinsere contas e PINs')
    args = p.parse_args()
    url = os.environ.get('SUPABASE_URL','').strip()
    key = (os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
    print('VERSAO IMPORTADOR: FK-USUARIOS-2026-11-09-R2', flush=True)
    print('MODO:', 'ENVIO REAL para Supabase' if args.apply else 'VALIDAÇÃO OFFLINE — nenhuma alteração')
    required=['usuarios_sem_senhas.csv','mapa_lancamentos.csv','vencidos.csv','queima.csv','auditoria.csv']
    for name in required:
        if not (DATA/name).is_file(): sys.exit('Arquivo ausente: '+str(DATA/name))
    users=read_csv('usuarios_sem_senhas.csv')
    maps=read_csv('mapa_lancamentos.csv')
    venc=read_csv('vencidos.csv')
    q=read_csv('queima.csv')
    hist=read_csv('auditoria.csv')
    products = list(catalogo(args.catalogo)) if args.only in ('todos','produtos') else []
    valid_products = [x for x in products if 8<=len(x['ean'])<=14 and x['ean'].isdigit()]
    skipped_products = [x for x in products if not (8<=len(x['ean'])<=14 and x['ean'].isdigit())]
    # Validação antes de qualquer escrita: nunca criar loja com identificador MANUAL_*.
    invalid_users = [u for u in users if (not loja_valida(u.get('loja_id'))
                     and not (u.get('perfil') == 'geral' and not u.get('loja_id')))]
    if invalid_users:
        sys.exit(f'Abortado: {len(invalid_users)} usuário(s) possuem código de loja inválido. '
                 'Corrija o CSV privado antes de executar a importação.')
    invalid_maps = [(m, motivo_mapa_invalido(m)) for m in maps]
    valid_maps = [m for m, motivo in invalid_maps if motivo is None]
    pending_maps = [pendencia(m, 'mapa_lancamentos', motivo)
                    for m, motivo in invalid_maps if motivo is not None]
    valid_venc = [r for r in venc if loja_valida(r.get('loja_id'))]
    pending_venc = [pendencia(r, 'vencidos', 'Código de loja inválido; '
                            'verifique as duas colunas LojaOrigem da planilha original')
                    for r in venc if not loja_valida(r.get('loja_id'))]
    valid_queima = [r for r in q if loja_valida(r.get('loja_id'))]
    pending_queima = [pendencia(r, 'queima', 'Código de loja inválido')
                      for r in q if not loja_valida(r.get('loja_id'))]
    if pending_maps or pending_venc or pending_queima:
        print(f'ATENÇÃO: {len(pending_maps)} mapas, {len(pending_venc)} vencidos e '
              f'{len(pending_queima)} registros de queima serão preservados em '
              'migracao_pendencias (sem associação indevida a uma loja).', flush=True)
    print(json.dumps({'usuarios':len(users),'produtos_validos':len(valid_products),
                      'produtos_cadastro_revisar':len(skipped_products),
                      'mapas_para_importar':len(valid_maps),
                      'mapas_revisar':len(pending_maps),
                      'vencidos_para_importar':len(valid_venc),
                      'vencidos_revisar':len(pending_venc),
                      'queima_para_importar':len(valid_queima),
                      'queima_revisar':len(pending_queima),
                      'historico':len(hist),
                      'transferencias_para_revisar':len(read_csv('transferencias_REVISAR.csv'))},
                     ensure_ascii=False, indent=2))
    if not args.apply:
        return
    if not url.startswith('https://') or not key or key.startswith('sb_secret_COLE'):
        sys.exit('Defina SUPABASE_URL e SUPABASE_SECRET_KEY no terminal antes de --apply.')
    import_users = args.only in ('todos','usuarios') and not args.sem_usuarios
    if import_users and not os.environ.get('MIGRATION_PIN_SEED', '').strip():
        sys.exit('Defina MIGRATION_PIN_SEED (segredo longo e estável) para garantir PINs iguais em reexecuções.')
    # Ler primeiro a identidade real dos usuários no banco. Pode haver importações
    # anteriores parciais; não sobrescrever PINs nem recriar contas existentes.
    usuarios_remotos = usuarios_no_banco(url=url, key=key)
    novos_usuarios = [u for u in users if chave_usuario(u['nome'], u['loja_id']) not in usuarios_remotos] if import_users else []
    if args.only in ('todos', 'operacionais', 'mapas') and not import_users:
        # Verifica as FK ANTES de reenviar milhares de registros de catálogo.
        vincular_funcionarios(valid_maps, usuarios_remotos)
    if novos_usuarios:
        pins=[]
        for u in novos_usuarios:
            ident=(norm(u['nome']) + '/' + u['loja_id']).encode('utf-8')
            digest=hmac.new(os.environ['MIGRATION_PIN_SEED'].encode('utf-8'), ident, hashlib.sha256).digest()
            pin=str(int.from_bytes(digest, 'big') % (10**10)).zfill(10)
            pins.append({'nome':u['nome'],'loja':u['loja_id'], 'pin': pin})
        # Gera PINs SOMENTE para contas novas; um PIN calculado para uma conta já
        # existente poderia ser diferente do PIN realmente registrado no banco.
        pin_file=DATA/'novos_pins_gerados.csv'
        with pin_file.open('w', encoding='utf-8', newline='') as f:
            w=csv.DictWriter(f,fieldnames=['nome','loja','pin']);w.writeheader();w.writerows(pins)
        try:os.chmod(pin_file,0o600)
        except OSError:pass
        print(f'PINs provisórios preparados para {len(novos_usuarios)} conta(s) nova(s).', flush=True)
    pins = {(norm(x['nome']), x['loja']): x['pin'] for x in read_csv('novos_pins_gerados.csv')} if novos_usuarios else {}
    stores={u['loja_id'] for u in users if loja_valida(u.get('loja_id'))}
    stores |= {m['loja_id'] for m in valid_maps}
    stores |= {r['loja_id'] for r in valid_venc}
    stores |= {r['loja_id'] for r in valid_queima}
    send_rows('lojas',[{'id':s,'nome':f'Loja {s}'} for s in sorted(stores)],url=url,key=key,conflict='id')
    if import_users:
        built=[]
        for u in novos_usuarios:
            pin = pins[chave_usuario(u['nome'],u['loja_id'])]
            built.append({'id':uid(u['nome'],u['loja_id']), 'nome':u['nome'], 'nome_normalizado':norm(u['nome']),
                          'loja_id':u['loja_id'] or None, 'perfil':u['perfil'], 'ativo':u['ativo'].lower()=='true',
                          'celular_proprio':u['celular_proprio'].lower()=='true','especial':False,'pin_hash':pin_hash(pin)})
        if built:
            send_rows('usuarios', built, url=url, key=key, conflict='id')
        else:
            print('  usuarios: todas as contas já existem; PINs existentes preservados.', flush=True)
        usuarios_remotos = usuarios_no_banco(url=url, key=key)
        if len([u for u in users if chave_usuario(u['nome'],u['loja_id']) not in usuarios_remotos]):
            raise RuntimeError('Falha ao conferir contas criadas; importação interrompida antes dos mapas.')
    if args.only in ('todos', 'operacionais', 'mapas'):
        mapas_vinculados = vincular_funcionarios(valid_maps, usuarios_remotos)
    if args.only in ('todos','produtos'):
        send_rows('produtos',valid_products,url=url,key=key,conflict='ean',size=250)
        send_rows('catalogo_pendencias',[{'codigo_original':x['ean'],'codigo_interno':x['codigo_interno'],
                   'descricao':x['descricao'],'secao':x['secao']} for x in skipped_products],
                   url=url,key=key,conflict='codigo_original',size=250)
    if args.only in ('todos','operacionais','mapas'):
        send_rows('mapa_lancamentos',mapas_vinculados,url=url,key=key,conflict='origem_migracao')
        send_rows('migracao_pendencias',pending_maps,url=url,key=key,conflict='origem_migracao')
    if args.only in ('todos','operacionais','vencidos'):
        built=[]
        for r in valid_venc:
            built.append({'loja_id':r['loja_id'],'ean':None,'codigo_interno':r['codigo_interno'] or None,
                          'descricao_original':r['descricao_original'],'mapa_origem':r['mapa_origem'],
                          'linha_original':r['linha_original'],'lote':r['lote'] or None,
                          'validade':r['validade'] or None,'quantidade':int(r['quantidade'] or 0),
                          'criado_em':r['criado_em'] or None,'origem_migracao':r['origem_migracao']})
        send_rows('vencidos',built,url=url,key=key,conflict='origem_migracao')
        send_rows('migracao_pendencias',pending_venc,url=url,key=key,conflict='origem_migracao')
    if args.only in ('todos','operacionais','queima'):
        built=[]
        for r in valid_queima:
            built.append({'loja_id':r['loja_id'],'ean':r['ean'],'lote':r['lote'] or None,
                          'validade':r['validade'] or None,'quantidade':int(r['quantidade']),
                          'estado':r['estado'],'origem_mapa':r['origem_mapa'],
                          'criado_em':r['criado_em'],'origem_migracao':r['origem_migracao']})
        send_rows('queima',built,url=url,key=key,conflict='origem_migracao')
        send_rows('migracao_pendencias',pending_queima,url=url,key=key,conflict='origem_migracao')
    if args.only in ('todos','operacionais','auditoria'):
        built=[]
        for r in hist:
            built.append({'loja_id':r['loja_id'],'acao':r['acao'],'criado_em':r['criado_em'],
                          'dados':{'origem':'Google Sheets','autor_original':r['usuario_original'],
                          'perfil_original':r['perfil_original'],'descricao':r['descricao_original'],
                          'referencia':r['referencia_original'],'login_id_original':r['login_id_original']}})
        # Garante idempotência mesmo em reexecuções do Actions.
        for pos, item in enumerate(built, 1):
            item['origem_migracao'] = 'sheets:audit:' + str(pos)
        send_rows('auditoria',built,url=url,key=key,conflict='origem_migracao')
    print('Concluído. Execute supabase/002_apos_importacao.sql no SQL Editor e valide contagens antes de redirecionar GitHub Pages.')

if __name__=='__main__':
    main()
