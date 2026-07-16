import { parseSnowflakeDDLToDiagram } from "../../erdTool/projectAdapter.js";

export function fromSnowflake(sql) {
  return parseSnowflakeDDLToDiagram(sql);
}
