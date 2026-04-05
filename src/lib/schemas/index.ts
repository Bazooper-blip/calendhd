import { z } from 'zod';

// Event schemas
export const eventSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500, 'Title is too long'),
	description: z.string().max(10000, 'Description is too long').optional(),
	start_date: z.string().min(1, 'Start date is required'),
	start_time: z.string().optional(),
	end_date: z.string().optional(),
	end_time: z.string().optional(),
	is_all_day: z.boolean().default(false),
	category: z.string().optional(),
	color_override: z
		.string()
		.regex(/^#[0-9A-Fa-f]{3,8}$/, 'Invalid color format')
		.optional()
		.or(z.literal('')),
	icon: z.string().max(100).optional().or(z.literal('')),
	reminders: z.array(z.number()).optional(),
	recurrence_rule: z
		.object({
			frequency: z.enum([
				'daily',
				'every_other_day',
				'weekly',
				'biweekly',
				'monthly',
				'yearly'
			]),
			interval: z.number().min(1).optional(),
			end_date: z.string().optional(),
			count: z.number().min(1).optional(),
			days_of_week: z.array(z.number().min(0).max(6)).optional()
		})
		.optional()
});

// Category schemas
export const categorySchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
	color: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/, 'Invalid color format'),
	icon: z.string().max(50, 'Icon name is too long').optional()
});

// Template schemas
export const templateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
	category: z.string().optional(),
	default_duration_minutes: z.number().min(0).max(10080, 'Duration cannot exceed 7 days'),
	default_is_all_day: z.boolean().default(false),
	description: z.string().max(5000, 'Description is too long').optional(),
	color_override: z
		.string()
		.regex(/^#[0-9A-Fa-f]{3,8}$/, 'Invalid color format')
		.optional()
		.or(z.literal('')),
	icon: z.string().max(100).optional().or(z.literal('')),
	default_reminders: z.array(z.number()).optional()
});

// Subscription schemas
export const subscriptionSchema = z.object({
	name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
	url: z.string().min(1, 'URL is required').url('Please enter a valid URL'),
	color_override: z
		.string()
		.regex(/^#[0-9A-Fa-f]{3,8}$/, 'Invalid color format')
		.optional()
		.or(z.literal('')),
	refresh_interval_minutes: z.number().min(15).max(10080).default(60),
	is_active: z.boolean().default(true)
});

// Helper function to validate and extract errors
export function validateForm<T extends z.ZodType>(
	schema: T,
	data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: Record<string, string> } {
	const result = schema.safeParse(data);

	if (result.success) {
		return { success: true, data: result.data };
	}

	const errors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const path = issue.path.join('.');
		if (!errors[path]) {
			errors[path] = issue.message;
		}
	}

	return { success: false, errors };
}

// Type exports
export type EventInput = z.infer<typeof eventSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;
