# License Scope

ERD Tool is a multi-license repository. A file's nearest license notice takes
precedence over this summary.

## MIT-licensed work

Except where a file or directory says otherwise, Lee-authored root-level work,
including `src/erd_tool/`, the Python tests, and the canonical-model command-line
tooling, is licensed under the root [MIT License](LICENSE).

## AGPL-licensed desktop application

Everything under `desktop/` is part of an application derived from
[drawDB](https://github.com/drawdb-io/drawdb). It is licensed under the GNU
Affero General Public License version 3 only, as stated in
[`desktop/LICENSE`](desktop/LICENSE). Local modifications to that application
are distributed under the same license.

The compiled Electron application combines the drawDB-derived application with
its modifications and is therefore distributed under AGPL-3.0-only, not MIT.
Anyone distributing or operating a modified network-accessible version must
comply with the AGPL's corresponding-source requirements.

## Third-party components

Third-party dependencies retain their own licenses. In particular, automatic
layout uses `elkjs`, licensed under Eclipse Public License 2.0. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[`desktop/THIRD_PARTY_NOTICES.md`](desktop/THIRD_PARTY_NOTICES.md).

This document describes the repository's intended license allocation; it is
not legal advice.
