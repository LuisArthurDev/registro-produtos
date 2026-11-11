import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from atualizar_grupos_ods import preparar

class GrupoOdsTest(unittest.TestCase):
 def test_validacao_por_identificadores_estritos(self):
  linhas=[['EAN','Produto','Grupo'],['07898962711477','97362','ALIMENTICIO'],['7891234567890','123','LIMPEZA']]
  itens,ignorados,r=preparar(linhas)
  self.assertEqual(itens[0]['ean'],'07898962711477');self.assertEqual(r['aprovadas'],2);self.assertEqual(ignorados,[])
 def test_conflitos_nao_atualizam_produtos(self):
  linhas=[['Produto','EAN','Grupo'],['97362','07898962711477','ALIMENTICIO'],['97362','07898962711477','CONVENIENCIA']]
  itens,ignorados,resumo=preparar(linhas)
  self.assertEqual(itens,[]);self.assertEqual(resumo['conflitos'],1);self.assertTrue(ignorados)
 def test_ean_ausente_ou_grupo_vazio_e_ignorado(self):
  linhas=[['Produto','EAN','Grupo'],['97362','','ALIMENTICIO'],['97364','07891234567890','']]
  itens,ignorados,resumo=preparar(linhas)
  self.assertEqual(itens,[]);self.assertEqual(resumo['ignoradas'],2)

if __name__=='__main__':unittest.main()
