/**
 * Booking Agent Types
 *
 * Multi-turn conversational agent that helps users make reservations.
 */

/**
 * Single message in conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * User input for each conversation turn
 */
export interface BookingInput {
  /** User's message in the conversation */
  message: string

  /**
   * Previous conversation history for multi-turn context.
   * Required for stateless agent to maintain conversation flow.
   */
  conversationHistory?: ConversationMessage[]
}

/**
 * Agent output for each conversation turn
 *
 * The agent responds with a message and tracks booking state.
 */
export interface BookingOutput {
  /** Agent's response message */
  reply: string

  /** Current booking state (null if no booking yet) */
  booking: BookingState | null

  /** Whether more information is needed from the user */
  needsMoreInfo: boolean

  /** What information is missing (if needsMoreInfo is true) */
  missingFields?: string[]
}

/**
 * Booking state tracked across the conversation
 */
export interface BookingState {
  /** Date of the reservation (YYYY-MM-DD format) */
  date?: string

  /** Time of the reservation (HH:MM format) */
  time?: string

  /** Number of people */
  partySize?: number

  /** Customer name */
  name?: string

  /** Contact phone number */
  phone?: string

  /** Special requests or notes */
  notes?: string

  /** Booking status */
  status: 'pending' | 'confirmed' | 'cancelled'
}
