import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CardSelectorGrid from "./CardSelectorGrid";
import type { Card } from "@/lib/types";

describe("CardSelectorGrid", () => {
  it("should render all 52 cards", () => {
    render(<CardSelectorGrid usedCards={[]} onCardSelect={() => {}} />);
    // 4 suits * 13 ranks = 52 buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(52);
  });

  it("should disable used cards", () => {
    const usedCards: Card[] = [{ rank: "A", suit: "spades" }];
    render(<CardSelectorGrid usedCards={usedCards} onCardSelect={() => {}} />);

    const aceOfSpades = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.includes("A") &&
          button.textContent?.includes("♠"),
      );

    if (!aceOfSpades) throw new Error("Ace of Spades not found");
    expect(aceOfSpades).toBeDisabled();
  });

  it("should call onCardSelect when a card is clicked", () => {
    const handleSelect = jest.fn();
    render(<CardSelectorGrid usedCards={[]} onCardSelect={handleSelect} />);

    const aceOfSpades = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.includes("A") &&
          button.textContent?.includes("♠"),
      );

    if (aceOfSpades) {
      fireEvent.click(aceOfSpades);
      expect(handleSelect).toHaveBeenCalledWith({ rank: "A", suit: "spades" });
    } else {
      throw new Error("Ace of Spades not found");
    }
  });

  it("should not call onCardSelect when a used card is clicked", () => {
    const handleSelect = jest.fn();
    const usedCards: Card[] = [{ rank: "A", suit: "spades" }];
    render(
      <CardSelectorGrid usedCards={usedCards} onCardSelect={handleSelect} />,
    );

    const aceOfSpades = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.includes("A") &&
          button.textContent?.includes("♠"),
      );

    if (aceOfSpades) {
      fireEvent.click(aceOfSpades);
      expect(handleSelect).not.toHaveBeenCalled();
    }
  });
});
