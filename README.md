# Poker Equity Playground

A real-time Texas Hold'em equity calculator and practice tool designed to help players improve their decision-making.

## Features

- **Equity Calculator**: Real-time win probabilities for up to 9 players using Monte Carlo simulations.
- **Practice Mode**: Interactive scenarios to train pot odds and equity intuition.
- **Performance Tracking**: Dashboard to monitor EV (Expected Value) and decision accuracy.
- **Responsive Design**: Fully optimized for desktop and mobile devices.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL)
- **Testing**: Jest & React Testing Library

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/alfredzimmer/poker-equity-playground.git
   cd poker-equity-playground
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Copy `.env.example` to `.env.local` and add your Supabase credentials.

4. **Run the development server**
   ```bash
   npm run dev
   ```

## Testing

- Run unit & integration tests: `npm test`
- Run performance benchmarks: `npm run test:perf`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
