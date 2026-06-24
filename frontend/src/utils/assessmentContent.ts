// Static content: pillar definitions, questions, labels
/**
 * Potential Assessment — Static Content Definitions
 * Contains pillar labels and component descriptions used across all roles.
 * Assessment content is identical for every role.
 */

export type PillarKey = 'ability' | 'aspiration' | 'leadership';

export interface PillarDefinition {
  key: PillarKey;
  label: string;
  components: string[];
}

export const ASSESSMENT_PILLARS: PillarDefinition[] = [
  {
    key: 'ability',
    label: 'Ability',
    components: [
      'Demonstrates core and functional competencies transferrable to more senior roles',
      'Shows curiosity and eagerness to learn new skills and apply them to drive the business forward',
      'Demonstrates emotional intelligence required for greater seniority / thinks beyond limits',
    ],
  },
  {
    key: 'aspiration',
    label: 'Aspiration',
    components: [
      'Identifies new opportunities or brings new perspectives',
      'Demonstrates motivation to gain critical experience for a more senior role (e.g. change functions/geography)',
      'Constantly looking for ways to improve self and others',
    ],
  },
  {
    key: 'leadership',
    label: 'Leadership',
    components: [
      'Deals with the discomfort of change',
      'Contributes beyond the scope of their current role',
      'Provides constructive feedback and doesn\'t back away from difficult conversations',
    ],
  },
];

export const PILLAR_KEYS: PillarKey[] = ['ability', 'aspiration', 'leadership'];

/** Returns pillar definition by key */
export function getPillar(key: PillarKey): PillarDefinition {
  return ASSESSMENT_PILLARS.find((p) => p.key === key)!;
}
