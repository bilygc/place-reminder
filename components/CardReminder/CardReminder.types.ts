export interface Card {
  at: string;
  do: string;
  active: boolean;
  $id: string;
}

/**
 * Callback signature shared by all three card tap targets. Later stories
 * (edit / toggle / delete) receive the reminder id so they can resolve the
 * document themselves.
 */
export type CardAction = (id: string) => void;

export type CardProps = {
  card: Card;
  /**
   * Tap target covering the body (At / Do / Active rows). The left status
   * bell is intentionally NOT part of this target and is not pressable.
   */
  onPressBody?: CardAction;
  /** Top-right toggle bell tap target. */
  onPressBell?: CardAction;
  /** Bottom-right trash tap target. */
  onPressTrash?: CardAction;
};
