const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%*-_";

function randomIndex(length) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function pick(source) {
  return source[randomIndex(source.length)];
}

export function generateStrongPassword(length = 16) {
  const all = UPPER + LOWER + NUMBERS + SYMBOLS;
  const chars = [pick(UPPER), pick(LOWER), pick(NUMBERS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [chars[index], chars[target]] = [chars[target], chars[index]];
  }
  return chars.join("");
}

export function generateRecoveryCode() {
  const alphabet = UPPER + NUMBERS;
  const block = () => Array.from({ length: 5 }, () => pick(alphabet)).join("");
  return `DEVA-${block()}-${block()}-${block()}`;
}
