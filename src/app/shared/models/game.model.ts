import { Block, Vector3 } from './block.model';
import { PlayerState } from './player.model';

export type GameMode = 'menu' | 'playing' | 'crafting' | 'inventory' | 'settings';

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
  showSettings: boolean;
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

export interface GameSettings {
  id?: string;
  mouseSensitivity: number;
  renderDistance: number;
  soundVolume: number;
  musicVolume: number;
  autoSaveInterval: number; // in seconds
  showFPS: boolean;
  showCoordinates: boolean;
  showDebugInfo: boolean;
}

// Default settings
export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 0.002,
  renderDistance: 3,
  soundVolume: 0.5,
  musicVolume: 0.3,
  autoSaveInterval: 60, // every minute
  showFPS: true,
  showCoordinates: true,
  showDebugInfo: false
};

export const RENDER_DISTANCE = 50;
export const WORLD_HEIGHT = 100;
export const GENERATION_LIMIT = 1000;
