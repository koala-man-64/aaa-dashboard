# function_app.py
# v2 Function App with:
#   - hello       : simple greeting
#   - read_csv    : get blob as CSV/JSON
#   - log_event   : write UI events to SQL Server (pyodbc default, pymssql fallback)
#
# SQL env (pick one set):
#   - SQLSERVER_CONNSTR = "Driver={ODBC Driver 18 for SQL Server};Server=tcp:...;Database=...;Uid=...;Pwd=...;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
#   or discrete vars (ODBC):
#       SQL_SERVER, SQL_DATABASE, SQL_USERNAME, SQL_PASSWORD
#       [optional] SQL_PORT=1433, SQL_ENCRYPT=yes, SQL_TRUST_SERVER_CERT=no, SQL_CONN_TIMEOUT=30, SQL_ODBC_DRIVER="ODBC Driver 18 for SQL Server"
#   - Driver choice:
#       SQL_DRIVER=pyodbc (default) or SQL_DRIVER=pymssql
#
# Storage env for read_csv (pick one auth path):
#   - BLOB_CONN  (connection string), or
#   - STORAGE_ACCOUNT_NAME + SAS_TOKEN, or
#   - STORAGE_ACCOUNT_URL (uses default creds/MSI)
#   plus BLOB_CONTAINER, BLOB_NAME (defaults)

import os, io, json, logging, csv, datetime
from typing import Optional

import azure.functions as func
from azure.storage.blob import BlobServiceClient
from azure.core.credentials import AzureSasCredential

import logging
import os
from pathlib import Path
from typing import Tuple

import azure.functions as func
from azure.storage.blob import BlobClient  # make sure this is in requirements.txt



# Optional extras
try:
    import pandas as pd
except Exception:
    pd = None
try:
    import debugpy
except Exception:
    debugpy = None

# Attempt drivers
try:
    import pyodbc  # preferred
except Exception:
    pyodbc = None
try:
    import pymssql  # fallback
except Exception:
    pymssql = None

# TOP OF function_app.py
import os, logging
try:
    import debugpy
    if os.getenv("ENABLE_DEBUGPY") == "1":
        host = os.getenv("DEBUGPY_HOST", "127.0.0.1")
        port = int(os.getenv("DEBUGPY_PORT", "5678"))
        try:
            debugpy.listen((host, port))
            logging.info(f"debugpy listening on {host}:{port}")
        except RuntimeError:
            pass  # already listening
        if os.getenv("WAIT_FOR_DEBUGGER") == "1":
            logging.info("Waiting for debugger to attach...")
            debugpy.wait_for_client()
except Exception as e:
    logging.warning(f"debugpy not available: {e}")
    
# ---------------------------
# Debugpy (optional attach)
# ---------------------------
def _cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

# ---------------------------
# Storage helpers
# ---------------------------
def _normalize_sas(token: Optional[str]) -> Optional[AzureSasCredential]:
    if not token:
        return None
    t = token.strip()
    if t.startswith("?"):
        t = t[1:]
    return AzureSasCredential(t)

def _bsc() -> BlobServiceClient:
    conn = os.getenv("BLOB_CONN")
    if conn:
        logging.info("Auth mode: connection string")
        return BlobServiceClient.from_connection_string(conn)
    acct = os.getenv("STORAGE_ACCOUNT_NAME")
    sas  = _normalize_sas(os.getenv("SAS_TOKEN"))
    if acct and sas:
        logging.info("Auth mode: account + SAS")
        return BlobServiceClient(
            account_url=f"https://{acct}.blob.core.windows.net",
            credential=sas
        )
    url = os.getenv("STORAGE_ACCOUNT_URL")
    if url:
        logging.info("Auth mode: account URL (default creds/MSI)")
        return BlobServiceClient(account_url=url)
    raise RuntimeError("Missing storage auth: set BLOB_CONN or (STORAGE_ACCOUNT_NAME+SAS_TOKEN) or STORAGE_ACCOUNT_URL")

def _params(req: func.HttpRequest) -> dict:
    qs   = {k.lower(): v for k, v in req.params.items()}
    body = {}
    try:
        if req.get_body():
            body = json.loads(req.get_body() or b"{}")
            if not isinstance(body, dict):
                body = {}
    except Exception:
        body = {}
    pick = lambda k, env=None, d=None: qs.get(k) or body.get(k) or os.getenv((env or k).upper(), d)
    return {
        "container": pick("container", "BLOB_CONTAINER"),
        "blob":      pick("blob", "BLOB_NAME"),
        "format":   (pick("format") or "csv").lower(),  # csv | json
    }

def _csv_to_rows(data: bytes):
    if pd is not None:
        try:
            df = pd.read_csv(io.BytesIO(data))
            return df.to_dict(orient="records")
        except Exception as e:
            logging.warning("Pandas failed to parse CSV; falling back: %s", e)
    try:
        text = data.decode("utf-8")
    except Exception:
        text = data.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]

