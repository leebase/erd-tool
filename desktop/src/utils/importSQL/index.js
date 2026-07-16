import { DB } from "../../data/constants.js";
import { arrangeTables } from "../arrangeTables.js";
import { fromMariaDB } from "./mariadb.js";
import { fromMSSQL } from "./mssql.js";
import { fromMySQL } from "./mysql.js";
import { fromOracleSQL } from "./oraclesql.js";
import { fromPostgres } from "./postgres.js";
import { fromSnowflake } from "./snowflake.js";
import { fromSQLite } from "./sqlite.js";

export function importSQL(ast, toDb = DB.MYSQL, diagramDb = DB.GENERIC) {
  let diagram;
  switch (toDb) {
    case DB.SQLITE:
      diagram = fromSQLite(ast, diagramDb);
      break;
    case DB.MYSQL:
      diagram = fromMySQL(ast, diagramDb);
      break;
    case DB.POSTGRES:
      diagram = fromPostgres(ast, diagramDb);
      break;
    case DB.MARIADB:
      diagram = fromMariaDB(ast, diagramDb);
      break;
    case DB.MSSQL:
      diagram = fromMSSQL(ast, diagramDb);
      break;
    case DB.ORACLESQL:
      diagram = fromOracleSQL(ast, diagramDb);
      break;
    case DB.SNOWFLAKE:
      diagram = fromSnowflake(ast);
      break;
    default:
      diagram = { tables: [], relationships: [] };
      break;
  }

  arrangeTables(diagram);

  return diagram;
}
