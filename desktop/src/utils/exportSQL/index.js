import { DB } from "../../data/constants.js";
import { toMariaDB } from "./mariadb.js";
import { toMSSQL } from "./mssql.js";
import { toMySQL } from "./mysql.js";
import { toOracleSQL } from "./oraclesql.js";
import { toPostgres } from "./postgres.js";
import { toSqlite } from "./sqlite.js";
import {
  diagramToCanonicalProject,
  renderCanonicalSnowflakeDDL,
} from "../../erdTool/projectAdapter.js";

export function exportSQL(diagram) {
  switch (diagram.database) {
    case DB.SQLITE:
      return toSqlite(diagram);
    case DB.MYSQL:
      return toMySQL(diagram);
    case DB.POSTGRES:
      return toPostgres(diagram);
    case DB.MARIADB:
      return toMariaDB(diagram);
    case DB.MSSQL:
      return toMSSQL(diagram);
    case DB.ORACLESQL:
      return toOracleSQL(diagram);
    case DB.SNOWFLAKE:
      return renderCanonicalSnowflakeDDL(diagramToCanonicalProject(diagram));
    default:
      return "";
  }
}
