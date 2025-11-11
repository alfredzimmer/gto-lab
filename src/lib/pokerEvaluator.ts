export type HandRank = 
  | 'High Card'
  | 'One Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush'
  | 'Royal Flush';

interface HandResult {
  rank: number;
  value: number;
  name: HandRank;
  cards: string[];
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];

const RANK_MAP: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7,
  'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12
};

const SUIT_MAP: Record<string, number> = {
  'c': 0x8000,
  'd': 0x4000,
  'h': 0x2000,
  's': 0x1000
};

function encodeCard(card: string): number {
  const rankChar = card[0];
  const suitChar = card[1];
  
  const rankIdx = RANK_MAP[rankChar];
  const rankBit = 1 << (16 + rankIdx);
  const suitBits = SUIT_MAP[suitChar];
  const rankNibble = rankIdx << 8;
  const prime = PRIMES[rankIdx];
  
  return rankBit | suitBits | rankNibble | prime;
}

let flushLookup: number[] | null = null;
let uniqueLookup: number[] | null = null;
let productLookup: Map<number, number> | null = null;

function initTables() {
  if (flushLookup !== null) return;
  
  flushLookup = new Array(7937).fill(0);
  uniqueLookup = new Array(7937).fill(0);
  productLookup = new Map();
  
  const straightFlushes = [
    [12, 11, 10, 9, 8],
    [11, 10, 9, 8, 7],
    [10, 9, 8, 7, 6],
    [9, 8, 7, 6, 5],
    [8, 7, 6, 5, 4],
    [7, 6, 5, 4, 3],
    [6, 5, 4, 3, 2],
    [5, 4, 3, 2, 1],
    [4, 3, 2, 1, 0],
    [12, 3, 2, 1, 0],
  ];
  
  let handValue = 1;
  for (const straight of straightFlushes) {
    const bits = straight.reduce((acc, r) => acc | (1 << r), 0);
    flushLookup[bits] = handValue++;
  }
  
  handValue = 323;
  const flushCombos: number[][] = [];
  
  for (let a = 12; a >= 4; a--) {
    for (let b = a - 1; b >= 3; b--) {
      for (let c = b - 1; c >= 2; c--) {
        for (let d = c - 1; d >= 1; d--) {
          for (let e = d - 1; e >= 0; e--) {
            const bits = (1 << a) | (1 << b) | (1 << c) | (1 << d) | (1 << e);
            if (flushLookup[bits] === 0) {
              flushLookup[bits] = handValue++;
            }
          }
        }
      }
    }
  }
  
  handValue = 1600;
  for (const straight of straightFlushes) {
    const bits = straight.reduce((acc, r) => acc | (1 << r), 0);
    uniqueLookup[bits] = handValue++;
  }
  
  const products: Array<[number, number]> = [];
  
  handValue = 11;
  for (let four = 12; four >= 0; four--) {
    for (let kicker = 12; kicker >= 0; kicker--) {
      if (kicker !== four) {
        const product = PRIMES[four] ** 4 * PRIMES[kicker];
        products.push([product, handValue++]);
      }
    }
  }
  
  handValue = 167;
  for (let three = 12; three >= 0; three--) {
    for (let pair = 12; pair >= 0; pair--) {
      if (pair !== three) {
        const product = PRIMES[three] ** 3 * PRIMES[pair] ** 2;
        products.push([product, handValue++]);
      }
    }
  }
  
  handValue = 1610;
  for (let three = 12; three >= 0; three--) {
    for (let k1 = 12; k1 >= 1; k1--) {
      if (k1 === three) continue;
      for (let k2 = k1 - 1; k2 >= 0; k2--) {
        if (k2 === three) continue;
        const product = PRIMES[three] ** 3 * PRIMES[k1] * PRIMES[k2];
        products.push([product, handValue++]);
      }
    }
  }
  
  handValue = 2468;
  for (let p1 = 12; p1 >= 1; p1--) {
    for (let p2 = p1 - 1; p2 >= 0; p2--) {
      for (let kicker = 12; kicker >= 0; kicker--) {
        if (kicker !== p1 && kicker !== p2) {
          const product = PRIMES[p1] ** 2 * PRIMES[p2] ** 2 * PRIMES[kicker];
          products.push([product, handValue++]);
        }
      }
    }
  }
  
  handValue = 3326;
  for (let pair = 12; pair >= 0; pair--) {
    for (let k1 = 12; k1 >= 2; k1--) {
      if (k1 === pair) continue;
      for (let k2 = k1 - 1; k2 >= 1; k2--) {
        if (k2 === pair) continue;
        for (let k3 = k2 - 1; k3 >= 0; k3--) {
          if (k3 === pair) continue;
          const product = PRIMES[pair] ** 2 * PRIMES[k1] * PRIMES[k2] * PRIMES[k3];
          products.push([product, handValue++]);
        }
      }
    }
  }
  
  handValue = 6186;
  for (let a = 12; a >= 4; a--) {
    for (let b = a - 1; b >= 3; b--) {
      for (let c = b - 1; c >= 2; c--) {
        for (let d = c - 1; d >= 1; d--) {
          for (let e = d - 1; e >= 0; e--) {
            const bits = (1 << a) | (1 << b) | (1 << c) | (1 << d) | (1 << e);
            if (uniqueLookup[bits] === 0) {
              const product = PRIMES[a] * PRIMES[b] * PRIMES[c] * PRIMES[d] * PRIMES[e];
              products.push([product, handValue++]);
            }
          }
        }
      }
    }
  }
  
  for (const [product, value] of products) {
    productLookup.set(product, value);
  }
}

