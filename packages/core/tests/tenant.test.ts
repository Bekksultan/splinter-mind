import { describe, expect, it } from 'vitest';
import {
  TenantIsolationError,
  assertSameOrg,
  filterByOrg,
} from '../src/types.ts';

const orgA = 'org-a';
const orgB = 'org-b';

const rows = [
  { id: 'a1', organization_id: orgA },
  { id: 'a2', organization_id: orgA },
  { id: 'b1', organization_id: orgB },
];

describe('multi-tenant pure-logic isolation', () => {
  it('filterByOrg never leaks org B rows to org A', () => {
    const got = filterByOrg(rows, orgA);
    expect(got.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
    expect(got.some((r) => r.organization_id === orgB)).toBe(false);
  });

  it('filterByOrg on empty input returns empty', () => {
    expect(filterByOrg([], orgA)).toEqual([]);
  });

  it('assertSameOrg passes for same org, throws for foreign org', () => {
    expect(assertSameOrg(rows[0]!, orgA).id).toBe('a1');
    expect(() => assertSameOrg(rows[2]!, orgA)).toThrow(TenantIsolationError);
    expect(() => assertSameOrg(rows[2]!, orgA)).toThrow('Cross-organization access denied');
  });
});
