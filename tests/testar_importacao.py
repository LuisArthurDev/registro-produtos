"""Testes de regressão para lojas e lotes históricos, sem rede ou dados privados."""
import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'importar_dados.py'
spec = importlib.util.spec_from_file_location('registro_importador', MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ImportacaoRegressaoTests(unittest.TestCase):
    def test_loja_numerica_permitida(self):
        self.assertTrue(mod.loja_valida('151'))
        self.assertTrue(mod.loja_valida('000151'))
        self.assertFalse(mod.loja_valida('MANUAL_123'))
        self.assertFalse(mod.loja_valida(''))
        self.assertFalse(mod.loja_valida('15A'))
        self.assertFalse(mod.loja_valida('1234567890123'))

    def test_codigo_manual_nao_pode_virar_loja(self):
        row = {'loja_id': 'MANUAL_abcdef', 'ean': '7891234567890',
               'lote':'ABC123', 'quantidade':'3', 'origem_migracao':'m:2'}
        motivo = mod.motivo_mapa_invalido(row)
        self.assertIn('loja', motivo.lower())
        pendente = mod.pendencia(row, 'mapa_lancamentos', motivo)
        self.assertEqual(pendente['dados']['loja_id'], 'MANUAL_abcdef')
        self.assertEqual(pendente['origem_migracao'],'m:2')

    def test_lote_excessivo_preservado_em_pendencias(self):
        row = {'loja_id':'151','ean':'7891234567890','lote':'1'*257,
               'quantidade':'4','origem_migracao':'m:1'}
        motivo = mod.motivo_mapa_invalido(row)
        self.assertIn('100',motivo)
        pendente = mod.pendencia(row, 'mapa_lancamentos', motivo)
        self.assertEqual(pendente['dados']['lote'],'1'*257)

    def test_ean_com_zero_inicial_preservado(self):
        row={'loja_id':'151', 'ean':'0123456789012', 'lote':'AB12',
             'quantidade':'1'}
        self.assertIsNone(mod.motivo_mapa_invalido(row))
        self.assertTrue(mod.ean_valido(row['ean']))

    def test_quantidade_nao_numerica_vai_para_revisao(self):
        row={'loja_id':'151', 'ean':'7891234567890', 'lote':'AB12',
             'quantidade':'N/A'}
        self.assertIn('numérica',mod.motivo_mapa_invalido(row))


if __name__=='__main__':
    unittest.main()
