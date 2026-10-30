"""Precifica QA - verificação de URLs via upload de planilha.
Router independente do motor de comparação. Padrão: apenas destinos públicos,
resolução DNS validada e conexão fixada no IP aprovado (mitigação de SSRF/rebinding).
"""
from __future__ import annotations

import csv
import http.client
import ipaddress
import os
import re
import shutil
import socket
import sqlite3
import ssl
import tempfile
import threading
import time
import uuid
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

router = APIRouter(prefix="/url-validator", tags=["Validação de URLs"])
ALLOWED_EXT = {".xlsx", ".csv", ".tsv"}
MAX_FILE_BYTES = int(os.environ.get("URL_CHECK_MAX_FILE_MB", "50")) * 1024 * 1024
MAX_ROWS = min(100000, max(100, int(os.environ.get("URL_CHECK_MAX_ROWS", "50000"))))
WORKERS = min(12, max(1, int(os.environ.get("URL_CHECK_WORKERS", "6"))))
TIMEOUT = min(30.0, max(2.0, float(os.environ.get("URL_CHECK_TIMEOUT", "9"))))
JOB_TTL = 6 * 3600
ALLOWED_PORTS = {80, 443, 8080, 8443}
JOBS: dict[str, "Job"] = {}
JOB_LOCK = threading.RLock()
HOST_SEMAPHORES: dict[str, threading.Semaphore] = {}
HOST_LOCK = threading.Lock()


@dataclass
class Job:
    id: str
    directory: Path
    source: Path
    column: str
    name: str
    created: float = field(default_factory=time.time)
    state: str = "na_fila"
    total: int = 0
    processed: int = 0
    summary: Counter = field(default_factory=Counter)
    error: str = ""
    cancel: bool = False
    lock: threading.RLock = field(default_factory=threading.RLock)

    def data(self) -> dict:
        with self.lock:
            return {"id": self.id, "arquivo": self.name, "coluna": self.column,
                    "estado": self.state, "total": self.total, "processadas": self.processed,
                    "resumo": dict(self.summary), "erro": self.error,
                    "pronto": self.state == "concluido"}


def cleanup() -> None:
    now = time.time()
    with JOB_LOCK:
        old = [k for k, j in JOBS.items() if now - j.created > JOB_TTL
               and j.state not in {"rodando", "na_fila"}]
        for key in old:
            j = JOBS.pop(key)
            shutil.rmtree(j.directory, ignore_errors=True)


def safe_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", Path(name).name)[:130] or "planilha.xlsx"


def size_and_extension(file: UploadFile) -> str:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Use planilha .xlsx, .csv ou .tsv")
    return ext


def reject_spreadsheet_bomb(path: Path) -> None:
    if path.suffix != ".xlsx":
        return
    try:
        with zipfile.ZipFile(path) as archive:
            total = sum(x.file_size for x in archive.infolist())
            if total > 350 * 1024 * 1024:
                raise HTTPException(413, "Excel com conteúdo descompactado acima de 350 MB")
    except zipfile.BadZipFile:
        raise HTTPException(400, "Arquivo XLSX inválido")


def csv_options(path: Path) -> tuple[str, str]:
    with path.open("rb") as f:
        initial = f.read(16384)
    enc = "utf-8-sig"
    try:
        initial.decode(enc)
    except UnicodeDecodeError:
        enc = "cp1252"
    sample = initial.decode(enc, "replace")
    delimiter = "\t" if path.suffix == ".tsv" else ";"
    if path.suffix == ".csv":
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
        except csv.Error:
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
    return enc, delimiter


def table_rows(path: Path):
    if path.suffix == ".xlsx":
        book = load_workbook(path, read_only=True, data_only=False)
        try:
            sheet = book.worksheets[0]
            rows = sheet.iter_rows(values_only=True)
            try:
                header = [str(v).strip() if v is not None else "" for v in next(rows)]
            except StopIteration:
                raise ValueError("A planilha está vazia")
            if not any(header):
                raise ValueError("A primeira linha precisa conter os nomes das colunas")
            yield header, rows
        finally:
            book.close()
    else:
        encoding, delimiter = csv_options(path)
        f = path.open("r", encoding=encoding, errors="replace", newline="")
        try:
            reader = csv.reader(f, delimiter=delimiter)
            try:
                header = [str(v).strip() for v in next(reader)]
            except StopIteration:
                raise ValueError("CSV vazio")
            yield header, reader
        finally:
            f.close()


