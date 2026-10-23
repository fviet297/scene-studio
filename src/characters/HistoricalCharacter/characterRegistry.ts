import { PROJECTS } from "../../projects-data";
import type { ProjectCharacter } from "../../ScenePlanVideo";
import type { HistoricalCharacterId } from "./HistoricalCharacter.types";

export type HistoricalCharacterDefinition = ProjectCharacter;

// Built by scripts/build-remotion.mjs from each project's scene-plan.md `## characters` block +
// each character's profile.json, so ids are only unique within one project.
export const charactersOf = (
  project: string,
): readonly HistoricalCharacterDefinition[] =>
  PROJECTS.find((p) => p.slug === project)?.characters ?? [];

export function getCharacter(
  project: string,
  id: HistoricalCharacterId,
): HistoricalCharacterDefinition {
  const definition = charactersOf(project).find((c) => c.id === id);
  if (!definition) {
    throw new Error(
      `Unknown character id "${id}" in project "${project}" — check its scene-plan.md ## characters block (rebuild with node scripts/build-remotion.mjs --project ${project}).`,
    );
  }
  return definition;
}
