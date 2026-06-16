import { buildPillars, calcOverallPotentiality } from '../assessmentUtils';
import { ASSESSMENT_PILLARS } from '../assessmentContent';
import type { AssessmentComponent } from '@/types';

// ---------------------------------------------------------------------------
// calcOverallPotentiality
// ---------------------------------------------------------------------------

describe('calcOverallPotentiality', () => {
  test('returns null when any pillar is null', () => {
    expect(calcOverallPotentiality(null, 'H', 'H')).toBeNull();
    expect(calcOverallPotentiality('H', null, 'H')).toBeNull();
    expect(calcOverallPotentiality('H', 'H', null)).toBeNull();
    expect(calcOverallPotentiality(null, null, null)).toBeNull();
  });

  test('H H H → H (all high, no low)', () => {
    expect(calcOverallPotentiality('H', 'H', 'H')).toBe('H');
  });

  test('H H M → H (≥2 H, 0 L)', () => {
    expect(calcOverallPotentiality('H', 'H', 'M')).toBe('H');
  });

  test('H M H → H (≥2 H, 0 L)', () => {
    expect(calcOverallPotentiality('H', 'M', 'H')).toBe('H');
  });

  test('M H H → H (≥2 H, 0 L)', () => {
    expect(calcOverallPotentiality('M', 'H', 'H')).toBe('H');
  });

  test('H H L → M (≥2 H but L present blocks High)', () => {
    expect(calcOverallPotentiality('H', 'H', 'L')).toBe('M');
  });

  test('L L L → L (all low, no high)', () => {
    expect(calcOverallPotentiality('L', 'L', 'L')).toBe('L');
  });

  test('L L M → L (≥2 L, 0 H)', () => {
    expect(calcOverallPotentiality('L', 'L', 'M')).toBe('L');
  });

  test('L L H → M (≥2 L but H present blocks Low)', () => {
    expect(calcOverallPotentiality('L', 'L', 'H')).toBe('M');
  });

  test('H M L → M (mixed, no majority)', () => {
    expect(calcOverallPotentiality('H', 'M', 'L')).toBe('M');
  });

  test('M M M → M (all medium)', () => {
    expect(calcOverallPotentiality('M', 'M', 'M')).toBe('M');
  });

  test('H M M → M (only 1 H, insufficient for High)', () => {
    expect(calcOverallPotentiality('H', 'M', 'M')).toBe('M');
  });

  test('L M M → M (only 1 L, insufficient for Low)', () => {
    expect(calcOverallPotentiality('L', 'M', 'M')).toBe('M');
  });
});

// ---------------------------------------------------------------------------
// buildPillars
// ---------------------------------------------------------------------------

describe('buildPillars', () => {
  test('returns ASSESSMENT_PILLARS unchanged when no DB components', () => {
    const result = buildPillars([]);
    expect(result).toHaveLength(3);
    result.forEach((pillar, i) => {
      expect(pillar.key).toBe(ASSESSMENT_PILLARS[i].key);
      expect(pillar.components).toEqual(ASSESSMENT_PILLARS[i].components);
    });
  });

  test('overrides a single slot with DB description', () => {
    const override: AssessmentComponent = {
      id: 'test-id',
      pillar: 'ability',
      component_number: 1,
      description: 'Custom DB description',
      scope: 'global',
      assigned_role: null,
      created_by: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    const result = buildPillars([override]);
    const abilityPillar = result.find(p => p.key === 'ability')!;
    expect(abilityPillar.components[0]).toBe('Custom DB description');
    // Other slots still use defaults
    expect(abilityPillar.components[1]).toBe(ASSESSMENT_PILLARS[0].components[1]);
    expect(abilityPillar.components[2]).toBe(ASSESSMENT_PILLARS[0].components[2]);
  });

  test('overrides a slot in a different pillar without affecting others', () => {
    const override: AssessmentComponent = {
      id: 'test-id-2',
      pillar: 'leadership',
      component_number: 3,
      description: 'Custom leadership Q3',
      scope: 'role',
      assigned_role: 'employee',
      created_by: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    const result = buildPillars([override]);
    const leadershipPillar = result.find(p => p.key === 'leadership')!;
    expect(leadershipPillar.components[2]).toBe('Custom leadership Q3');
    // Aspiration pillar untouched
    const aspirationPillar = result.find(p => p.key === 'aspiration')!;
    expect(aspirationPillar.components).toEqual(ASSESSMENT_PILLARS[1].components);
  });

  test('overrides all 3 slots in one pillar', () => {
    const overrides: AssessmentComponent[] = [1, 2, 3].map(n => ({
      id: `id-${n}`,
      pillar: 'aspiration' as const,
      component_number: n as 1 | 2 | 3,
      description: `Aspiration override Q${n}`,
      scope: 'global' as const,
      assigned_role: null,
      created_by: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }));
    const result = buildPillars(overrides);
    const aspirationPillar = result.find(p => p.key === 'aspiration')!;
    expect(aspirationPillar.components).toEqual([
      'Aspiration override Q1',
      'Aspiration override Q2',
      'Aspiration override Q3',
    ]);
  });

  test('preserves pillar key, label, and structure', () => {
    const result = buildPillars([]);
    expect(result.map(p => p.key)).toEqual(['ability', 'aspiration', 'leadership']);
    expect(result.map(p => p.label)).toEqual(['Ability', 'Aspiration', 'Leadership']);
    result.forEach(p => expect(p.components).toHaveLength(3));
  });
});
