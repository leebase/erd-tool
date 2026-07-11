"""Command line surface for the ERD tool offline workflows."""

from __future__ import annotations

import argparse
import json
import mimetypes
import signal
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from erd_tool.model import PhysicalModel
from erd_tool.project_serialization import (
    ProjectSerializationError,
    load_project,
    save_project_model,
)
from erd_tool.snowflake import (
    SnowflakeDDLImportError,
    import_snowflake_ddl,
    render_snowflake_ddl,
)
from erd_tool.sqlite import SQLiteImportError, import_sqlite_schema


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="erd-tool")
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Run the installed-independent smoke check.",
    )
    subparsers = parser.add_subparsers(dest="command")

    snowflake_import = subparsers.add_parser(
        "snowflake-import", help="Import Snowflake DDL into a project file."
    )
    snowflake_import.add_argument("input")
    snowflake_import.add_argument("--name", required=True)
    snowflake_import.add_argument("--output", required=True)

    sqlite_import = subparsers.add_parser(
        "sqlite-import", help="Import a SQLite schema into a project file."
    )
    sqlite_import.add_argument("database")
    sqlite_import.add_argument("--name", required=True)
    sqlite_import.add_argument("--catalog", required=True)
    sqlite_import.add_argument("--schema", required=True)
    sqlite_import.add_argument("--output", required=True)

    render_ddl = subparsers.add_parser(
        "render-ddl", help="Render Snowflake DDL from a project file."
    )
    render_ddl.add_argument("project")
    render_ddl.add_argument("--output", required=True)

    project_check = subparsers.add_parser(
        "project-check", help="Validate a project file and print a summary."
    )
    project_check.add_argument("project")

    serve = subparsers.add_parser(
        "serve", help="Serve a local frontend build over loopback HTTP."
    )
    serve.add_argument(
        "--frontend-dir",
        default=str(Path(__file__).resolve().parents[2] / ".." / "drawdb" / "dist"),
    )
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.smoke:
        model = PhysicalModel(name="smoke")
        print(json.dumps({"status": "ok", "model": model.to_dict()}, sort_keys=True))
        return 0

    if args.command is None:
        parser.print_help()
        return 0

    try:
        if args.command == "snowflake-import":
            return _cmd_snowflake_import(args)
        if args.command == "sqlite-import":
            return _cmd_sqlite_import(args)
        if args.command == "render-ddl":
            return _cmd_render_ddl(args)
        if args.command == "project-check":
            return _cmd_project_check(args)
        if args.command == "serve":
            return _cmd_serve(args)
    except (
        OSError,
        ValueError,
        SnowflakeDDLImportError,
        SQLiteImportError,
        ProjectSerializationError,
        json.JSONDecodeError,
    ) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    parser.print_help()
    return 0


def _cmd_snowflake_import(args: argparse.Namespace) -> int:
    sql = Path(args.input).read_text(encoding="utf-8")
    model = import_snowflake_ddl(sql, model_name=args.name)
    _write_project(args.output, model)
    return 0


def _cmd_sqlite_import(args: argparse.Namespace) -> int:
    model = import_sqlite_schema(
        args.database,
        model_name=args.name,
        catalog=args.catalog,
        schema=args.schema,
    )
    _write_project(args.output, model)
    return 0


def _cmd_render_ddl(args: argparse.Namespace) -> int:
    document = _load_project_file(args.project)
    ddl = render_snowflake_ddl(document.physical_model)
    if args.output == "-":
        sys.stdout.write(ddl)
    else:
        Path(args.output).write_text(ddl, encoding="utf-8")
    return 0


def _cmd_project_check(args: argparse.Namespace) -> int:
    document = _load_project_file(args.project)
    model = document.physical_model
    summary = {
        "status": "ok",
        "name": model.name,
        "namespaces": len(model.namespaces),
        "tables": len(model.tables),
        "relationships": len(model.relationships),
        "layout_nodes": len(document.diagram_layout.nodes),
    }
    print(json.dumps(summary, sort_keys=True))
    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    frontend_dir = Path(args.frontend_dir).resolve()
    if not frontend_dir.is_dir():
        raise ValueError(f"frontend directory does not exist: {frontend_dir}")
    index_path = frontend_dir / "index.html"
    if not index_path.is_file():
        raise ValueError(f"frontend directory must contain index.html: {frontend_dir}")

    handler = partial(_SpaRequestHandler, directory=str(frontend_dir))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    host, port = server.server_address[:2]
    url = f"http://{host}:{port}"
    print(url, flush=True)

    def _shutdown(signum: int, frame: object) -> None:
        # BaseServer.shutdown() must run outside the serve_forever thread.
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


def _write_project(output: str, model: PhysicalModel) -> None:
    payload = save_project_model(model)
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    Path(output).write_text(text, encoding="utf-8")


def _load_project_file(path: str):
    raw = Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    return load_project(data)


class _SpaRequestHandler(SimpleHTTPRequestHandler):
    """Serve static files with SPA fallback for extensionless unknown routes."""

    def __init__(self, *args: object, directory: str, **kwargs: object) -> None:
        super().__init__(*args, directory=directory, **kwargs)

    def send_head(self):  # type: ignore[override]
        path = Path(self.translate_path(self.path))
        if path.is_file():
            return super().send_head()

        request_path = self.path.split("?", 1)[0].split("#", 1)[0]
        has_extension = Path(request_path).suffix != ""
        if has_extension:
            return super().send_head()

        index_path = Path(self.directory) / "index.html"
        try:
            file_obj = index_path.open("rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        content_type = mimetypes.guess_type(str(index_path))[0] or "text/html"
        self.send_response(200)
        self.send_header("Content-type", content_type)
        self.send_header("Content-Length", str(index_path.stat().st_size))
        self.end_headers()
        return file_obj

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    raise SystemExit(main())