# ---------------------------
# SQL helpers
# ---------------------------
def _build_odbc_conn_str() -> str:
    full = os.getenv("SQLSERVER_CONNSTR")
    if full:
        return full
    driver = os.getenv("SQL_ODBC_DRIVER", "ODBC Driver 18 for SQL Server")
    server = os.getenv("SQL_SERVER")
    database = os.getenv("SQL_DATABASE")
    user = os.getenv("SQL_USERNAME")
    password = os.getenv("SQL_PASSWORD")
    port = os.getenv("SQL_PORT", "1433")
    encrypt = os.getenv("SQL_ENCRYPT", "yes")
    trust = os.getenv("SQL_TRUST_SERVER_CERT", "no")
    timeout = os.getenv("SQL_CONN_TIMEOUT", "30")
    missing = [k for k,v in {"SQL_SERVER":server,"SQL_DATABASE":database,"SQL_USERNAME":user,"SQL_PASSWORD":password}.items() if not v]
    if missing:
        raise RuntimeError(f"Missing required SQL env vars for ODBC: {', '.join(missing)}")
    return (
        f"Driver={{{driver}}};"
        f"Server=tcp:{server},{port};"
        f"Database={database};"
        f"Uid={user};"
        f"Pwd={password};"
        f"Encrypt={encrypt};"
        f"TrustServerCertificate={trust};"
        f"Connection Timeout={timeout};"
    )

def get_connection_params():
    try:
        if os.environ.get("LOCAL_DEVELOPMENT", "true").lower() == "true":
            with open("local.settings.json", "r") as f:
                local_settings = json.load(f)
            values     = local_settings.get("Values", {})
            raw_server = values.get("SQL_SERVER")
            database   = values.get("SQL_DATABASE")
            username   = values.get("SQL_USERNAME")
            password   = values.get("SQL_PASSWORD")
        else:
            raw_server = os.environ["SQL_SERVER"]
            database   = os.environ["SQL_DATABASE"]
            username   = os.environ["SQL_USERNAME"]
            password   = os.environ["SQL_PASSWORD"]

        # Remove "tcp:" prefix if present
        if raw_server.startswith("tcp:"):
            raw_server = raw_server[4:]

        # Split server and port if a comma exists
        if "," in raw_server:
            server, port_str = raw_server.split(",", 1)
            port = int(port_str)
        else:
            server = raw_server
            port = 1433  # default SQL Server port

        connection_params = {
            "server": server,
            "user": username,
            "password": password,
            "database": database,
            "port": port
        }
        return connection_params
    except Exception as e:
        raise Exception(f"ERROR retrieving connection parameters: {str(e)}")


def _connect_sql():
    choice = os.getenv("SQL_DRIVER", "pyodbc").lower()
    if choice == "pymssql":
        if pymssql is None:
            raise RuntimeError("SQL_DRIVER=pymssql but pymssql is not installed.")
        server = os.getenv("SQL_SERVER")
        database = os.getenv("SQL_DATABASE")
        user = os.getenv("SQL_USERNAME")
        password = os.getenv("SQL_PASSWORD")
        port = int(os.getenv("SQL_PORT", "1433"))
        missing = [k for k,v in {"SQL_SERVER":server,"SQL_DATABASE":database,"SQL_USERNAME":user,"SQL_PASSWORD":password}.items() if not v]
        if missing:
            raise RuntimeError(f"Missing required SQL env vars for pymssql: {', '.join(missing)}")
        return pymssql.connect(server=server, user=user, password=password, database=database, port=port)
    # default: pyodbc
    if pyodbc is None:
        raise RuntimeError("pyodbc is not installed and SQL_DRIVER is not set to 'pymssql'.")
    conn_str = _build_odbc_conn_str()
    return pyodbc.connect(conn_str)

# ---------------------------
# v2 FunctionApp + routes
# ---------------------------
app = func.FunctionApp()

