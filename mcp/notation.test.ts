/**
 * Unit tests for the friendly ↔ internal `History` translation — the only new
 * game-facing code in the MCP surface, and the part most likely to
 * mistranslate an agent's input. Pure logic, no ONNX or network.
 */

import { STACK, currentPlayer, parseHistory } from "../src/lib/gto/holdem";
import {
  buildHistory,
  buildPublicTokens,
  cardToStr,
  parseCard,
  parseCards,
  parseSeat,
  resolveActionToken,
} from "./notation";

describe("card parsing", () => {
  test.each([
    ["Ac", 12], // ace of clubs: suit 0 * 13 + rank 12
    ["2c", 0], // deuce of clubs: the zero card
    ["As", 51], // ace of spades: suit 3 * 13 + rank 12
    ["Kd", 24], // king of diamonds: suit 1 * 13 + rank 11
    ["Th", 34], // ten of hearts: suit 2 * 13 + rank 8
  ])('parseCard("%s") === %i', (raw, expected) => {
    expect(parseCard(raw)).toBe(expected);
  });

  test("is case-insensitive and accepts 10 for T", () => {
    expect(parseCard("as")).toBe(parseCard("As"));
    expect(parseCard("10d")).toBe(parseCard("Td"));
  });

  test("round-trips through cardToStr", () => {
    for (let c = 0; c < 52; c++) expect(parseCard(cardToStr(c))).toBe(c);
  });

  test("rejects bad rank / suit", () => {
    expect(() => parseCard("Xs")).toThrow(/rank/);
    expect(() => parseCard("Az")).toThrow(/suit/);
  });

  test("parseCards splits spaces, commas, and packed strings", () => {
    const expected = [parseCard("Jh"), parseCard("7c"), parseCard("2s")];
    expect(parseCards("Jh 7c 2s")).toEqual(expected);
    expect(parseCards("Jh,7c,2s")).toEqual(expected);
    expect(parseCards("Jh7c2s")).toEqual(expected);
    expect(parseCards(["Jh", "7c", "2s"])).toEqual(expected);
    expect(parseCards(undefined)).toEqual([]);
    expect(parseCards("")).toEqual([]);
  });
});

describe("parseSeat", () => {
  test.each([
    ["SB", 0],
    ["btn", 0],
    ["Button", 0],
    ["BB", 1],
    ["big blind", 1],
    [0, 0],
    [1, 1],
  ])("parseSeat(%s) === %i", (raw, expected) => {
    expect(parseSeat(raw as string | number)).toBe(expected);
  });

  test("throws on missing / unrecognized", () => {
    expect(() => parseSeat(undefined)).toThrow();
    expect(() => parseSeat("cutoff")).toThrow(/position/);
  });
});

describe("resolveActionToken", () => {
  // Preflop, SB to act — the canonical first decision. Placeholder holes.
  const preflop = [51, 50, 24, 23];

  test("maps keyword actions", () => {
    expect(resolveActionToken("check/call", preflop, STACK)).toBe("c");
    expect(resolveActionToken("call", preflop, STACK)).toBe("c");
    expect(resolveActionToken("jam", preflop, STACK)).toBe("a");
    expect(resolveActionToken("all-in", preflop, STACK)).toBe("a");
  });

  test("fold is illegal when nothing is owed (SB can complete)", () => {
    // Preflop SB faces the BB, so fold *is* legal here; test an illegal fold
    // after a check instead: on the flop, first to act cannot fold.
    const flop = [51, 50, 24, 23, "c", "c", 0, 1, 2];
    expect(() => resolveActionToken("fold", flop, STACK)).toThrow(/illegal/);
  });

  test("maps size words to the discrete sizes", () => {
    expect(resolveActionToken("bet half pot", preflop, STACK)).toBe("b0");
    expect(resolveActionToken("raise pot", preflop, STACK)).toBe("b1");
    expect(resolveActionToken("overbet", preflop, STACK)).toBe("b2");
  });

  test("snaps a numeric BB size to the nearest legal size", () => {
    // Legal preflop raise amounts (BB): b0=2, b1=3, b2=5 (see engine).
    expect(resolveActionToken("raise 2", preflop, STACK)).toBe("b0");
    expect(resolveActionToken("raise to 3", preflop, STACK)).toBe("b1");
    expect(resolveActionToken("raise 6", preflop, STACK)).toBe("b2"); // nearest to 5
  });

  test("check keyword is not swallowed by a stray number", () => {
    expect(resolveActionToken("BB check 0", preflop, STACK)).toBe("c");
  });
});

describe("buildHistory", () => {
  test("places hero cards in the hero's slot and fills the villain", () => {
    const { history, heroSeat } = buildHistory({
      hero: "As Ks",
      heroSeat: 0,
      stack: STACK,
    });
    expect(heroSeat).toBe(0);
    expect(history[0]).toBe(parseCard("As"));
    expect(history[1]).toBe(parseCard("Ks"));
    // villain slots are distinct placeholder cards
    expect(history[2]).not.toBe(history[0]);
    expect(currentPlayer(history)).toBe(0); // preflop, SB to act
  });

  test("interleaves the board into the line at street boundaries", () => {
    const { history } = buildHistory({
      hero: "Ah Kd",
      heroSeat: 0,
      board: "Jh 7c 2s",
      line: ["SB raise 3", "BB call", "BB check"],
      stack: STACK,
    });
    const s = parseHistory(history, STACK);
    expect(s.street).toBe(1); // flop
    expect(s.board).toEqual([
      parseCard("Jh"),
      parseCard("7c"),
      parseCard("2s"),
    ]);
    expect(s.status).toBe("act"); // stopped at a decision node
    expect(s.toAct).toBe(0); // SB acts first postflop after BB checks
  });

  test("rejects two-card hero of wrong length", () => {
    expect(() =>
      buildHistory({ hero: "As", heroSeat: 0, stack: STACK }),
    ).toThrow();
  });

  test("errors when the line needs board cards that weren't given", () => {
    expect(() =>
      buildHistory({
        hero: "Ah Kd",
        heroSeat: 0,
        line: ["SB raise 3", "BB call", "BB check"], // reaches the flop
        stack: STACK, // ...but no board supplied
      }),
    ).toThrow(/board/);
  });

  test("errors when the line runs past the end of the hand", () => {
    expect(() =>
      buildHistory({
        hero: "Ah Kd",
        heroSeat: 0,
        line: ["SB fold", "BB check"], // fold ends the hand
        stack: STACK,
      }),
    ).toThrow(/past the end/);
  });
});

describe("buildPublicTokens", () => {
  test("produces board+action tokens with no hole cards", () => {
    const tokens = buildPublicTokens({ line: ["SB raise 3"], stack: STACK });
    // first token is the SB's raise, since holes are stripped
    expect(tokens[0]).toBe("b1");
  });
});
