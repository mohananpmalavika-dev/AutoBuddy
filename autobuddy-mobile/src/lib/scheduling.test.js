import {
  formatScheduleInputFromDate,
  parseScheduleInput,
  validateScheduledPickup,
} from './scheduling';

describe('scheduling helpers', () => {
  it('parses local schedule text into an ISO timestamp', () => {
    const result = parseScheduleInput('2026-05-31 08:30', 'local');

    expect(result.valid).toBe(true);
    expect(result.iso).toBe(new Date(2026, 4, 31, 8, 30).toISOString());
  });

  it('parses India Standard Time schedule text using IST offset', () => {
    const result = parseScheduleInput('2026-05-31 08:30', 'asia_kolkata');

    expect(result.valid).toBe(true);
    expect(result.iso).toBe('2026-05-31T03:00:00.000Z');
  });

  it('rejects impossible dates and near-past pickups', () => {
    const now = new Date('2026-05-31T03:00:00.000Z');

    expect(parseScheduleInput('2026-02-31 08:30', 'asia_kolkata').valid).toBe(false);
    expect(validateScheduledPickup('2026-05-31 08:31', 'asia_kolkata', {}, now)).toMatchObject({
      valid: false,
      reason: 'future',
    });
  });

  it('formats a UTC instant for IST display', () => {
    const date = new Date('2026-05-31T03:00:00.000Z');

    expect(formatScheduleInputFromDate(date, 'asia_kolkata')).toBe('2026-05-31 08:30');
  });
});
