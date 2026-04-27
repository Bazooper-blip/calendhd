import type { RoutineStep, RoutineSchedule } from '$types';

interface SampleRoutine {
	name: string;
	color: string;
	icon: string;
	target_end_time?: string;
	is_active: boolean;
	schedule: RoutineSchedule;
	steps: RoutineStep[];
}

// Three calm starter routines that map to the most common ADHD pain points:
//  - mornings (decision fatigue)
//  - evenings (wind-down for sleep regulation)
//  - weekly admin (catch-up the week)
//
// Times and durations are conservative defaults; the user is expected to edit.
export const SAMPLE_ROUTINES: SampleRoutine[] = [
	{
		name: 'Morning routine',
		color: '#7C9885',
		icon: '🌅',
		target_end_time: '09:00',
		is_active: true,
		schedule: {
			days: ['mon', 'tue', 'wed', 'thu', 'fri'],
			time: '07:30'
		},
		steps: [
			{ title: 'Wake up + light', duration_minutes: 10, energy_level: 'low', timing_mode: 'flexible' },
			{ title: 'Glass of water + meds', duration_minutes: 5, energy_level: 'low', timing_mode: 'fixed' },
			{ title: 'Shower', duration_minutes: 15, energy_level: 'medium', timing_mode: 'flexible' },
			{ title: 'Breakfast', duration_minutes: 20, energy_level: 'low', timing_mode: 'flexible' },
			{ title: 'Plan the day', duration_minutes: 10, energy_level: 'medium', timing_mode: 'flexible' }
		]
	},
	{
		name: 'Evening wind-down',
		color: '#9A88B5',
		icon: '🌙',
		target_end_time: '22:30',
		is_active: true,
		schedule: {
			days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
			time: '21:30'
		},
		steps: [
			{ title: 'Tidy living space', duration_minutes: 10, energy_level: 'low', timing_mode: 'flexible' },
			{ title: 'Lay out clothes for tomorrow', duration_minutes: 5, energy_level: 'low', timing_mode: 'flexible' },
			{ title: 'Skincare + brush teeth', duration_minutes: 10, energy_level: 'low', timing_mode: 'flexible' },
			{ title: 'Read / no-screen time', duration_minutes: 30, energy_level: 'low', timing_mode: 'flexible' },
			{ title: 'Lights out', duration_minutes: 5, energy_level: 'low', timing_mode: 'fixed' }
		]
	},
	{
		name: 'Weekly admin',
		color: '#E8A383',
		icon: '📋',
		is_active: true,
		schedule: {
			days: ['sun'],
			time: '17:00'
		},
		steps: [
			{ title: 'Review the week ahead', duration_minutes: 15, energy_level: 'medium', timing_mode: 'flexible' },
			{ title: 'Check inbox + admin', duration_minutes: 30, energy_level: 'medium', timing_mode: 'flexible' },
			{ title: 'Pay any outstanding bills', duration_minutes: 15, energy_level: 'medium', timing_mode: 'flexible' },
			{ title: 'Meal plan + grocery list', duration_minutes: 20, energy_level: 'low', timing_mode: 'flexible' }
		]
	}
];
