"""Core package for the ERD tool mission."""

from erd_tool.model import (
    Column,
    DataType,
    Namespace,
    PhysicalModel,
    Relationship,
    Table,
    TableConstraint,
)
from erd_tool.project_serialization import (
    DiagramLayout,
    NodePosition,
    ProjectDocument,
    ProjectSerializationError,
    Viewport,
    load_project,
    load_project_model,
    save_project_model,
)
from erd_tool.snowflake import (
    SnowflakeDDLImportError,
    import_snowflake_ddl,
    render_snowflake_ddl,
)
from erd_tool.sqlite import SQLiteImportError, import_sqlite_schema

__all__ = [
    "Column",
    "DataType",
    "DiagramLayout",
    "Namespace",
    "NodePosition",
    "PhysicalModel",
    "ProjectDocument",
    "ProjectSerializationError",
    "Relationship",
    "SnowflakeDDLImportError",
    "SQLiteImportError",
    "Table",
    "TableConstraint",
    "Viewport",
    "import_snowflake_ddl",
    "import_sqlite_schema",
    "load_project",
    "load_project_model",
    "render_snowflake_ddl",
    "save_project_model",
    "__version__",
]

__version__ = "0.1.0"
