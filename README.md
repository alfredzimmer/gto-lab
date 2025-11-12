# Poker Odds Calculator

A minimalist Texas Hold'em poker equity calculator built with Next.js 15, featuring real-time odds calculation and a clean, intuitive interface.

## Features

- **Multi-Player Equity Analysis** - Calculate win probabilities for 2-9 players simultaneously
- **Real-Time Odds Calculation** - Monte Carlo simulation with 10,000 iterations for accurate results
- **Interactive Card Selection** - Click-to-select interface with visual feedback
- **Visual Odds Display** - Pie chart visualization with per-player win percentages
- **Responsive Design** - Optimized for both desktop and mobile viewing
- **Dark Mode Support** - Automatic theme based on system preferences
- **State Persistence** - Automatic save/restore via localStorage

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Poker Engine**: Cactus Kev algorithm with lookup tables
- **Code Quality**: Biome for linting and formatting

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Main equity calculator page
│   ├── layout.tsx            # Root layout with metadata
│   └── play/                 # Play mode section (in development)
├── components/
│   ├── PlayerCard.tsx        # Individual player display
│   ├── PlayersGrid.tsx       # Player cards grid layout
│   ├── PieChart.tsx          # Odds visualization
│   ├── CommunityBoard.tsx    # Board cards display
│   ├── CardSelector.tsx      # Card selection interface
│   ├── CardDisplay.tsx       # Individual card component
│   └── Header.tsx            # Navigation header
├── hooks/
│   └── useEquityCalculator.ts # Main game logic & state
├── lib/
│   ├── calculator.ts         # Monte Carlo simulation engine
│   ├── pokerEvaluator.ts     # Hand evaluation using Cactus Kev
│   ├── deck.ts               # Deck utilities
│   └── types.ts              # TypeScript definitions
```

## Algorithm

The calculator uses two key algorithms:

1. **Hand Evaluation** - Cactus Kev's algorithm with prime number lookup tables for efficient hand comparison
2. **Equity Calculation** - Monte Carlo simulation running 10,000 random board completions to determine win probabilities

## Development

```bash
# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
