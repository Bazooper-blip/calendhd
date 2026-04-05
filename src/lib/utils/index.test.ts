import { describe, it, expect } from 'vitest';
import { cn, hexToRgb, getContrastColor, normalizeCalendarUrl } from './index';

describe('cn', () => {
	it('joins class names', () => {
		expect(cn('a', 'b', 'c')).toBe('a b c');
	});

	it('filters falsy values', () => {
		expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
	});

	it('returns empty string for no truthy classes', () => {
		expect(cn(false, null, undefined)).toBe('');
	});

	it('handles single class', () => {
		expect(cn('only')).toBe('only');
	});
});

describe('hexToRgb', () => {
	it('parses 6-digit hex with #', () => {
		expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
	});

	it('parses 6-digit hex without #', () => {
		expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
	});

	it('parses mixed case', () => {
		expect(hexToRgb('#7C9885')).toEqual({ r: 124, g: 152, b: 133 });
	});

	it('returns null for invalid hex', () => {
		expect(hexToRgb('not-a-color')).toBeNull();
	});

	it('returns null for 3-digit hex (unsupported)', () => {
		expect(hexToRgb('#fff')).toBeNull();
	});

	it('parses black', () => {
		expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
	});

	it('parses white', () => {
		expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
	});
});

describe('getContrastColor', () => {
	it('returns white for dark backgrounds', () => {
		expect(getContrastColor('#000000')).toBe('white');
		expect(getContrastColor('#333333')).toBe('white');
		expect(getContrastColor('#1a1a2e')).toBe('white'); // dark navy
	});

	it('returns black for light backgrounds', () => {
		expect(getContrastColor('#ffffff')).toBe('black');
		expect(getContrastColor('#D4C97A')).toBe('black'); // yellow
		expect(getContrastColor('#E8A383')).toBe('black'); // peach/orange
	});

	it('returns black for invalid hex', () => {
		expect(getContrastColor('invalid')).toBe('black');
	});

	it('handles sage green (#7C9885) correctly', () => {
		// Luminance = (0.299*124 + 0.587*152 + 0.114*133) / 255 ≈ 0.556
		expect(getContrastColor('#7C9885')).toBe('black');
	});
});

describe('normalizeCalendarUrl', () => {
	it('converts webcal:// to https://', () => {
		expect(normalizeCalendarUrl('webcal://example.com/cal.ics')).toBe(
			'https://example.com/cal.ics'
		);
	});

	it('is case-insensitive', () => {
		expect(normalizeCalendarUrl('WEBCAL://example.com/feed')).toBe(
			'https://example.com/feed'
		);
	});

	it('leaves https:// unchanged', () => {
		expect(normalizeCalendarUrl('https://example.com/cal.ics')).toBe(
			'https://example.com/cal.ics'
		);
	});

	it('leaves http:// unchanged', () => {
		expect(normalizeCalendarUrl('http://example.com/cal.ics')).toBe(
			'http://example.com/cal.ics'
		);
	});
});
