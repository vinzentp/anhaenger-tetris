// Runs the solver off the main thread so the game stays responsive.
import { CARTON, CATALOG } from './furniture.js';
import { solve } from './solver.js';

self.onmessage = ({ data }) => {
  const result = solve(CATALOG, data.trailer, {
    carton: CARTON,
    timeLimit: data.timeLimit,
    seed: data.seed,
    onBest: (best) => self.postMessage({ type: 'best', best }),
  });
  self.postMessage({ type: 'done', ...result });
};
