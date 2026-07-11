"""Command line smoke surface for the ERD tool foundation."""

from __future__ import annotations

import argparse
import json

from erd_tool.model import PhysicalModel


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="erd-tool")
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Run the installed-independent smoke check.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.smoke:
        model = PhysicalModel(name="smoke")
        print(json.dumps({"status": "ok", "model": model.to_dict()}, sort_keys=True))
        return 0
    build_parser().print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
