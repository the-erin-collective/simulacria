import { Block, Vector3 } from './block.model';
import { PlayerState } from './player.model';

export type GameMode = 'menu' | 'playing' | 'crafting' | 'inventory';

export interface GameState {
  world: WorldState;
  player: PlayerState;
  ui: UIState;
  performance: PerformanceState;
}

export interface WorldState {
  blocks: Map<string, Block>;
  renderDistance: number;
  playerPosition: Vector3;
  generatedBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export interface UIState {
  gameMode: GameMode;
  showInventory: boolean;
  showCraftingTable: boolean;
  targetBlock?: Vector3;
  breakingProgress: number;
  isBreaking: boolean;
  selectedCraftingSlots: (string | null)[][];
}

export interface PerformanceState {
  fps: number;
  blocksRendered: number;
  chunksLoaded: number;
  lastFrameTime: number;
}

export const RENDER_DISTANCE = 50;
export const WORLD_HEIGHT = 100;
export const GENERATION_LIMIT = 1000;