@app.function_name(name="hello")
@app.route(route="hello", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def hello(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Python HTTP trigger processed a request.")
    name = req.params.get("name")
    if not name:
        try:
            body = req.get_json()
            name = body.get("name") if isinstance(body, dict) else None
        except ValueError:
            name = None
    if not name:
        return func.HttpResponse("Please pass a 'name' in query or JSON body.", status_code=400)
    return func.HttpResponse(f"Hello, {name}!")

@app.function_name(name="read_csv")
@app.route(route="read-csv", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def read_csv(req: func.HttpRequest) -> func.HttpResponse:
    """
    HTTP-triggered function.
    Query/body parameters:
      - filename: name of the CSV, e.g. "NWMIWS_Site_Data_testing_varied.csv"
      - source: "local" or "cloud"
    Returns JSON array of objects parsed from the CSV.
    """
    logging.info("read_csv function triggered")

    filename, source = _get_params(req)

    if not filename:
        return func.HttpResponse(
            "Missing 'filename' parameter", status_code=400
        )

    if source not in ("local", "cloud"):
        return func.HttpResponse(
            "Invalid 'source' parameter. Must be 'local' or 'cloud'.",
            status_code=400,
        )

    try:
        if source == "local":
            csv_text = _read_local_csv(filename)
        else:
            csv_text = _read_cloud_csv(filename)

        # Parse CSV text into list[dict]
        csv_file = io.StringIO(csv_text)
        reader = csv.DictReader(csv_file)
        rows = list(reader)

        json_body = json.dumps(rows, default=str)

        return func.HttpResponse(
            json_body,
            status_code=200,
            mimetype="application/json",
        )

    except FileNotFoundError as ex:
        logging.error("File not found: %s", ex)
        return func.HttpResponse(str(ex), status_code=404)

    except ValueError as ex:
        logging.error("Bad request: %s", ex)
        return func.HttpResponse(str(ex), status_code=400)

    except Exception as ex:
        logging.exception("Unexpected error reading CSV")
        return func.HttpResponse(
            "Internal server error", status_code=500
        )
@app.function_name(name="log_event")
@app.route(route="log-event", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def log_event(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received a log event request.")
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors())
    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse(json.dumps({"error": "Invalid JSON"}), status_code=400, mimetype="application/json", headers=_cors())

    eventType     = (req_body.get("eventType")     or "").strip()
    targetTag     = (req_body.get("targetTag")     or "").strip()
    targetId      = (req_body.get("targetId")      or "").strip()
    targetClasses = (req_body.get("targetClasses") or "").strip()
    targetText    = (req_body.get("targetText")    or "").strip()
    clientIp      = (req_body.get("clientIp")      or "").strip()
    clientUrl     = (req_body.get("clientUrl")     or "").strip()
    timestamp     = datetime.datetime.utcnow()

    try:
        conn = _connect_sql()
        cursor = conn.cursor()
        insert_sql = (
            "INSERT INTO dbo.LogEvent (EventType,TargetTag,TargetID,TargetClasses,TargetText,ClientIp,ClientUrl,Timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            if pyodbc else
            "INSERT INTO dbo.LogEvent (EventType,TargetTag,TargetID,TargetClasses,TargetText,ClientIp,ClientUrl,Timestamp) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
        )
        cursor.execute(insert_sql, (eventType, targetTag, targetId, targetClasses, targetText, clientIp, clientUrl, timestamp))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logging.error("Error inserting log data into SQL", exc_info=True)
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, mimetype="application/json", headers=_cors())

    return func.HttpResponse(json.dumps({"status": "ok", "message": "Log data received and inserted."}), status_code=200, mimetype="application/json", headers=_cors())




def _get_params(req: func.HttpRequest) -> Tuple[str, str]:
    """
    Helper to read filename and source from query string or JSON body.
    source is 'local' or 'cloud'.
    """
    filename = req.params.get("filename")
    source = req.params.get("source")

    # Try JSON body if not present in query
    if not filename or not source:
        try:
            body = req.get_json()
        except ValueError:
            body = {}

        if not filename:
            filename = body.get("filename")
        if not source:
            source = body.get("source")

    # Defaults
    if not source:
        source = "cloud"  # or "local" if you prefer

    return filename, source.lower()


def _read_local_csv(filename: str) -> str:
    """
    Read CSV from the local filesystem under ./data.
    Returns raw CSV text.
    """
    base_dir = Path(__file__).parent / "data"
    base_dir = base_dir.resolve()

    # Prevent path traversal: only allow files under base_dir
    target = (base_dir / filename).resolve()
    if not str(target).startswith(str(base_dir)):
        raise ValueError("Invalid filename")

    if not target.is_file():
        raise FileNotFoundError(f"File not found: {target}")

    logging.info("Reading local CSV: %s", target)
    return target.read_text(encoding="utf-8")


def _read_cloud_csv(filename: str) -> str:
    """
    Read CSV from Azure Blob Storage using account + SAS or connection string.
    Returns raw CSV text.
    """
    account_name = os.getenv("STORAGE_ACCOUNT_NAME")
    container_name = os.getenv("STORAGE_CONTAINER_NAME")
    sas_token = os.getenv("STORAGE_ACCOUNT_SAS")  # if using SAS

    if not account_name or not container_name or not sas_token:
        raise RuntimeError("Missing storage configuration environment variables")

    blob_url = (
        f"https://{account_name}.blob.core.windows.net/"
        f"{container_name}/{filename}?{sas_token}"
    )

    logging.info("Reading cloud CSV from %s", blob_url)

    blob_client = BlobClient.from_blob_url(blob_url)
    data = blob_client.download_blob().content_as_text(encoding="utf-8")

    return data


