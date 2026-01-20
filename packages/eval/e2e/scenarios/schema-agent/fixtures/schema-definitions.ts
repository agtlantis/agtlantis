/**
 * Schema Definitions for Schema Validation E2E Tests
 *
 * Defines Zod schemas used to validate agent JSON outputs.
 * These schemas are used with ValidatorCriterion to test programmatic validation.
 */

import { z } from 'zod'

// ============================================================================
// Simple Schema - Person Extraction
// ============================================================================

/**
 * Schema for extracted person information.
 * Used to test basic field validation and type checking.
 */
export const PersonSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  email: z.string().email().optional(),
})

export type Person = z.infer<typeof PersonSchema>

// ============================================================================
// Nested Schema - Order Extraction
// ============================================================================

/**
 * Schema for order items (nested within OrderSchema).
 */
export const OrderItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
})

export type OrderItem = z.infer<typeof OrderItemSchema>

/**
 * Schema for extracted order information.
 * Used to test nested object and array validation.
 */
export const OrderSchema = z.object({
  orderId: z.string().min(1),
  items: z.array(OrderItemSchema).min(1),
  total: z.number().positive(),
})

export type Order = z.infer<typeof OrderSchema>

// ============================================================================
// Schema Registry (for dynamic lookup)
// ============================================================================

export const SCHEMAS = {
  person: PersonSchema,
  order: OrderSchema,
} as const

export type SchemaName = keyof typeof SCHEMAS
