/**
 * assessmentUtils.ts
 * ------------------
 * Pure utility functions for the Potential Assessment module.
 *
 * Kept separate from component files so they can be imported and
 * unit-tested without any React or browser dependencies.
 */

import { ASSESSMENT_PILLARS, type PillarDefinition } from './assessmentContent';
import type { AssessmentComponent, RatingValue } from '@/types';

/**
 * Merges DB-sourced assessment components with the hardcoded defaults.
 *
 * For each (pillar, component_number) slot the DB description takes
 * precedence; falls back to the static default when no DB entry exists.
 * This allows HQ Admin overrides to propagate to forms while keeping
 * the app functional even when the DB table is empty.
 *
 * @param dbComponents - Components fetched from the assessment_components table.
 * @returns A PillarDefinition array with the same structure as ASSESSMENT_PILLARS.
 *
 * @example
 * // DB has one override for Ability Q1
 * buildPillars([{ pillar: 'ability', component_number: 1, description: 'Custom…', … }])
 * // → Ability Q1 uses 'Custom…', all other slots use static defaults
 */
export function buildPillars(dbComponents: AssessmentComponent[]): PillarDefinition[] {
  return ASSESSMENT_PILLARS.map(pillar => ({
    ...pillar,
    components: ([1, 2, 3] as const).map(num => {
      const found = dbComponents.find(
        c => c.pillar === pillar.key && c.component_number === num
      );
      return found ? found.description : pillar.components[num - 1];
    }),
  }));
}

/**
 * Derives Overall Potentiality from the three pillar average ratings
 * using the matrix rule defined in the assessment specification:
 *
 *   - 2 or more H  AND  0 L  →  'H'  (High Potential)
 *   - 2 or more L  AND  0 H  →  'L'  (Low Potential)
 *   - anything else           →  'M'  (Medium Potential)
 *
 * A single L prevents a High result even when two pillars are H.
 * A single H prevents a Low result even when two pillars are L.
 * Returns null if any pillar rating has not yet been calculated.
 *
 * @param ability    - Overall Ability rating or null.
 * @param aspiration - Overall Aspiration rating or null.
 * @param leadership - Overall Leadership rating or null.
 * @returns 'H', 'M', 'L', or null when inputs are incomplete.
 *
 * @example
 * calcOverallPotentiality('H', 'H', 'M') // → 'H'
 * calcOverallPotentiality('L', 'H', 'H') // → 'M'  (L blocks High)
 * calcOverallPotentiality('L', 'L', 'M') // → 'L'
 */
export function calcOverallPotentiality(
  ability: RatingValue | null,
  aspiration: RatingValue | null,
  leadership: RatingValue | null,
): RatingValue | null {
  if (!ability || !aspiration || !leadership) return null;
  const ratings = [ability, aspiration, leadership];
  const h = ratings.filter(r => r === 'H').length;
  const l = ratings.filter(r => r === 'L').length;
  if (h >= 2 && l === 0) return 'H';
  if (l >= 2 && h === 0) return 'L';
  return 'M';
}
