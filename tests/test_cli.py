from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from erd_tool.cli import main
from erd_tool.snowflake import import_snowflake_ddl


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
FIXTURES = ROOT / "docs" / "fixtures"
SQL_FIXTURE = FIXTURES / "snowflake_round_trip_v1.sql"
PYTHON = sys.executable


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def test_snowflake_import_render_and_project_check(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    project_path = tmp_path / "model.erd.json"
    ddl_path = tmp_path / "out.sql"

    assert (
        main(
            [
                "snowflake-import",
                str(SQL_FIXTURE),
                "--name",
                "snowflake-round-trip-v1",
                "--output",
                str(project_path),
            ]
        )
        == 0
    )
    project_data = json.loads(project_path.read_text(encoding="utf-8"))
    assert project_data["project_version"] == "1"
    assert project_data["diagram_layout"]["nodes"] == {}
    assert project_data["physical_model"]["name"] == "snowflake-round-trip-v1"
    assert project_path.read_text(encoding="utf-8").endswith("\n")

    assert main(["render-ddl", str(project_path), "--output", str(ddl_path)]) == 0
    rendered = ddl_path.read_text(encoding="utf-8")
    assert "CREATE TABLE" in rendered
    assert "NOT ENFORCED" in rendered

    assert main(["project-check", str(project_path)]) == 0
    summary = json.loads(capsys.readouterr().out.strip())
    assert summary["status"] == "ok"
    assert summary["tables"] == 2
    assert summary["relationships"] == 1


def test_sqlite_import_cli(tmp_path: Path) -> None:
    import sqlite3

    database = tmp_path / "demo.db"
    connection = sqlite3.connect(database)
    try:
        connection.execute(
            "CREATE TABLE Artist (ArtistId INTEGER PRIMARY KEY, Name TEXT)"
        )
        connection.commit()
    finally:
        connection.close()
    project_path = tmp_path / "sqlite.erd.json"

    assert (
        main(
            [
                "sqlite-import",
                str(database),
                "--name",
                "demo",
                "--catalog",
                "CHINOOK",
                "--schema",
                "MAIN",
                "--output",
                str(project_path),
            ]
        )
        == 0
    )
    project_data = json.loads(project_path.read_text(encoding="utf-8"))
    assert project_data["physical_model"]["tables"][0]["name"] == "ARTIST"


def test_render_ddl_stdout(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    model = import_snowflake_ddl(
        SQL_FIXTURE.read_text(encoding="utf-8"),
        model_name="snowflake-round-trip-v1",
    )
    from erd_tool.project_serialization import save_project_model

    project_path = tmp_path / "model.erd.json"
    _write_json(project_path, save_project_model(model))

    assert main(["render-ddl", str(project_path), "--output", "-"]) == 0
    assert "CREATE TABLE" in capsys.readouterr().out


def test_malformed_project_returns_exit_two_without_traceback(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    project_path = tmp_path / "bad.erd.json"
    project_path.write_text("{}\n", encoding="utf-8")

    exit_code = main(["project-check", str(project_path)])

    captured = capsys.readouterr()
    assert exit_code == 2
    assert captured.err.strip()
    assert "Traceback" not in captured.err


def test_smoke_flag_still_works(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--smoke"]) == 0
    payload = json.loads(capsys.readouterr().out.strip())
    assert payload["status"] == "ok"
    assert payload["model"]["name"] == "smoke"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_serve_http_get_and_spa_fallback(tmp_path: Path) -> None:
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / "index.html").write_text(
        "<!doctype html><title>erd</title><h1>home</h1>",
        encoding="utf-8",
    )
    (frontend / "app.js").write_text("console.log('ok');\n", encoding="utf-8")

    port = _free_port()
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SRC)
    process = subprocess.Popen(
        [
            PYTHON,
            "-m",
            "erd_tool.cli",
            "serve",
            "--frontend-dir",
            str(frontend),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        url = f"http://127.0.0.1:{port}"
        deadline = time.time() + 5
        started = False
        output = ""
        while time.time() < deadline:
            assert process.poll() is None
            if process.stdout is not None:
                line = process.stdout.readline()
                if line:
                    output += line
                    if url in line:
                        started = True
                        break
            time.sleep(0.05)
        assert started, output

        with urllib.request.urlopen(f"{url}/", timeout=2) as response:
            body = response.read().decode("utf-8")
            assert response.status == 200
            assert "home" in body

        with urllib.request.urlopen(f"{url}/diagram/view", timeout=2) as response:
            spa_body = response.read().decode("utf-8")
            assert response.status == 200
            assert "home" in spa_body

        with urllib.request.urlopen(f"{url}/app.js", timeout=2) as response:
            assert response.status == 200
            assert "console.log" in response.read().decode("utf-8")
    finally:
        process.send_signal(signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
            pytest.fail("serve did not shut down cleanly after SIGTERM")
