import { verdict } from "./GtoFeedback";

// verdict() now grades a decision by chips given up rather than by the
// solver's frequency for it. Two things decide the label: the noise gate
// (loss <= 2 standard errors reads as clean, because the rollout genuinely
// cannot tell it apart from the mix) and the share-of-pot bands
// (1% / 5% / 15%). This pins both so any future change is a visible diff.

const POT = 20; // 1% = 0.2 BB, 5% = 1 BB, 15% = 3 BB
const EXACT = 0; // no measurement error, so the noise gate never fires

describe("verdict", () => {
  it("reads a loss inside two standard errors as Solid", () => {
    // 2 BB is a 10% -of-pot loss, i.e. a "Leak" band by size alone...
    expect(verdict(2, EXACT, POT).label).toBe("Leak");
    // ...but with an SE of 1 BB the rollout cannot separate it from the mix.
    expect(verdict(2, 1, POT).label).toBe("Solid");
    expect(verdict(2, 0.999999, POT).label).not.toBe("Solid");
  });

  it("treats a negative loss (beating the mix) as Solid", () => {
    expect(verdict(-1.5, 0.1, POT).label).toBe("Solid");
    expect(verdict(0, EXACT, POT).label).toBe("Solid");
  });

  it("classifies below 1% of pot as Solid", () => {
    expect(verdict(0.199999, EXACT, POT).label).toBe("Solid");
    expect(verdict(0.2, EXACT, POT).label).not.toBe("Solid");
  });

  it("classifies 1%-5% of pot as a Slight leak", () => {
    expect(verdict(0.2, EXACT, POT).label).toBe("Slight leak");
    expect(verdict(0.999999, EXACT, POT).label).toBe("Slight leak");
    expect(verdict(1, EXACT, POT).label).not.toBe("Slight leak");
  });

  it("classifies 5%-15% of pot as a Leak", () => {
    expect(verdict(1, EXACT, POT).label).toBe("Leak");
    expect(verdict(2.999999, EXACT, POT).label).toBe("Leak");
    expect(verdict(3, EXACT, POT).label).not.toBe("Leak");
  });

  it("classifies 15%+ of pot as a Big mistake", () => {
    expect(verdict(3, EXACT, POT).label).toBe("Big mistake");
    expect(verdict(50, EXACT, POT).label).toBe("Big mistake");
  });
});
