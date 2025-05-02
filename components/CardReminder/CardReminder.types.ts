export interface Card {
  at: string;
  do: string;
  active: boolean;
  $id: string;
}

export type CardProps = {
  card: Card;
};
