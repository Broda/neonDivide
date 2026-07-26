import { bus, EV } from './EventBus.js';

/**
 * The checkpointing policy, in one place.
 *
 * The game saves when the player enters a room and when a job completes: both
 * are moments where progress is unambiguous and the run is in a resumable
 * shape - nobody is mid-dash, mid-swing or mid-fade.
 *
 * It deliberately does NOT save on death. Reloading therefore rewinds to the
 * start of the room you died in rather than to a corpse, which is the whole
 * point of having a checkpoint.
 *
 * Lives here rather than in WorldScene so the policy is one import away from a
 * headless test, and so "when does the game save" is answerable without
 * reading a 500-line scene.
 */
export const CHECKPOINT_EVENTS = [EV.ROOM_ENTERED, EV.JOB_COMPLETED];

/**
 * Subscribes the given state to the checkpoint events.
 * @returns {() => void} unsubscribe
 */
export function startAutosave(state) {
  const checkpoint = () => state.save();
  for (const event of CHECKPOINT_EVENTS) bus.on(event, checkpoint);

  return function stopAutosave() {
    for (const event of CHECKPOINT_EVENTS) bus.off(event, checkpoint);
  };
}
