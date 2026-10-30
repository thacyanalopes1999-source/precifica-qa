"""Regressões V11.1 focadas nos falsos REVISAR detectados no catálogo DPSP.
Execute na raiz do projeto Precifica QA: python3 -m unittest discover -s tests -p 'test_cruzamento_1a1_v11_1.py' -v
"""
import csv
import io
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from app.main import app
from app.services.crossing_v11 import _med_features, repair_text

EAN1='7897230304779'
EAN2='7894900011517'

def dataset(rows):
    b=io.StringIO()
    w=csv.writer(b);w.writerow(['Descrição','EAN'])
    w.writerows(rows)
    return b.getvalue().encode('utf-8')

def cruzar(a,b,modo='cruzamento_1a1'):
    response=TestClient(app).post('/compare',files={
        'file_a':('a.csv',dataset(a),'text/csv'),
        'file_b':('b.csv',dataset(b),'text/csv')},
        data={'col_a':'Descrição','col_b':'Descrição','modo':modo})
    if response.status_code!=200:raise AssertionError(response.text[:2000])
    return response.json()['resultados'][0]

class TestCruzamentoV111(unittest.TestCase):
    def check(self,a,b,status,ean_a=EAN1,ean_b=EAN1):
        out=cruzar([(a,ean_a)],[(b,ean_b)])
        self.assertEqual(out['classificacao'],status,f"{a} | {b} => {out}")
        return out

    def test_01_acido_tranexamico_mojibake_controle(self):
        self.assertIn('Ácido',repair_text('Ã\x81cido'))
        self.check('Ã\x81cido TranexÃ¢mico 250mg GenÃ©rico EMS 12 Comprimidos',
                   'Ácido Tranexâmico 250mg 12 comprimidos EMS Genérico','MATCH_SUGERIDO')

    def test_02_cloridrato_facultativo_mesma_dose_lab(self):
        self.check('Metformina 850mg Genérico Prati 30 Comprimidos',
                   'Cloridrato de Metformina 850mg 30 comprimidos Prati Donaduzzi Genérico','MATCH_SUGERIDO')

    def test_03_nome_e_unidades_grudados(self):
        self.check('Omeprazol 20mg Genérico Cimed 56 Cápsulas',
                   'Omeprazol20mg56cápsulasCimedGenérico','MATCH_SUGERIDO')

    def test_04_nome_repetido_sem_dosagem_extra(self):
        self.check('Lamotrigina 100mg Genérico Medley 30 comprimidos - Lamotrigina 100mg Genérico Medley 30 comprimidos',
                   'Lamotrigina 100mg 30 comprimidos Medley Genérico','MATCH_SUGERIDO')

    def test_05_troca_250mg_5ml_50mg_ml(self):
        self.check('Cefalexina 50mg/ml Genérico União Química 100ml Suspensão Oral',
                   'Cefalexina 250mg/5ml Pó para Suspensão Oral 100ml União Química Genérico','MATCH_SUGERIDO')

    def test_06_grafia_cefadroxila(self):
        self.check('Cefadroxila 250mg/5ml Genérico Eurofarma 100ml Suspensão',
                   'Cefadroxil 250mg/5ml Pó para Suspensão Oral 100ml Eurofarma Genérico','MATCH_SUGERIDO')

    def test_07_sais_explicitos_diferentes_ficam_revisar(self):
        self.check('Diclofenaco Potássico 50mg Genérico Medley 20 Comprimidos',
                   'Diclofenaco Sódico 50mg 20 comprimidos Medley Genérico','REVISAR')

    def test_08_dosagens_diferentes_ficam_revisar(self):
        self.check('Dipropionato Betametasona 5mg/g Genérico EMS 30g',
                   'Dipropionato Betametasona 0,5mg/g Genérico EMS 30g','REVISAR')

    def test_09_quantidades_diferentes_ficam_revisar(self):
        self.check('Cilostazol 100mg Eurofarma 60 Comprimidos',
                   'Cilostazol 100mg Eurofarma 30 comprimidos','REVISAR')

    def test_10_fabricantes_diferentes_ficam_revisar(self):
        self.check('Lisinopril 5mg Medley 30 Comprimidos',
                   'Lisinopril 5mg Germed 30 Comprimidos','REVISAR')

    def test_11_ean_divergente_nao_libera_match(self):
        out=self.check('Desonida 0,5mg/g Germed 30g Pomada',
                   'Desonida 0,5mg/g Pomada 30g Germed Genérico','REVISAR',EAN1,EAN2)
        self.assertIn('EAN',out['motivo'])

    def test_12_principio_ativo_diferente_ean_mesmo(self):
        self.check('Lisinopril 5mg Genérico EMS 30 Comprimidos',
                   'Piroxicam 5mg Genérico EMS 30 Comprimidos','REVISAR')

    def test_13_associa_dose_a_cada_ingrediente(self):
        self.check('Amoxicilina 875mg + Clavulanato 125mg EMS 14 Comprimidos',
                   'Amoxicilina 125mg + Clavulanato 875mg EMS 14 Comprimidos','REVISAR')

    def test_14_grupo_sais_hidratados_nao_mascaram_dose(self):
        self.check('Amoxicilina 875mg + Clavulanato de Potássio 125mg Eurofarma 14 Comprimidos',
                   'Amoxicilina Tri-Hidratada 875mg + Clavulanato de Potássio 125mg Eurofarma 14 comprimidos','MATCH_SUGERIDO')

    def test_15_concentracao_nao_equivalente(self):
        self.check('Aciclovir 50mg/g Medley 10g Creme',
                   'Aciclovir 50mg Medley 10g Creme','REVISAR')

    def test_16_converte_ui_milhar(self):
        a=_med_features('Nistatina 100.000UI/ml Prati 50ml Suspensão Oral')
        b=_med_features('Nistatina 100000UI/ml Prati 50ml Suspensão Oral')
        self.assertEqual(a['strength'],b['strength'])
        self.assertEqual(a['strength'],((100000.0,'ui','ml'),))

    def test_17_um_para_um_sem_duplicatas(self):
        a=[('Omeprazol 20mg EMS 30 Cápsulas',EAN1)]*2
        b=[('Omeprazol 20mg EMS 30 Cápsulas',EAN1)]
        response=TestClient(app).post('/compare',files={
            'file_a':('a.csv',dataset(a),'text/csv'),
            'file_b':('b.csv',dataset(b),'text/csv')},
            data={'col_a':'Descrição','col_b':'Descrição','modo':'cruzamento_1a1'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(sum(x['linha_b'] is not None for x in response.json()['resultados']),1)

    def test_18_linha_a_linha_preservada(self):
        a='Dipropionato Betametasona 5mg/g Genérico EMS 30g'
        b='Dipropionato Betametasona 0,5mg/g Genérico EMS 30g'
        result=cruzar([(a,EAN1)],[(b,EAN1)],modo='linha_a_linha')
        self.assertEqual(result['linha_b'],2)

if __name__=='__main__':unittest.main(verbosity=2)
