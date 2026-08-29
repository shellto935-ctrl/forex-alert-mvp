import { describe, expect, it } from 'vitest';
import { getSession } from '../src/strategy/session.js';

describe('America/New_York session gates', () => {
  it('classifies London boundaries in winter', () => {
    expect(getSession(Date.parse('2026-01-15T06:55:00Z'))).toBe('NONE');
    expect(getSession(Date.parse('2026-01-15T07:00:00Z'))).toBe('LONDON');
    expect(getSession(Date.parse('2026-01-15T09:55:00Z'))).toBe('LONDON');
    expect(getSession(Date.parse('2026-01-15T10:00:00Z'))).toBe('NONE');
  });

  it('classifies London boundaries in daylight time', () => {
    expect(getSession(Date.parse('2026-07-15T05:55:00Z'))).toBe('NONE');
    expect(getSession(Date.parse('2026-07-15T06:00:00Z'))).toBe('LONDON');
    expect(getSession(Date.parse('2026-07-15T08:55:00Z'))).toBe('LONDON');
    expect(getSession(Date.parse('2026-07-15T09:00:00Z'))).toBe('NONE');
  });

  it('classifies NY PM boundaries', () => {
    expect(getSession(Date.parse('2026-07-15T16:55:00Z'))).toBe('NONE');
    expect(getSession(Date.parse('2026-07-15T17:00:00Z'))).toBe('NY_PM');
    expect(getSession(Date.parse('2026-07-15T18:55:00Z'))).toBe('NY_PM');
    expect(getSession(Date.parse('2026-07-15T19:00:00Z'))).toBe('NONE');
  });
});
