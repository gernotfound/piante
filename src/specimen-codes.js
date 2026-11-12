const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function randomSpecimenCode() {
  let code = "";
  while (code.length < 6) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    for (const value of bytes) {
      // 252 è divisibile per 36: evita un bias nella scelta delle lettere.
      if (value < 252) code += ALPHABET[value % 36];
      if (code.length === 6) break;
    }
  }
  return code;
}

export class SpecimenCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = "SpecimenCodeError";
  }
}
