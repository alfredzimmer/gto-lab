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



## Getting Started

```bash
npm install

npm run dev

npm run build

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
├── store/
│   └── useGameStore.ts       # Global state management (Zustand)
├── lib/
│   ├── calculator.ts         # Monte Carlo simulation engine
│   ├── pokerEvaluator.ts     # Hand evaluation using Cactus Kev
│   ├── deck.ts               # Deck utilities
│   └── types.ts              # TypeScript definitions
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
