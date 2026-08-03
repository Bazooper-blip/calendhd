import { describe, expect, it } from 'vitest';
import { baseIcalUid } from './externalEvents';

describe('baseIcalUid', () => {
	it('returns a plain uid unchanged', () => {
		expect(baseIcalUid('abc-123@example.com')).toBe('abc-123@example.com');
	});

	it('strips a recurrence occurrence stamp', () => {
		expect(baseIcalUid('abc-123@example.com::20260803T090000')).toBe('abc-123@example.com');
	});

	it('strips only the last stamp when the uid itself contains "::"', () => {
		expect(baseIcalUid('weird::uid::20260803T090000')).toBe('weird::uid');
	});

	it('keeps a "::" suffix that is not a sync stamp', () => {
		expect(baseIcalUid('weird::uid')).toBe('weird::uid');
		expect(baseIcalUid('abc::20260803')).toBe('abc::20260803');
		expect(baseIcalUid('abc::not-a-stamp')).toBe('abc::not-a-stamp');
	});

	it('handles empty string', () => {
		expect(baseIcalUid('')).toBe('');
	});
});
