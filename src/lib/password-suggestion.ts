const PASSWORD_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%^&*_-+=",
] as const;

const PASSWORD_CHARACTERS = PASSWORD_GROUPS.join("");

export const SUGGESTED_PASSWORD_LENGTH = 20;

function secureIndex(max: number): number {
  if (max < 1) throw new Error("Password character set cannot be empty");

  const values = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do {
    globalThis.crypto.getRandomValues(values);
  } while (values[0] >= limit);

  return values[0] % max;
}

function randomCharacter(characters: string): string {
  return characters[secureIndex(characters.length)];
}

export function generateSuggestedPassword(
  length = SUGGESTED_PASSWORD_LENGTH
): string {
  if (length < PASSWORD_GROUPS.length) {
    throw new Error("Suggested passwords must include every character group");
  }

  const characters = PASSWORD_GROUPS.map(randomCharacter);
  while (characters.length < length) {
    characters.push(randomCharacter(PASSWORD_CHARACTERS));
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }

  return characters.join("");
}
