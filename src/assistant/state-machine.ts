/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Generic helper type to extract event names from any discriminated union.
 * This type extracts the string literal types used in the 'type' property
 * of a discriminated union.
 */
export type EventNames<T extends { type: string }> = T["type"];

/**
 * Helper type to get a specific event type based on the discriminator.
 * This type extracts the subset of a union type that matches a specific 'type' value.
 *
 * @template TEvent - The discriminated union type with a 'type' property
 * @template TType - The specific 'type' value to extract
 */
export type EventByType<
  TEvent extends { type: string },
  TType extends string,
> = Extract<TEvent, { type: TType }>;

/**
 * Type for an action function that can be executed when an event occurs.
 *
 * @template EventObjT - Discriminated union type for events with a 'type' property
 * @template E - The specific event type or wildcard
 */
export type ActionFunction<
  EventObjT extends { type: string },
  E extends EventObjT["type"] | "*",
> = <T extends E & EventObjT["type"]>(event: EventByType<EventObjT, T>) => void;

/**
 * Type for a single state definition within a state machine.
 * Defines how a state responds to events, including optional transitions and actions.
 *
 * @template StateT - String literal type representing possible states
 * @template EventObjT - Discriminated union type for events with a 'type' property
 */
export type StateDefinition<
  StateT extends string,
  EventObjT extends { type: string },
> = {
  /**
   * Event handlers for this state.
   * Keys are event types or "*" for wildcard handling.
   * Each handler can define a target state and/or an action to execute.
   */
  on?: {
    [E in EventObjT["type"] | "*"]?: {
      /** Optional target state to transition to when this event occurs */
      target?: StateT;
      /**
       * Optional action function(s) to execute when this event occurs.
       * Can be a single action function or an array of action functions.
       * Each action receives the typed event object as its parameter.
       */
      action?:
        | ActionFunction<EventObjT, E>
        | Array<ActionFunction<EventObjT, E>>;
    };
  };
};

/**
 * Abstract base class for implementing type-safe state machines.
 * Provides a framework for defining states, transitions, and event handlers
 * with full TypeScript type safety.
 *
 * @template StateT - String literal type representing possible states
 * @template EventObjT - Discriminated union type for events with a 'type' property
 */
export abstract class StateMachine<
  StateT extends string,
  EventObjT extends { type: string },
> {
  /** The current state of the state machine */
  currentState: StateT;

  /**
   * Define the state structure with required states and optional wildcard.
   * All states specified in StateT must be defined in this object.
   * An optional "*" wildcard state can handle events not handled by specific states.
   */
  states!: {
    [S in StateT]: StateDefinition<StateT, EventObjT>;
  } & {
    "*"?: StateDefinition<StateT, EventObjT>;
  };

  /**
   * Creates a new state machine instance.
   *
   * @param options - Configuration options
   * @param options.initialState - The initial state for the machine
   */
  constructor({ initialState }: { initialState: StateT }) {
    this.currentState = initialState;
  }

  /**
   * Sends an event to the state machine for processing.
   * The machine will look for handlers in the following order:
   * 1. Current state's specific event handler
   * 2. Current state's wildcard handler
   * 3. Wildcard state's specific event handler
   * 4. Wildcard state's wildcard handler
   *
   * If a matching handler is found, its action is executed and any
   * target state transition is performed.
   *
   * @param eventObj - The event object to process
   */
  send(eventObj: EventObjT): void {
    // Type-safe event name
    const eventName = eventObj.type;
    type EventKey = EventObjT["type"] | "*";

    // Get the current state - handle undefined case (shouldn't happen with exhaustive states)
    const currentState = this.states[this.currentState];

    // Get the event for the current state.
    let eventData = currentState.on?.[eventName as EventKey];

    // If the current state does not have the specific event, check that state
    // for the wildcard event.
    if (!eventData && currentState.on?.["*" as EventKey]) {
      eventData = currentState.on?.["*" as EventKey];
    }

    // If the current state still does not have the event, check the wildcard
    // state for the event.
    const wildcardState = this.states["*"];
    if (!eventData && wildcardState?.on?.[eventName as EventKey]) {
      eventData = wildcardState.on?.[eventName as EventKey];
    }

    // If the wildcard state does not have the event, check the wildcard state
    // for the wildcard event.
    if (!eventData && wildcardState?.on?.["*" as EventKey]) {
      eventData = wildcardState.on?.["*" as EventKey];
    }

    // If no event data is found, return.
    if (!eventData) {
      return;
    }

    if (eventData.action) {
      // Execute the action(s)
      if (Array.isArray(eventData.action)) {
        // Execute all actions in the array
        for (const action of eventData.action) {
          // Use type assertion to make TypeScript happy
          // This is safe because we're only calling the action with events of the right type
          (action as (event: EventObjT) => void)(eventObj);
        }
      } else {
        // Execute the single action
        (eventData.action as (event: EventObjT) => void)(eventObj);
      }
    }

    if (eventData.target) {
      this.currentState = eventData.target;
    }
  }
}
