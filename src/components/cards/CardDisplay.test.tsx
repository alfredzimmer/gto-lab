import { render, screen, fireEvent } from "@testing-library/react";
import CardDisplay from "./CardDisplay";
import type { Card } from "@/lib/types";

describe("CardDisplay", () => {
  it("should render a card correctly", () => {
    const card: Card = { rank: "A", suit: "spades" };
    render(<CardDisplay card={card} />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("♠")).toBeInTheDocument();
  });

  it("should render a placeholder when card is null", () => {
    render(<CardDisplay card={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("should handle click events", () => {
    const handleClick = jest.fn();
    const card: Card = { rank: "K", suit: "hearts" };
    render(
      <CardDisplay card={card} onClick={handleClick} isSelectable={true} />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should handle click events on placeholder", () => {
    const handleClick = jest.fn();
    render(
      <CardDisplay card={null} onClick={handleClick} isSelectable={true} />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should be disabled if not selectable", () => {
    const handleClick = jest.fn();
    render(
      <CardDisplay card={null} onClick={handleClick} isSelectable={false} />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
