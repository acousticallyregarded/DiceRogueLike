/**
 * Playback tempo for authored combat action sheets (attacks, specials,
 * hero consumables, hurt and death clips).
 *
 * The sheets were first timed at one frame every 200ms (5 fps), which made a
 * single attack take up to eight seconds. 10 fps keeps every authored frame
 * while giving turns a snappy rhythm. Idle and walking loops keep their own
 * slower cadence, and GIF-based clips keep their intrinsic GIF timing.
 */
export const ACTION_SHEET_FRAME_MS = 100;

export function actionSheetDurationMs(frames: number): number {
  return frames * ACTION_SHEET_FRAME_MS;
}
