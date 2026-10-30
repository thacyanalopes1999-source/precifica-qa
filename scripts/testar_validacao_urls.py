"""Regressões locais, sem chamar sites reais (de modo reproduzível)."""
import importlib
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
m = importlib.import_module("app.url_validator")

assert m.check_one("not-a-url")["status"] == "URL_INVALIDA"
for blocked in ["http://127.0.0.1", "http://192.168.0.1:8080", "http://169.254.169.254", "http://localhost", "file:///etc/passwd", "http://example.com:22"]:
    assert m.check_one(blocked)["status"] in {"DESTINO_BLOQUEADO", "URL_INVALIDA"}, blocked

calls = []
def fake_request(url, method="HEAD"):
    calls.append((url, method))
    if url == "https://exemplo.com/ok": return (200, "")
    if url == "https://exemplo.com/faltando": return (404, "")
    if url == "https://exemplo.com/redirect": return (301, "/ok")
    if url == "https://exemplo.com/bloqueado": return (403, "")
    if url == "https://exemplo.com/rede": return (302, "http://127.0.0.1/admin")
    if url == "https://exemplo.com/limite": return (429, "")
    return (500, "")

with patch.object(m, "one_request", fake_request):
    assert m.check_one("https://exemplo.com/ok")["status"] == "OK"
    assert m.check_one("https://exemplo.com/faltando")["status"] == "NAO_ENCONTRADA"
    assert m.check_one("https://exemplo.com/redirect")["status"] == "REDIRECIONADO"
    assert m.check_one("https://exemplo.com/bloqueado")["status"] == "BLOQUEADO"
    assert m.check_one("https://exemplo.com/rede")["status"] == "DESTINO_BLOQUEADO"
    assert m.check_one("https://exemplo.com/limite")["status"] == "LIMITE_ACESSO"
    assert ("https://exemplo.com/faltando", "GET") in calls

    from openpyxl import Workbook, load_workbook
    with tempfile.TemporaryDirectory() as t:
        d = Path(t)
        x = d / "entrada.xlsx"
        w = Workbook(); s = w.active
        s.append(["Descrição", "URL Monitorado", "Preço"])
        s.append(["Produto A", "https://exemplo.com/ok", "20,99"])
        s.append(["Produto B", "https://exemplo.com/faltando", "18,99"])
        s.append(["Produto C", "https://exemplo.com/redirect", "29,99"])
        s.append(["Produto D", "https://exemplo.com/bloqueado", "19,99"])
        s.append(["Produto E", "https://exemplo.com/ok", "21,99"])
        s.append(["=HYPERLINK(\"x\", \"h\")", "", "22,99"])
        w.save(x)
        header, preview, _ = m.get_header_preview(x)
        assert header == ["Descrição", "URL Monitorado", "Preço"]
        assert len(preview) == 5
        job = m.Job("teste", d, x, "URL Monitorado", "entrada.xlsx")
        m.process_job(job)
        assert job.state == "concluido", job.error
        assert job.total == 6 and job.processed == 6
        assert job.summary["OK"] == 2
        assert job.summary["NAO_ENCONTRADA"] == 1
        assert job.summary["REDIRECIONADO"] == 1
        assert job.summary["BLOQUEADO"] == 1
        assert job.summary["URL_INVALIDA"] == 1
        output = load_workbook(d / "validacao_urls.xlsx", read_only=True)
        assert output.sheetnames == ["BASE_COM_STATUS", "STATUS_URLS", "RESUMO"]
        assert sum(1 for _ in output["BASE_COM_STATUS"].iter_rows(values_only=True)) == 7
        assert output["BASE_COM_STATUS"]["A7"].value.startswith("'=")
        assert output["STATUS_URLS"]["D2"].value == "OK"
        output.close()

print("OK: validação de URL, SSRF, HTTP, redirects, Excel, duplicados, sanitização e exportação.")

# Teste de ponta a ponta das rotas (criação de job assíncrono, paginação e download).
from fastapi import FastAPI
from fastapi.testclient import TestClient
from io import BytesIO
import time
from openpyxl import Workbook
w = Workbook(); s = w.active
s.append(["URL", "Produto"])
s.append(["https://exemplo.com/ok", "Exemplo A"])
s.append(["https://exemplo.com/faltando", "Exemplo B"])
buf = BytesIO(); w.save(buf); buf.seek(0)
application = FastAPI()
application.include_router(m.router)
with patch.object(m, "one_request", fake_request):
    client = TestClient(application)
    p = client.post("/url-validator/preview", files={"file": ("teste.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert p.status_code == 200, p.text
    assert p.json()["coluna_sugerida"] == "URL"
    post = client.post("/url-validator/jobs", files={"file": ("teste.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, data={"coluna": "URL"})
    assert post.status_code == 200, post.text
    job_id = post.json()["id"]
    for _ in range(100):
        status_response = client.get(f"/url-validator/jobs/{job_id}")
        if status_response.json()["estado"] in ("erro", "concluido"):
            break
        time.sleep(0.025)
    assert status_response.json()["estado"] == "concluido", status_response.json()
    rows_response = client.get(f"/url-validator/jobs/{job_id}/rows", params={"pagina": 1, "limite": 10})
    assert rows_response.status_code == 200 and rows_response.json()["total"] == 2
    assert rows_response.json()["items"][1]["http"] == 404
    xlsx = client.get(f"/url-validator/jobs/{job_id}/download")
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
print("OK: endpoints FastAPI de prévia, job, progresso, paginação e download Excel.")
