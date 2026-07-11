from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from erd_tool.snowflake import import_snowflake_ddl, render_snowflake_ddl
from erd_tool.sqlite import SQLiteImportError, import_sqlite_schema


def _create_chinook_like_db(path: Path) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE Artist (
                ArtistId INTEGER PRIMARY KEY,
                Name NVARCHAR(120)
            );
            CREATE TABLE Album (
                AlbumId INTEGER PRIMARY KEY,
                Title NVARCHAR(160) NOT NULL,
                ArtistId INTEGER NOT NULL,
                UNIQUE (Title),
                FOREIGN KEY (ArtistId) REFERENCES Artist (ArtistId)
            );
            CREATE TABLE Invoice (
                InvoiceId INTEGER PRIMARY KEY,
                CustomerId INT NOT NULL,
                InvoiceDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                BillingAddress NVARCHAR(70),
                Total NUMERIC(10, 2) NOT NULL DEFAULT 0,
                Notes TEXT,
                IsPaid BOOLEAN NOT NULL DEFAULT 0,
                Attachment BLOB,
                Rating REAL,
                CreatedOn DATE
            );
            """
        )
        connection.commit()
    finally:
        connection.close()


def test_import_sqlite_schema_maps_chinook_like_types_and_relationships(
    tmp_path: Path,
) -> None:
    database = tmp_path / "chinook_like.db"
    _create_chinook_like_db(database)

    model = import_sqlite_schema(
        database,
        model_name="chinook-like",
        catalog="CHINOOK",
        schema="MAIN",
    )

    assert model.name == "chinook-like"
    assert [namespace.id for namespace in model.namespaces] == [
        "namespace:CHINOOK.MAIN"
    ]
    assert [table.name for table in model.tables] == ["ALBUM", "ARTIST", "INVOICE"]

    artist = next(table for table in model.tables if table.name == "ARTIST")
    album = next(table for table in model.tables if table.name == "ALBUM")
    invoice = next(table for table in model.tables if table.name == "INVOICE")

    assert [column.name for column in artist.columns] == ["ARTISTID", "NAME"]
    assert artist.columns[0].nullable is False
    assert artist.columns[0].data_type.text == "NUMBER(38, 0)"
    assert artist.columns[1].data_type.text == "VARCHAR(120)"

    assert [column.name for column in album.columns] == [
        "ALBUMID",
        "TITLE",
        "ARTISTID",
    ]
    assert any(constraint.kind == "primary_key" for constraint in album.constraints)
    assert any(constraint.kind == "unique" for constraint in album.constraints)
    assert any(constraint.kind == "foreign_key" for constraint in album.constraints)
    assert len(model.relationships) == 1
    relationship = model.relationships[0]
    assert relationship.source_table_id == album.id
    assert relationship.target_table_id == artist.id

    types_by_name = {column.name: column.data_type.text for column in invoice.columns}
    assert types_by_name["INVOICEID"] == "NUMBER(38, 0)"
    assert types_by_name["CUSTOMERID"] == "NUMBER(38, 0)"
    assert types_by_name["INVOICEDATE"] == "TIMESTAMP_NTZ(9)"
    assert types_by_name["BILLINGADDRESS"] == "VARCHAR(70)"
    assert types_by_name["TOTAL"] == "NUMBER(10, 2)"
    assert types_by_name["NOTES"] == "VARCHAR(16777216)"
    assert types_by_name["ISPAID"] == "BOOLEAN"
    assert types_by_name["ATTACHMENT"] == "BINARY(8388608)"
    assert types_by_name["RATING"] == "FLOAT"
    assert types_by_name["CREATEDON"] == "DATE"
    assert invoice.columns[2].default == "CURRENT_TIMESTAMP"
    assert invoice.columns[4].default == "0"
    assert invoice.columns[6].default == "0"

    for table in model.tables:
        for constraint in table.constraints:
            assert constraint.name is not None
            assert constraint.name == constraint.name.upper()
            assert len(constraint.name) <= 255

    rendered = render_snowflake_ddl(model)
    assert "NOT ENFORCED" in rendered
    assert "RELY" not in rendered.upper().replace("NOT ENFORCED", "")
    assert rendered.index("CREATE TABLE CHINOOK.MAIN.ARTIST") < rendered.index(
        "CREATE TABLE CHINOOK.MAIN.ALBUM"
    )
    reimported = import_snowflake_ddl(rendered, model_name="chinook-like")
    assert reimported.to_dict() == model.to_dict()


def test_import_sqlite_rejects_missing_database(tmp_path: Path) -> None:
    missing = tmp_path / "missing.db"
    with pytest.raises(SQLiteImportError, match="missing|exist|readable|database"):
        import_sqlite_schema(
            missing,
            model_name="x",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_rejects_non_database_file(tmp_path: Path) -> None:
    path = tmp_path / "not-a-db.txt"
    path.write_text("hello", encoding="utf-8")
    with pytest.raises(SQLiteImportError, match="database|sqlite|invalid"):
        import_sqlite_schema(
            path,
            model_name="x",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_rejects_blank_names(tmp_path: Path) -> None:
    database = tmp_path / "blank.db"
    _create_chinook_like_db(database)
    with pytest.raises(SQLiteImportError, match="model_name|blank|nonblank"):
        import_sqlite_schema(
            database,
            model_name="  ",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_rejects_no_user_tables(tmp_path: Path) -> None:
    database = tmp_path / "empty.db"
    connection = sqlite3.connect(database)
    connection.close()
    with pytest.raises(SQLiteImportError, match="table"):
        import_sqlite_schema(
            database,
            model_name="empty",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_rejects_unsupported_type(tmp_path: Path) -> None:
    database = tmp_path / "bad_type.db"
    connection = sqlite3.connect(database)
    try:
        # Affinity still maps unknown tokens; out-of-range numeric params fail.
        connection.execute(
            "CREATE TABLE Sample (Id INTEGER PRIMARY KEY, Amount NUMERIC(50, 2))"
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(SQLiteImportError, match="precision|NUMBER|50"):
        import_sqlite_schema(
            database,
            model_name="bad",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_rejects_normalized_name_collision(tmp_path: Path) -> None:
    database = tmp_path / "collision.db"
    connection = sqlite3.connect(database)
    try:
        connection.execute('CREATE TABLE "Artist-1" (Id INTEGER PRIMARY KEY)')
        connection.execute('CREATE TABLE "Artist 1" (Id INTEGER PRIMARY KEY)')
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(SQLiteImportError, match="collision|ARTIST_1"):
        import_sqlite_schema(
            database,
            model_name="collision",
            catalog="C",
            schema="S",
        )


def test_normalize_snowflake_identifier_maps_unicode_per_source_char() -> None:
    from erd_tool.sqlite import normalize_snowflake_identifier

    # ß must become one underscore, not expand via str.upper() to SS.
    assert normalize_snowflake_identifier("Straße") == "STRA_E"
    assert normalize_snowflake_identifier("Strasse") == "STRASSE"
    assert normalize_snowflake_identifier("Straße") != normalize_snowflake_identifier(
        "Strasse"
    )


def test_import_sqlite_normalizes_whitespace_names_without_stripping(
    tmp_path: Path,
) -> None:
    from erd_tool.sqlite import normalize_snowflake_identifier

    assert normalize_snowflake_identifier(" A ") == "_A_"
    assert normalize_snowflake_identifier("   ") == "___"
    assert normalize_snowflake_identifier("A") == "A"

    database = tmp_path / "whitespace.db"
    connection = sqlite3.connect(database)
    try:
        connection.execute('CREATE TABLE " A " (Id INTEGER PRIMARY KEY)')
        connection.execute('CREATE TABLE "A" (Id INTEGER PRIMARY KEY)')
        connection.commit()
    finally:
        connection.close()

    model = import_sqlite_schema(
        database,
        model_name="whitespace-names",
        catalog="C",
        schema="S",
    )
    assert [table.name for table in model.tables] == ["A", "_A_"]


def test_import_sqlite_rejects_unresolved_foreign_key(tmp_path: Path) -> None:
    database = tmp_path / "bad_fk.db"
    connection = sqlite3.connect(database)
    try:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute(
            """
            CREATE TABLE Album (
                AlbumId INTEGER PRIMARY KEY,
                ArtistId INTEGER NOT NULL,
                FOREIGN KEY (ArtistId) REFERENCES MissingArtist (ArtistId)
            )
            """
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(SQLiteImportError, match="MissingArtist|unresolved|foreign"):
        import_sqlite_schema(
            database,
            model_name="bad-fk",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_does_not_read_row_data(tmp_path: Path) -> None:
    database = tmp_path / "with_rows.db"
    connection = sqlite3.connect(database)
    try:
        connection.execute(
            "CREATE TABLE Artist (ArtistId INTEGER PRIMARY KEY, Name TEXT)"
        )
        connection.execute(
            "INSERT INTO Artist (ArtistId, Name) VALUES (1, 'secret-row')"
        )
        connection.commit()
    finally:
        connection.close()

    model = import_sqlite_schema(
        database,
        model_name="rows",
        catalog="C",
        schema="S",
    )
    serialized = str(model.to_dict())
    assert "secret-row" not in serialized
    assert str(database) not in serialized


def test_import_sqlite_resolves_case_variant_foreign_keys(tmp_path: Path) -> None:
    database = tmp_path / "case_fk.db"
    connection = sqlite3.connect(database)
    try:
        connection.executescript(
            """
            CREATE TABLE Artist (
                ArtistId INTEGER PRIMARY KEY,
                Name TEXT
            );
            CREATE TABLE Album (
                AlbumId INTEGER PRIMARY KEY,
                ArtistId INTEGER NOT NULL,
                FOREIGN KEY (ArtistId) REFERENCES artist (artistid)
            );
            """
        )
        connection.commit()
    finally:
        connection.close()

    model = import_sqlite_schema(
        database,
        model_name="case-fk",
        catalog="C",
        schema="S",
    )
    album = next(table for table in model.tables if table.name == "ALBUM")
    artist = next(table for table in model.tables if table.name == "ARTIST")
    fk = next(
        constraint for constraint in album.constraints if constraint.kind == "foreign_key"
    )
    assert fk.referenced_table_id == artist.id
    assert fk.referenced_columns == ("column:C.S.ARTIST.ARTISTID",)
    assert "NONE" not in str(model.to_dict())


def test_import_sqlite_resolves_composite_implicit_fk_to_primary_key(
    tmp_path: Path,
) -> None:
    database = tmp_path / "implicit_fk.db"
    connection = sqlite3.connect(database)
    try:
        connection.executescript(
            """
            CREATE TABLE Parent (
                A INTEGER NOT NULL,
                B INTEGER NOT NULL,
                PRIMARY KEY (A, B)
            );
            CREATE TABLE Child (
                X INTEGER NOT NULL,
                Y INTEGER NOT NULL,
                FOREIGN KEY (X, Y) REFERENCES Parent
            );
            """
        )
        connection.commit()
    finally:
        connection.close()

    model = import_sqlite_schema(
        database,
        model_name="implicit-fk",
        catalog="C",
        schema="S",
    )
    child = next(table for table in model.tables if table.name == "CHILD")
    parent = next(table for table in model.tables if table.name == "PARENT")
    fk = next(
        constraint for constraint in child.constraints if constraint.kind == "foreign_key"
    )
    assert fk.columns == (
        "column:C.S.CHILD.X",
        "column:C.S.CHILD.Y",
    )
    assert fk.referenced_table_id == parent.id
    assert fk.referenced_columns == (
        "column:C.S.PARENT.A",
        "column:C.S.PARENT.B",
    )
    assert "NONE" not in str(model.to_dict())
    assert "column:C.S.PARENT.NONE" not in str(model.to_dict())


def test_import_sqlite_resolves_case_variant_composite_implicit_fk(
    tmp_path: Path,
) -> None:
    database = tmp_path / "case_implicit_fk.db"
    connection = sqlite3.connect(database)
    try:
        connection.executescript(
            """
            CREATE TABLE Parent (
                A INTEGER NOT NULL,
                B INTEGER NOT NULL,
                PRIMARY KEY (A, B)
            );
            CREATE TABLE Child (
                X INTEGER NOT NULL,
                Y INTEGER NOT NULL,
                FOREIGN KEY (X, Y) REFERENCES parent
            );
            """
        )
        connection.commit()
    finally:
        connection.close()

    model = import_sqlite_schema(
        database,
        model_name="case-implicit-fk",
        catalog="C",
        schema="S",
    )
    child = next(table for table in model.tables if table.name == "CHILD")
    fk = next(
        constraint for constraint in child.constraints if constraint.kind == "foreign_key"
    )
    assert fk.referenced_columns == (
        "column:C.S.PARENT.A",
        "column:C.S.PARENT.B",
    )


def test_import_sqlite_rejects_out_of_range_numeric_and_varchar(
    tmp_path: Path,
) -> None:
    database = tmp_path / "bad_bounds.db"
    connection = sqlite3.connect(database)
    try:
        connection.execute(
            "CREATE TABLE BadNumeric (Id INTEGER PRIMARY KEY, Amount NUMERIC(50, 2))"
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(SQLiteImportError, match="precision|NUMBER|50"):
        import_sqlite_schema(
            database,
            model_name="bad-numeric",
            catalog="C",
            schema="S",
        )

    database2 = tmp_path / "bad_varchar.db"
    connection = sqlite3.connect(database2)
    try:
        connection.execute(
            "CREATE TABLE BadVarchar (Id INTEGER PRIMARY KEY, Name VARCHAR(0))"
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(SQLiteImportError, match="length|VARCHAR"):
        import_sqlite_schema(
            database2,
            model_name="bad-varchar",
            catalog="C",
            schema="S",
        )


def test_import_sqlite_rejects_partial_unique_index(tmp_path: Path) -> None:
    database = tmp_path / "partial_unique.db"
    connection = sqlite3.connect(database)
    try:
        connection.executescript(
            """
            CREATE TABLE Sample (
                Id INTEGER PRIMARY KEY,
                Code TEXT
            );
            CREATE UNIQUE INDEX uq_code_partial ON Sample(Code) WHERE Code IS NOT NULL;
            """
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(SQLiteImportError, match="partial unique index"):
        import_sqlite_schema(
            database,
            model_name="partial",
            catalog="C",
            schema="S",
        )


def test_map_sqlite_declared_type_affinity_and_explicit_overrides() -> None:
    from erd_tool.sqlite import map_sqlite_declared_type

    assert map_sqlite_declared_type("INT(11)").text == "NUMBER(38, 0)"
    assert map_sqlite_declared_type("CHARACTER VARYING(50)").text == "VARCHAR(50)"
    assert map_sqlite_declared_type("VARCHAR").text == "VARCHAR(16777216)"
    assert map_sqlite_declared_type("NUMERIC(10, 2)").text == "NUMBER(10, 2)"
    assert map_sqlite_declared_type("DECIMAL").text == "NUMBER(38, 0)"
    assert map_sqlite_declared_type("JSON").text == "NUMBER(38, 0)"
    assert map_sqlite_declared_type("").text == "BINARY(8388608)"
    assert map_sqlite_declared_type(None).text == "BINARY(8388608)"
    assert map_sqlite_declared_type("DATE").text == "DATE"
    assert map_sqlite_declared_type("DATETIME").text == "TIMESTAMP_NTZ(9)"
    assert map_sqlite_declared_type("BOOLEAN").text == "BOOLEAN"
    assert map_sqlite_declared_type("DOUBLE PRECISION").text == "FLOAT"
    assert map_sqlite_declared_type("BLOB").text == "BINARY(8388608)"


def test_import_sqlite_readonly_uri_handles_special_filename_chars(
    tmp_path: Path,
) -> None:
    for name in ("draft#1.db", "draft?1.db", "draft%1.db"):
        database = tmp_path / name
        connection = sqlite3.connect(database)
        try:
            connection.execute(
                "CREATE TABLE Sample (Id INTEGER PRIMARY KEY, Name TEXT)"
            )
            connection.commit()
        finally:
            connection.close()

        model = import_sqlite_schema(
            database,
            model_name="special-path",
            catalog="C",
            schema="S",
        )
        assert model.tables[0].name == "SAMPLE"
        assert model.tables[0].columns[0].data_type.text == "NUMBER(38, 0)"
