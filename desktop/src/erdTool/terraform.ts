import {
  canonicalProjectToTerraformHcl as canonicalProjectToTerraformHclImpl,
  terraformHclToCanonicalProject as terraformHclToCanonicalProjectImpl,
  terraformHclToDiagram as terraformHclToDiagramImpl,
} from "./terraformRoundTrip.js";

export type TerraformModuleFile = {
  path: string;
  contents: string;
};

export type TerraformInput = string | TerraformModuleFile[];

export type TerraformImportOptions = {
  name?: string;
  title?: string;
};

export type CanonicalProjectLike = Record<string, unknown>;

export function terraformHclToCanonicalProject(
  input: TerraformInput,
  options: TerraformImportOptions = {},
): CanonicalProjectLike {
  return terraformHclToCanonicalProjectImpl(input, options);
}

export function terraformHclToDiagram(
  input: TerraformInput,
  options: TerraformImportOptions = {},
): Record<string, unknown> {
  return terraformHclToDiagramImpl(input, options);
}

export function canonicalProjectToTerraformHcl(
  projectOrModel: CanonicalProjectLike,
): string {
  return canonicalProjectToTerraformHclImpl(projectOrModel);
}
