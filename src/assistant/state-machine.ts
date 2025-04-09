/* eslint-disable @typescript-eslint/naming-convention */

export type BaseEvent = { type: string };

/**
 * Generic helper type to extract event names from any discriminated union.
 * This type extracts the string literal types used in the 'type' property
 * of a discriminated union.
 */
export type EventNames<T extends BaseEvent> = T["type"];

/**
 * Helper type to get a specific event type based on the discriminator.
 * This type extracts the subset of a union type that matches a specific 'type' value.
 *
 * @template TEvent - The discriminated union type with a 'type' property
 * @template TType - The specific 'type' value to extract
 */
export type EventByType<
  TEvent extends BaseEvent,
  TType extends string,
> = Extract<TEvent, { type: TType }>;

/**
 * Type for a guard/condition function that determines if a transition should
 * occur and narrows the event type.
 *
 * @template EventObjT - Discriminated union type for events with a 'type'
 * property
 * @template NarrowedEventObjT - The narrowed event type if the guard passes
 */
export type GuardFunction<EventObjT, NarrowedEventObjT extends EventObjT> = (
  event: EventObjT
) => event is NarrowedEventObjT;

/**
 * Type for an action function that can be executed when an event occurs.
 *
 * @template NarrowedEventObjT - The event type that the action will receive
 */
export type ActionFunction<NarrowedEventObjT> = (
  event: NarrowedEventObjT
) => void | Promise<void>;

/**
 * Type for a single transition definition within a state. Defines how a state
 * machine should respond to a specific event.
 *
 * @template StateT - Type for state names
 * @template EventObjT - Discriminated union type for events with a 'type' property
 * @template NarrowedEventObjT - The narrowed event type if the guard passes
 */
export type TransitionDefinition<
  StateT extends string,
  EventObjT extends BaseEvent,
  NarrowedEventObjT extends EventObjT,
> = {
  target?: StateT;
  guard?: GuardFunction<EventObjT, NarrowedEventObjT>;
  action?: ActionFunction<NarrowedEventObjT>;
};

/**
 * Advanced type that automatically narrows transition definitions based on event types.
 * This type creates a union of all possible transition definitions for a given
 * state machine, with proper type narrowing for each event type.
 *
 * It works by:
 * 1. Iterating through the keys of the event object type
 * 2. For each key, creating a transition definition with the correctly narrowed event type
 * 3. Returning a union of all these transition definitions
 *
 * This enables type-safe access to event properties in guards and actions without
 * requiring manual type assertions or unsafe casts.
 *
 * @template StateT - String literal type representing possible states
 * @template EventObjT - Discriminated union type for events with a 'type' property
 */
type SubtypeTransitions<StateT extends string, EventObjT extends BaseEvent> = {
  [K in keyof EventObjT]: EventObjT extends infer NarrowedEventObjT
    ? NarrowedEventObjT extends { [P in K]: unknown }
      ? TransitionDefinition<
          StateT,
          EventObjT,
          Extract<NarrowedEventObjT, EventObjT>
        >
      : never
    : never;
}[keyof EventObjT];

/**
 * Type for a single state definition within a state machine. Defines how a
 * state responds to events, including optional transitions and actions.
 *
 * @template StateT - String literal type representing possible states
 * @template EventObjT - Discriminated union type for events with a 'type'
 * property
 */
export type StateDefinition<
  StateT extends string,
  EventObjT extends BaseEvent,
> = {
  /**
   * Event handlers for this state.
   * Keys are event types or "*" for wildcard handling.
   * Each handler can define a single transition or an array of transitions.
   */
  on?: {
    [E in EventObjT["type"] | "*"]?:
      | SubtypeTransitions<StateT, EventObjT>
      | Array<SubtypeTransitions<StateT, EventObjT>>;
  };
};