function eval5Cards(cards: number[]): number {
  initTables();
  
  const allCards = cards.reduce((acc, c) => acc | c, 0);
  
  if ((cards[0] & cards[1] & cards[2] & cards[3] & cards[4] & 0xF000) !== 0) {
    const rankBits = allCards >> 16;
    return flushLookup![rankBits];
  }
  
  const rankBits = allCards >> 16;
  const uniqueVal = uniqueLookup![rankBits];
  if (uniqueVal !== 0) {
    return uniqueVal;
  }
  
  const product = cards.reduce((acc, c) => acc * (c & 0xFF), 1);
  return productLookup!.get(product) || 7462;
}

function valueToRank(value: number): { rank: number; name: HandRank } {
  if (value === 1) return { rank: 9, name: 'Royal Flush' };
  if (value <= 10) return { rank: 8, name: 'Straight Flush' };
  if (value <= 166) return { rank: 7, name: 'Four of a Kind' };
  if (value <= 322) return { rank: 6, name: 'Full House' };
  if (value <= 1599) return { rank: 5, name: 'Flush' };
  if (value <= 1609) return { rank: 4, name: 'Straight' };
  if (value <= 2467) return { rank: 3, name: 'Three of a Kind' };
  if (value <= 3325) return { rank: 2, name: 'Two Pair' };
  if (value <= 6185) return { rank: 1, name: 'One Pair' };
  return { rank: 0, name: 'High Card' };
}

export function evalHand(cards: string[]): HandResult {
  if (cards.length !== 7) {
    throw new Error('Must provide exactly 7 cards');
  }
  
  const encoded = cards.map(encodeCard);
  
  let bestValue = 7463;
  let bestCombo: number[] = [];
  
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      for (let k = j + 1; k < 7; k++) {
        for (let l = k + 1; l < 7; l++) {
          for (let m = l + 1; m < 7; m++) {
            const combo = [encoded[i], encoded[j], encoded[k], encoded[l], encoded[m]];
            const value = eval5Cards(combo);
            
            if (value < bestValue) {
              bestValue = value;
              bestCombo = [i, j, k, l, m];
            }
          }
        }
      }
    }
  }
  
  const { rank, name } = valueToRank(bestValue);
  
  return {
    rank,
    value: bestValue,
    name,
    cards: bestCombo.map(i => cards[i])
  };
}
