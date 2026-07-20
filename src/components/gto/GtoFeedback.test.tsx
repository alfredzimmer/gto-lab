import { verdict } from "./GtoFeedback";

// verdict()'s thresholds (0.9 relative, 0.33/0.15/0.05 absolute) are the
// magic numbers that classify a user's decision as good or bad against the
// solver's strategy. This pins their exact boundaries down so any future
// change to them is a deliberate, visible diff rather than a silent drift.

describe("verdict", () => {
  it("classifies as Solid when within 90% of the best action's probability", () => {
    // bestProb small enough that the 0.33 absolute floor doesn't also fire.
    expect(verdict(0.27, 0.3).label).toBe("Solid"); // exactly bestProb * 0.9
    expect(verdict(0.269999, 0.3).label).not.toBe("Solid");
  });

  it("classifies as Solid when userProb clears the 0.33 absolute floor", () => {
    // bestProb high enough that the relative threshold doesn't fire.
    expect(verdict(0.33, 1.0).label).toBe("Solid");
    expect(verdict(0.329999, 1.0).label).not.toBe("Solid");
  });

  it("classifies as Part of the mix between 0.15 and the Solid thresholds", () => {
    expect(verdict(0.15, 1.0).label).toBe("Part of the mix");
    expect(verdict(0.149999, 1.0).label).not.toBe("Part of the mix");
    expect(verdict(0.329999, 1.0).label).toBe("Part of the mix");
  });

  it("classifies as Marginal between 0.05 and 0.15", () => {
    expect(verdict(0.05, 1.0).label).toBe("Marginal");
    expect(verdict(0.049999, 1.0).label).not.toBe("Marginal");
    expect(verdict(0.149999, 1.0).label).toBe("Marginal");
  });

  it("classifies as Mistake below 0.05", () => {
    expect(verdict(0.049999, 1.0).label).toBe("Mistake");
    expect(verdict(0, 1.0).label).toBe("Mistake");
  });
});
