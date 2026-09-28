// A refusal is an expected "no" with words a person can read — shown in the
// UI as is. Anything else thrown is a bug.
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refusal";
  }
}

export function refuse(message: string): never {
  throw new Refusal(message);
}
