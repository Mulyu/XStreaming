// A store's user rating, in the shape each store gives it: Xbox and PlayStation
// publish an average out of five stars, Steam a verdict ("Very Positive",
// "賛否両論") with the share of positive reviews behind it.
export type StoreRating =
  | {kind: 'stars'; average: number; count?: number}
  | {
      kind: 'review';
      label: string;
      sentiment: 'positive' | 'mixed' | 'negative';
      // Share of positive reviews, 0-100.
      percent?: number;
      count?: number;
    };

// Xbox's DisplayCatalog hands out its own genre as one English token; these
// are the ones seen (the translated names live under the XboxGenre.* keys).
export const XBOX_GENRE_KEYS: Record<string, string> = {
  'Action & adventure': 'XboxGenreActionAdventure',
  'Card & board': 'XboxGenreCardBoard',
  Classics: 'XboxGenreClassics',
  'Family & kids': 'XboxGenreFamilyKids',
  Fighting: 'XboxGenreFighting',
  'Multi-player online battle arena': 'XboxGenreMoba',
  Music: 'XboxGenreMusic',
  Platformer: 'XboxGenrePlatformer',
  'Puzzle & trivia': 'XboxGenrePuzzleTrivia',
  'Racing & flying': 'XboxGenreRacingFlying',
  'Role playing': 'XboxGenreRolePlaying',
  Shooter: 'XboxGenreShooter',
  Simulation: 'XboxGenreSimulation',
  Sports: 'XboxGenreSports',
  Strategy: 'XboxGenreStrategy',
};

// Display name of an Xbox genre: the translation when there is one, the
// store's own text otherwise.
export const xboxGenreLabel = (
  category: string,
  t: (key: string) => string,
): string => {
  const key = XBOX_GENRE_KEYS[category];
  return key ? t(key) : category;
};

// "CERO_UNDER_REVIEW" / "ESRB_M" -> "CERO UNDER REVIEW" / "ESRB M".
export const formatPsContentRating = (name: string): string =>
  name.replace(/_/g, ' ').trim();
