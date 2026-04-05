import IcalExpander from 'ical-expander';
import type { ExternalEvent, RecurrenceRule } from '$types';

// Parse an ICS feed and extract events, expanding recurring events within a date range
export function parseICalFeed(icsText: string): Omit<ExternalEvent, 'id' | 'created' | 'updated' | 'user' | 'subscription'>[] {
	// Define expansion range: 1 year back to 2 years forward
	const now = new Date();
	const rangeStart = new Date(now.getFullYear() - 1, 0, 1);
	const rangeEnd = new Date(now.getFullYear() + 2, 11, 31);

	const icalExpander = new IcalExpander({ ics: icsText, maxIterations: 1000 });
	const results = icalExpander.between(rangeStart, rangeEnd);

	const events: Omit<ExternalEvent, 'id' | 'created' | 'updated' | 'user' | 'subscription'>[] = [];

	// Process single (non-recurring) events
	for (const event of results.events) {
		const vevent = event.component;
		events.push({
			uid: event.uid,
			title: event.summary || 'Untitled Event',
			description: event.description || undefined,
			start_time: event.startDate.toJSDate().toISOString(),
			end_time: event.endDate ? event.endDate.toJSDate().toISOString() : undefined,
			is_all_day: event.startDate.isDate,
			location: event.location || undefined,
			recurrence_rule: parseRRule(vevent),
			raw_ics: vevent.toString()
		});
	}

	// Process expanded recurring event occurrences
	for (const occurrence of results.occurrences) {
		const event = occurrence.item;
		const vevent = event.component;

		// Calculate end time based on duration
		const startDate = occurrence.startDate.toJSDate();
		const endDate = occurrence.endDate ? occurrence.endDate.toJSDate() : undefined;

		events.push({
			uid: `${event.uid}_${startDate.getTime()}`,
			title: event.summary || 'Untitled Event',
			description: event.description || undefined,
			start_time: startDate.toISOString(),
			end_time: endDate?.toISOString(),
			is_all_day: occurrence.startDate.isDate,
			location: event.location || undefined,
			recurrence_rule: parseRRule(vevent),
			raw_ics: vevent.toString()
		});
	}

	return events;
}

// Parse RRULE from vevent component
function parseRRule(vevent: any): RecurrenceRule | undefined {
	const rruleProp = vevent.getFirstProperty('rrule');
	if (!rruleProp) return undefined;

	const rrule = rruleProp.getFirstValue();
	if (!rrule) return undefined;

	const freq = rrule.freq?.toLowerCase();
	if (!freq) return undefined;

	// Map ICAL frequency to our frequency types
	const frequencyMap: Record<string, RecurrenceRule['frequency']> = {
		daily: 'daily',
		weekly: 'weekly',
		monthly: 'monthly',
		yearly: 'yearly'
	};

	const frequency = frequencyMap[freq];
	if (!frequency) return undefined;

	const rule: RecurrenceRule = {
		frequency,
		interval: rrule.interval || 1
	};

	// Parse end date
	if (rrule.until) {
		rule.end_date = rrule.until.toJSDate().toISOString();
	}

	// Parse count
	if (rrule.count) {
		rule.count = rrule.count;
	}

	// Parse days of week for weekly recurrence
	if (frequency === 'weekly' && rrule.parts?.BYDAY) {
		const dayMap: Record<string, number> = {
			SU: 0,
			MO: 1,
			TU: 2,
			WE: 3,
			TH: 4,
			FR: 5,
			SA: 6
		};

		rule.days_of_week = rrule.parts.BYDAY.map((day: string) => dayMap[day]).filter(
			(d: number | undefined) => d !== undefined
		);
	}

	// Check for every other day pattern
	if (frequency === 'daily' && rule.interval === 2) {
		return { ...rule, frequency: 'every_other_day' };
	}

	// Check for biweekly pattern
	if (frequency === 'weekly' && rule.interval === 2) {
		return { ...rule, frequency: 'biweekly' };
	}

	return rule;
}

// Fetch and parse an ICS feed from a URL
export async function fetchAndParseICalFeed(
	url: string
): Promise<Omit<ExternalEvent, 'id' | 'created' | 'updated' | 'user' | 'subscription'>[]> {
	const normalizedUrl = normalizeICalUrl(url);
	const response = await fetch(normalizedUrl, {
		headers: {
			'User-Agent': 'calenDHD/1.0 (Calendar Sync)',
			'Accept': 'text/calendar, application/calendar+xml, application/ics'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch calendar: ${response.statusText}`);
	}

	const icsText = await response.text();
	return parseICalFeed(icsText);
}

// Validate an ICS URL
export function validateICalUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		// Accept webcal, http, and https protocols
		return ['webcal:', 'http:', 'https:'].includes(parsed.protocol);
	} catch {
		return false;
	}
}

// Convert webcal:// to https://
export function normalizeICalUrl(url: string): string {
	return url.replace(/^webcal:\/\//i, 'https://');
}
