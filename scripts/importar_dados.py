#!/usr/bin/env python3
"""Importação inicial de catálogo SQLite e CSVs da planilha para Supabase.

Requer apenas Python 3.10+ (biblioteca padrão). Sem chave -> validação offline.
Por padrão NÃO envia nada. Use --apply após backup e revisão dos CSVs.
As senhas antigas NÃO são reaproveitadas; gera PINs novos e privados.
No GitHub Actions, os PINs são derivados de MIGRATION_PIN_SEED e cifrados antes de sair do runner.
"""
import argparse, csv, hashlib, hmac, json, os, secrets, sqlite3, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'private_data'
SPECIAL = {'Estoque', 'Termolabil', 'Psicotropicos', 'Antibioticos'}


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
    p.add_argument('--only', choices=['todos','usuarios','produtos','mapas','vencidos','queima','auditoria'], default='todos')
    p.add_argument('--catalogo', default=str(DATA / 'produtos_ean.db'))
    p.add_argument('--sem-usuarios', action='store_true', help='Não recria nem reinsere contas e PINs')
    args = p.parse_args()
    url = os.environ.get('SUPABASE_URL','').strip()
    key = (os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
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
    valid_maps = [x for x in maps if 8<=len(x['ean'])<=14 and x['ean'].isdigit()]
    print(json.dumps({'usuarios':len(users),'produtos_validos':len(valid_products),
                      'produtos_cadastro_revisar':len(skipped_products),'mapas_validos':len(valid_maps),
                      'mapas_revisar':len(maps)-len(valid_maps),'vencidos':len(venc),
                      'queima':len(q),'historico':len(hist),
                      'transferencias_para_revisar':len(read_csv('transferencias_REVISAR.csv'))},ensure_ascii=False,indent=2))
    if not args.apply:
        return
    if not url.startswith('https://') or not key or key.startswith('sb_secret_COLE'):
        sys.exit('Defina SUPABASE_URL e SUPABASE_SECRET_KEY no terminal antes de --apply.')
    import_users = args.only in ('todos','usuarios') and not args.sem_usuarios
    if import_users and not os.environ.get('MIGRATION_PIN_SEED', '').strip():
        sys.exit('Defina MIGRATION_PIN_SEED (segredo longo e estável) para garantir PINs iguais em reexecuções.')
    if not (DATA/'novos_pins_gerados.csv').exists() and import_users:
        pins=[]
        for u in users:
            ident=(norm(u['nome']) + '/' + u['loja_id']).encode('utf-8')
            digest=hmac.new(os.environ['MIGRATION_PIN_SEED'].encode('utf-8'), ident, hashlib.sha256).digest()
            pin=str(int.from_bytes(digest, 'big') % (10**10)).zfill(10)
            pins.append({'nome':u['nome'],'loja':u['loja_id'], 'pin': pin})
        pin_file=DATA/'novos_pins_gerados.csv'
        with pin_file.open('w', encoding='utf-8', newline='') as f:
            w=csv.DictWriter(f,fieldnames=['nome','loja','pin']);w.writeheader();w.writerows(pins)
        try:os.chmod(pin_file,0o600)
        except OSError:pass
        print('ATENÇÃO: PINs novos criados em',pin_file,'— nunca publique esse arquivo.')
    pins={(norm(x['nome']),x['loja']):x['pin'] for x in read_csv('novos_pins_gerados.csv')} if import_users else {}
    stores={u['loja_id'] for u in users if u['loja_id']}|{m['loja_id'] for m in maps if m['loja_id']}
    stores |= {x['loja_id'] for x in venc if x['loja_id']}
    send_rows('lojas',[{'id':s,'nome':f'Loja {s}'} for s in sorted(stores)],url=url,key=key,conflict='id')
    if import_users:
        built=[]
        for u in users:
            pin = pins[(norm(u['nome']),u['loja_id'])]
            built.append({'id':uid(u['nome'],u['loja_id']), 'nome':u['nome'], 'nome_normalizado':norm(u['nome']),
                          'loja_id':u['loja_id'] or None, 'perfil':u['perfil'], 'ativo':u['ativo'].lower()=='true',
                          'celular_proprio':u['celular_proprio'].lower()=='true','especial':False,'pin_hash':pin_hash(pin)})
        send_rows('usuarios',built,url=url,key=key,conflict='id')
    if args.only in ('todos','produtos'):
        send_rows('produtos',valid_products,url=url,key=key,conflict='ean',size=250)
        send_rows('catalogo_pendencias',[{'codigo_original':x['ean'],'codigo_interno':x['codigo_interno'],
                   'descricao':x['descricao'],'secao':x['secao']} for x in skipped_products],
                   url=url,key=key,conflict='codigo_original',size=250)
    if args.only in ('todos','mapas'):
        built=[]
        for m in valid_maps:
            uid_value=uid(m['mapa_nome'],m['loja_id']) if m['tipo_mapa']=='funcionario' else None
            built.append({**m,'funcionario_id':uid_value,'produto_id':None})
        send_rows('mapa_lancamentos',built,url=url,key=key,conflict='origem_migracao')
        send_rows('migracao_pendencias',[{'origem_migracao':m['origem_migracao'],
                 'tabela_origem':'mapa_lancamentos','motivo':'EAN fora do padrão','dados':m}
                 for m in maps if m not in valid_maps],url=url,key=key,conflict='origem_migracao')
    if args.only in ('todos','vencidos'):
        built=[]
        for r in venc:
            built.append({'loja_id':r['loja_id'],'ean':None,'codigo_interno':r['codigo_interno'] or None,
                          'descricao_original':r['descricao_original'],'mapa_origem':r['mapa_origem'],
                          'linha_original':r['linha_original'],'lote':r['lote'] or None,
                          'validade':r['validade'] or None,'quantidade':int(r['quantidade'] or 0),
                          'criado_em':r['criado_em'] or None,'origem_migracao':r['origem_migracao']})
        send_rows('vencidos',built,url=url,key=key,conflict='origem_migracao')
    if args.only in ('todos','queima'):
        built=[]
        for r in q:
            built.append({'loja_id':r['loja_id'],'ean':r['ean'],'lote':r['lote'] or None,
                          'validade':r['validade'] or None,'quantidade':int(r['quantidade']),
                          'estado':r['estado'],'origem_mapa':r['origem_mapa'],
                          'criado_em':r['criado_em'],'origem_migracao':r['origem_migracao']})
        send_rows('queima',built,url=url,key=key,conflict='origem_migracao')
    if args.only in ('todos','auditoria'):
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