def get_header_preview(path: Path) -> tuple[list[str], list[dict], int | None]:
    for header, rows in table_rows(path):
        if len(header) > 250 or not any(header) or len(set(header)) != len(header):
            raise ValueError("Cabeçalhos duplicados/vazios ou mais de 250 colunas")
        preview = []
        for row in rows:
            if len(preview) >= 5:
                break
            if any(v is not None and str(v).strip() for v in row):
                preview.append({c: str(row[i])[:250] if i < len(row) and row[i] is not None else "" for i, c in enumerate(header)})
        return header, preview, None
    raise ValueError("Não foi possível ler o arquivo")


def save_upload(file: UploadFile, path: Path) -> None:
    count = 0
    with path.open("wb") as out:
        while True:
            block = file.file.read(1024 * 1024)
            if not block:
                break
            count += len(block)
            if count > MAX_FILE_BYTES:
                raise HTTPException(413, f"Limite de arquivo: {MAX_FILE_BYTES // (1024 * 1024)} MB")
            out.write(block)
    if count == 0:
        raise HTTPException(400, "Arquivo vazio")
    reject_spreadsheet_bomb(path)


def safe_url(raw: str) -> tuple[str, str, int, str]:
    value = str(raw or "").strip().strip("\ufeff")
    if not value:
        raise ValueError("URL vazia")
    if len(value) > 2048 or any(ord(ch) < 33 for ch in value) or "\\" in value:
        raise ValueError("URL contém caracteres inválidos")
    if not value.lower().startswith(("http://", "https://")):
        # Não adivinhar esquemas, pois URL malformada não deve ganhar status OK.
        raise ValueError("Informe o endereço completo começando com http:// ou https://")
    parts = urlsplit(value)
    if parts.scheme.lower() not in {"https", "http"} or not parts.hostname or parts.username or parts.password:
        raise ValueError("Esquema, host ou credenciais inválidas")
    host = parts.hostname.encode("idna").decode("ascii").lower().rstrip(".")
    if host in {"localhost", "metadata.google.internal"} or host.endswith((".local", ".localhost", ".internal", ".lan", ".test")):
        raise PermissionError("Endereço interno bloqueado")
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not addr.is_global:
            raise PermissionError("Endereço IP privado ou reservado bloqueado")
    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise PermissionError("Porta não autorizada")
    # http.client envia o request-target como ASCII: codifique Unicode em UTF-8/%XX.
    # Preserve os escapes percentuais ja presentes para nao duplicar codificacao.
    path = quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~")
    if parts.query:
        path += "?" + quote(parts.query, safe="/?:@!$&'()*+,;=%-._~")
    return value, host, port, path


def public_ip(host: str, port: int) -> str:
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as ex:
        raise OSError(f"DNS não resolveu o domínio: {ex}") from ex
    ips = list(dict.fromkeys(info[4][0] for info in addresses))
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise PermissionError("Destino privado, reservado ou misto bloqueado")
    return ips[0]


class PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, ip, port, timeout):
        self.pinned_ip = ip
        super().__init__(host, port=port, timeout=timeout)

    def connect(self):
        self.sock = socket.create_connection((self.pinned_ip, self.port), self.timeout)


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, ip, port, timeout):
        self.pinned_ip = ip
        super().__init__(host, port=port, timeout=timeout, context=ssl.create_default_context())

    def connect(self):
        raw = socket.create_connection((self.pinned_ip, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def one_request(url: str, method: str = "HEAD") -> tuple[int, str]:
    _, host, port, path = safe_url(url)
    ip = public_ip(host, port)
    c = (PinnedHTTPS if urlsplit(url).scheme.lower() == "https" else PinnedHTTP)(host, ip, port, TIMEOUT)
    try:
        headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                                 "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                   "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                   "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                   "Connection": "close"}
        if method == "GET":
            headers["Range"] = "bytes=0-1023"
        c.request(method, path, headers=headers)
        resp = c.getresponse()
        code = resp.status
        loc = resp.getheader("Location") or ""
        # Não baixar o corpo: apenas verificar resposta HTTP.
        resp.close()
        return code, loc
    finally:
        c.close()


def classify_code(code: int, redirects: int) -> tuple[str, bool, str]:
    if 200 <= code < 300:
        if redirects:
            return "REDIRECIONADO", True, f"Acessível após {redirects} redirecionamento(s), HTTP {code}"
        return "OK", True, f"Página acessível, HTTP {code}"
    mapping = {400: ("REQUISICAO_INVALIDA", False, "HTTP 400 — requisição rejeitada"),
               401: ("ACESSO_RESTRITO", False, "HTTP 401 — autenticação necessária"),
               403: ("BLOQUEADO", False, "HTTP 403 — acesso bloqueado (pode ser anti-bot)"),
               404: ("NAO_ENCONTRADA", False, "HTTP 404 retornado pelo site; confirme no navegador (pode variar conforme anti-bot)"),
               410: ("REMOVIDA", False, "HTTP 410 — página removida"),
               429: ("LIMITE_ACESSO", False, "HTTP 429 — limite de solicitações"),
               500: ("ERRO_SERVIDOR", False, "HTTP 500 — erro interno")}
    if code in mapping:
        return mapping[code]
    if 500 <= code <= 599:
        return "ERRO_SERVIDOR", False, f"HTTP {code} — servidor indisponível/erro"
    if 300 <= code <= 399:
        return "REDIRECIONAMENTO_PENDENTE", False, f"HTTP {code} — redirecionamento sem destino utilizável"
    return "ERRO_HTTP", False, f"HTTP {code}"


def check_one(raw: str) -> dict:
    start = time.monotonic()
    final, code, redirects = str(raw or "").strip(), None, 0
    try:
        safe_url(final)
        visited: set[str] = set()
        while True:
            if final in visited or redirects > 5:
                return make_result("LOOP_REDIRECIONAMENTO", False, code, final, "Ciclo ou excesso de redirecionamentos", start, redirects)
            visited.add(final)
            host = urlsplit(final).hostname or ""
            with HOST_LOCK:
                sem = HOST_SEMAPHORES.setdefault(host, threading.Semaphore(2))
                if len(HOST_SEMAPHORES) > 4000:
                    HOST_SEMAPHORES.clear()
            with sem:
                code, location = one_request(final, "HEAD")
                # Alguns sites não suportam HEAD ou rejeitam HEAD, mas servem GET.
                if code in {403, 404, 405, 501}:
                    code, location = one_request(final, "GET")
            if code in {301, 302, 303, 307, 308} and location:
                final = urljoin(final, location)
                # Validado novamente antes de resolver/abrir qualquer socket.
                safe_url(final)
                redirects += 1
                continue
            status, access, motivo = classify_code(code, redirects)
            return make_result(status, access, code, final, motivo, start, redirects)
    except PermissionError as exc:
        return make_result("DESTINO_BLOQUEADO", False, code, final, str(exc), start, redirects)
    except UnicodeError as exc:
        return make_result("ERRO_CODIFICACAO", False, code, final,
                           f"Falha interna ao codificar URL: {str(exc)[:120]}", start, redirects)
    except ValueError as exc:
        return make_result("URL_INVALIDA", False, code, final, str(exc), start, redirects)
    except (TimeoutError, socket.timeout) as exc:
        return make_result("TIMEOUT", False, code, final, "Tempo esgotado para a verificação", start, redirects)
    except ssl.SSLError as exc:
        return make_result("ERRO_SSL", False, code, final, f"Falha de certificado ou HTTPS: {str(exc)[:130]}", start, redirects)
    except (OSError, http.client.HTTPException) as exc:
        return make_result("ERRO_CONEXAO", False, code, final, f"Não foi possível conectar: {str(exc)[:140]}", start, redirects)


def make_result(status, accessible, code, final, msg, start, redirects) -> dict:
    return {"status": status, "acessivel": bool(accessible), "http": code, "destino": final,
            "motivo": msg, "tempo_ms": int((time.monotonic()-start)*1000),
            "redirecionamentos": redirects, "verificado_em": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def excel_value(value):
    if value is None:
        return ""
    if isinstance(value, str) and re.match(r"^\s*[=+@\-\t\r]", value):
        return "'" + value  # evita execução de fórmula em qualquer célula de origem
    return value


def sql_conn(j: Job):
    c = sqlite3.connect(j.directory / "linhas.db", timeout=30)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("CREATE TABLE IF NOT EXISTS resultados (linha INTEGER PRIMARY KEY, url TEXT, status TEXT, http INTEGER, destino TEXT, motivo TEXT, tempo_ms INTEGER)")
    c.execute("CREATE INDEX IF NOT EXISTS status_idx ON resultados(status)")
    return c


def read_all_rows(path: Path):
    for header, rows in table_rows(path):
        yield header, rows


def count_rows(j: Job) -> tuple[list[str], int]:
    for header, rows in read_all_rows(j.source):
        if j.column not in header:
            raise ValueError("Coluna selecionada não existe na planilha")
        if len(header) > 250 or len(set(header)) != len(header):
            raise ValueError("Cabeçalhos duplicados ou limite de colunas excedido")
        total = 0
        for row in rows:
            if any(v is not None and str(v).strip() for v in row):
                total += 1
            if total > MAX_ROWS:
                raise ValueError(f"Máximo de {MAX_ROWS:,} linhas por verificação")
        return header, total
    raise ValueError("Arquivo sem cabeçalho")


def process_job(j: Job) -> None:
    db = None
    try:
        with j.lock:
            j.state = "rodando"
        headers, total = count_rows(j)
        with j.lock:
            j.total = total
        if not total:
            raise ValueError("Arquivo não tem dados para verificar")
        target_index = headers.index(j.column)
        db = sql_conn(j)
        workbook = Workbook(write_only=True)
        original_sheet = workbook.create_sheet("BASE_COM_STATUS")
        url_sheet = workbook.create_sheet("STATUS_URLS")
        new_cols = ["URL_ACESSIVEL", "URL_STATUS", "URL_HTTP", "URL_DESTINO_FINAL",
                    "URL_MOTIVO", "URL_TEMPO_MS", "URL_REDIRECIONAMENTOS", "URL_VERIFICADO_EM"]
        original_sheet.append(headers + new_cols)
        url_sheet.append(["LINHA_ORIGINAL", "URL", *new_cols])
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        cache: dict[str, dict] = {}
        batch = []
        row_number = 1

        def flush_batch():
            nonlocal batch
            if not batch:
                return
            unique = list(dict.fromkeys(x[2] for x in batch))
            missing = [u for u in unique if u not in cache]
            if missing:
                with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                    future_map = {pool.submit(check_one, u): u for u in missing}
                    for future in as_completed(future_map):
                        u = future_map[future]
                        try:
                            cache[u] = future.result()
                        except BaseException as exc:
                            cache[u] = make_result("ERRO_INTERNO", False, None, u, str(exc)[:150], time.monotonic(), 0)
            insert = []
            for line, vals, url in batch:
                res = cache[url]
                extras = ["SIM" if res["acessivel"] else "NÃO", res["status"], res["http"] or "",
                          res["destino"], res["motivo"], res["tempo_ms"], res["redirecionamentos"], res["verificado_em"]]
                original_sheet.append([excel_value(v) for v in vals] + [excel_value(v) for v in extras])
                url_sheet.append([line, excel_value(url)] + [excel_value(v) for v in extras])
                insert.append((line, url, res["status"], res["http"], res["destino"], res["motivo"], res["tempo_ms"]))
                with j.lock:
                    j.processed += 1
                    j.summary[res["status"]] += 1
            db.executemany("INSERT INTO resultados VALUES (?,?,?,?,?,?,?)", insert)
            db.commit()
            batch = []

        for header, rows in read_all_rows(j.source):
            for rawrow in rows:
                row_number += 1
                vals = list(rawrow[:len(headers)])
                vals += [None] * (len(headers)-len(vals))
                if not any(v is not None and str(v).strip() for v in vals):
                    continue
                url = str(vals[target_index]).strip() if vals[target_index] is not None else ""
                batch.append((row_number, vals, url))
                if len(batch) >= 120:
                    flush_batch()
                    with j.lock:
                        if j.cancel:
                            j.state = "cancelado"
                            return
            break
        flush_batch()
        summary_sheet = workbook.create_sheet("RESUMO")
        summary_sheet.append(["Relatório de URLs — Precifica QA", now])
        summary_sheet.append(["Arquivo original", j.name])
        summary_sheet.append(["Coluna analisada", j.column])
        summary_sheet.append(["Total de URLs/linhas", j.processed])
        summary_sheet.append(["Situação", "Quantidade"])
        for key, n in sorted(j.summary.items(), key=lambda v: (-v[1], v[0])):
            summary_sheet.append([key, n])
        workbook.save(j.directory / "validacao_urls.xlsx")
        with j.lock:
            j.state = "concluido"
    except BaseException as exc:
        with j.lock:
            j.error = str(exc)[:600]
            j.state = "erro"
    finally:
        if db:
            db.close()


@router.post("/preview")
def preview(file: UploadFile = File(...)):
    cleanup()
    ext = size_and_extension(file)
    directory = Path(tempfile.mkdtemp(prefix="precifica_url_preview_"))
    path = directory / ("entrada" + ext)
    try:
        save_upload(file, path)
        header, sample, _ = get_header_preview(path)
        suggestion = next((c for c in header if re.search(r"url|link|endere[çc]o|site|produto monitorado", c, re.I)), header[0])
        return {"arquivo": file.filename, "colunas": header, "amostra": sample,
                "coluna_sugerida": suggestion, "extensao": ext}
    except HTTPException:
        raise
    except (ValueError, OSError, KeyError) as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        shutil.rmtree(directory, ignore_errors=True)


@router.post("/jobs")
def create_job(file: UploadFile = File(...), coluna: str = Form(...)):
    cleanup()
    ext = size_and_extension(file)
    with JOB_LOCK:
        active = sum(1 for j in JOBS.values() if j.state in {"na_fila", "rodando"})
        if active >= 2:
            raise HTTPException(429, "Já existem duas verificações em andamento. Finalize uma antes de iniciar outra.")
        directory = Path(tempfile.mkdtemp(prefix="precifica_url_job_"))
        job_id = uuid.uuid4().hex
        j = Job(id=job_id, directory=directory, source=directory / ("entrada" + ext),
                column=coluna, name=safe_filename(file.filename or "planilha"))
        JOBS[job_id] = j
    try:
        save_upload(file, j.source)
        headers, sample, _ = get_header_preview(j.source)
        if coluna not in headers:
            raise HTTPException(400, "Coluna selecionada não existe na planilha")
        threading.Thread(target=process_job, args=(j,), name=f"qa-url-{job_id[:8]}", daemon=True).start()
        return j.data()
    except BaseException:
        with JOB_LOCK:
            JOBS.pop(job_id, None)
        shutil.rmtree(directory, ignore_errors=True)
        raise


def get_job(job_id: str) -> Job:
    with JOB_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Verificação não encontrada ou expirada")
    return job


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    return get_job(job_id).data()


@router.get("/jobs/{job_id}/rows")
def job_rows(job_id: str, pagina: int = 1, limite: int = 30, situacao: str = "TODOS"):
    j = get_job(job_id)
    page = min(1000000, max(1, pagina))
    limit = min(100, max(1, limite))
    db_path = j.directory / "linhas.db"
    if not db_path.exists():
        return {"items": [], "total": 0, "pagina": page, "limite": limit}
    with sqlite3.connect(db_path, timeout=10) as conn:
        if situacao == "TODOS":
            where, args = "", []
        else:
            if len(situacao) > 65 or not re.fullmatch(r"[A-Z_]+", situacao):
                raise HTTPException(400, "Filtro inválido")
            where, args = "WHERE status = ?", [situacao]
        total = conn.execute(f"SELECT COUNT(*) FROM resultados {where}", args).fetchone()[0]
        rows = conn.execute(f"SELECT linha, url, status, http, destino, motivo, tempo_ms FROM resultados {where} ORDER BY linha LIMIT ? OFFSET ?",
                            args + [limit, (page-1)*limit]).fetchall()
    return {"items": [{"linha": r[0], "url": r[1], "status": r[2], "http": r[3],
                       "destino": r[4], "motivo": r[5], "tempo_ms": r[6]} for r in rows],
            "total": total, "pagina": page, "limite": limit}


@router.get("/jobs/{job_id}/download")
def download(job_id: str):
    j = get_job(job_id)
    if j.state != "concluido":
        raise HTTPException(409, "A verificação ainda não terminou")
    file = j.directory / "validacao_urls.xlsx"
    if not file.exists():
        raise HTTPException(404, "Planilha ainda indisponível")
    return FileResponse(file, filename="precifica_status_urls.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.post("/jobs/{job_id}/cancel")
def cancel(job_id: str):
    j = get_job(job_id)
    with j.lock:
        if j.state in {"rodando", "na_fila"}:
            j.cancel = True
    return j.data()