/**
 * Type that defines the structure of states in a state machine.
 * Maps each state name to its corresponding state definition.
 *
 * @template StateT - String literal type representing possible states
 * @template EventObjT - Discriminated union type for events with a 'type' property
 *
 * The type has two components:
 * 1. A mapping of each state name to its state definition
 * 2. An optional wildcard state ("*") that can handle events not specifically handled by other states
 */
export type StatesMap<StateT extends string, EventObjT extends BaseEvent> = {
  [S in StateT]: StateDefinition<StateT, EventObjT>;
} & {
  "*"?: StateDefinition<StateT, EventObjT>;
};

/**
 * Class for implementing type-safe state machines. Provides a framework for
 * defining states, transitions, and event handlers with full TypeScript type
 * safety.
 *
 * @template StateT - String literal type representing possible states
 * @template EventObjT - Discriminated union type for events with a 'type'
 * property
 */
export class StateMachine<StateT extends string, EventObjT extends BaseEvent> {
  /** The current state of the state machine */
  currentState: StateT;

  /**
   * Define the state structure with required states and optional wildcard.
   * All states specified in StateT must be defined in this object.
   * An optional "*" wildcard state can handle events not handled by specific states.
   */
  states: StatesMap<StateT, EventObjT>;

  /**
   * Creates a new state machine instance.
   *
   * @param options - Configuration options
   * @param options.initialState - The initial state for the machine
   */
  constructor({
    initialState,
    states,
  }: {
    initialState: StateT;
    states: StatesMap<StateT, EventObjT>;
  }) {
    this.currentState = initialState;
    this.states = states;
  }

  /**
   * Send an event to the state machine to trigger transitions.
   *
   * @param event - The event to send to the state machine
   * @returns The state machine instance for chaining
   */
  async send(event: EventObjT): Promise<void> {
    const currentState = this.currentState;
    const eventType = event.type;

    // Find transitions for this event type in the current state
    const transitions = this.getTransitionsForEvent(currentState, eventType);
    if (!transitions) {
      return;
    }

    // Process each transition (could be an array or a single transition)
    const transitionArray = Array.isArray(transitions)
      ? transitions
      : [transitions];

    for (const transition of transitionArray) {
      // Check if there's a guard function
      if (transition.guard) {
        // Execute the action and transition if the guard returns true
        if (transition.guard(event)) {
          if (transition.action) {
            await transition.action(event);
          }

          // Transition to the target state if specified
          if (transition.target) {
            this.currentState = transition.target;
          }

          // Return true to indicate that the event was processed
          return;
        }
      } else {
        // No guard, execute the action directly
        if (transition.action) {
          await transition.action(event as EventObjT);
        }

        // Transition to the target state if specified
        if (transition.target) {
          this.currentState = transition.target;
        }
      }
    }

    return;
  }

  /**
   * Get transitions for a specific event type in a given state.
   * This method checks for transitions in the following order:
   * 1. Current state's specific event handler
   * 2. Current state's wildcard handler
   * 3. Wildcard state's specific event handler
   * 4. Wildcard state's wildcard handler
   *
   * @param state - The state to get transitions for
   * @param eventType - The event type to get transitions for
   * @returns The transition definition(s) for the event, or undefined if none found
   */
  protected getTransitionsForEvent(
    state: StateT,
    eventType: EventObjT["type"]
  ):
    | SubtypeTransitions<StateT, EventObjT>
    | Array<SubtypeTransitions<StateT, EventObjT>>
    | undefined {
    const stateDefinition = this.states[state];

    // Check in order of specificity
    if (stateDefinition?.on?.[eventType]) {
      return stateDefinition.on[eventType];
    }

    if (stateDefinition?.on?.["*"]) {
      return stateDefinition.on["*"];
    }

    const wildcardState = this.states["*"];

    if (wildcardState?.on?.[eventType]) {
      return wildcardState.on[eventType];
    }

    if (wildcardState?.on?.["*"]) {
      return wildcardState.on["*"];
    }

    return undefined;
  }
}
