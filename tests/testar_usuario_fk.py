"""Regressões: mapas devem referenciar usuários existentes no Supabase."""
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

MODULE_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'importar_dados.py'
spec = importlib.util.spec_from_file_location('importador_fk', MODULE_PATH)
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


class FakeResponse:
    def __init__(self, dados):
        self.dados = json.dumps(dados).encode('utf-8')
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return False
    def read(self):
        return self.dados


class VinculoUsuarioTests(unittest.TestCase):
    def setUp(self):
        self.mapas = [
            {'mapa_nome':'Altino','loja_id':'151','tipo_mapa':'funcionario',
             'ean':'0123456789012','origem_migracao':'teste:1'},
            {'mapa_nome':'Estoque','loja_id':'151','tipo_mapa':'Estoque',
             'ean':'7891234567890','origem_migracao':'teste:2'},
        ]

    def test_id_real_pode_ser_diferente_do_uuid5(self):
        id_real = '9d8f4e21-2222-4555-8888-333333333333'
        out = imp.vincular_funcionarios(self.mapas, {('altino','151'): id_real})
        self.assertEqual(out[0]['funcionario_id'], id_real)
        self.assertNotEqual(id_real, imp.uid('Altino','151'))
        self.assertIsNone(out[1]['funcionario_id'])
        self.assertEqual(out[0]['ean'], '0123456789012')
        self.assertEqual(out[0]['origem_migracao'], 'teste:1')

    def test_ausencia_de_conta_interrompe_antes_de_criar_mapas(self):
        with self.assertRaisesRegex(RuntimeError, 'escopo=usuarios'):
            imp.vincular_funcionarios(self.mapas, {})

    def test_normalizacao_de_acento_e_loja(self):
        out = imp.vincular_funcionarios(
            [{'mapa_nome':'Ana Carolina','loja_id':'151','tipo_mapa':'funcionario'}],
            {('ana carolina','151'): 'id-existente'})
        self.assertEqual(out[0]['funcionario_id'], 'id-existente')
        self.assertEqual(imp.chave_usuario('Lívia','151'),('livia','151'))

    def test_consulta_paginada_usa_ids_atuais(self):
        total = [
            {'id':f'id-{i}','nome_normalizado':f'usuario {i}','loja_id':'151'}
            for i in range(1002)
        ]
        chamadas=[]
        def fake(req, timeout):
            parsed=urlparse(req.full_url)
            assert parsed.path.endswith('/usuarios'), parsed
            args=parse_qs(parsed.query)
            offset=int(args['offset'][0]); size=int(args['limit'][0])
            chamadas.append(offset)
            return FakeResponse(total[offset:offset+size])
        with patch.object(imp.urllib.request, 'urlopen', side_effect=fake):
            result=imp.usuarios_no_banco(url='https://example.supabase.co',key='sb_secret_exemplo')
        self.assertEqual(len(result),1002)
        self.assertEqual(result[('usuario 1001','151')],'id-1001')
        self.assertEqual(chamadas,[0,1000])

    def test_usuarioss_com_mesmo_nome_em_lojas_diferentes(self):
        out=imp.vincular_funcionarios(
            [dict(mapa_nome='Joao',loja_id='151',tipo_mapa='funcionario'),
             dict(mapa_nome='Joao',loja_id='152',tipo_mapa='funcionario')],
            {('joao','151'):'id151',('joao','152'):'id152'})
        self.assertEqual([x['funcionario_id'] for x in out],['id151','id152'])


if __name__ == '__main__':
    unittest.main()
