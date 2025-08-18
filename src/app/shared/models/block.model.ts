export enum BlockType {
  AIR = 'air',
  DIRT = 'dirt',
  STONE = 'stone',
  SAND = 'sand',
  WATER = 'water',
  WOOD = 'wood',
  LEAVES = 'leaves'
}

export enum ToolType {
  HAND = 'hand',
  PICKAXE = 'pickaxe',
  SPADE = 'spade',
  AXE = 'axe'
}

export interface ProbabilityMapping {
  [BlockType.AIR]: number;
  [BlockType.DIRT]: number;
  [BlockType.STONE]: number;
  [BlockType.SAND]: number;
  [BlockType.WATER]: number;
  [BlockType.WOOD]: number;
  [BlockType.LEAVES]: number;
}

export interface BlockMetadata {
  blockType: BlockType;
  probabilityMappings: {
    horizontalNeighbors: ProbabilityMapping;
    positiveZ: ProbabilityMapping;
    negativeZ: ProbabilityMapping;
  };
  consecutiveWoodCount?: number;
  breakable: boolean;
  requiredTool?: ToolType;
  hardness: number;
  transparent: boolean;
}

export interface Block {
  id: string;
  position: { x: number; y: number; z: number };
  metadata: BlockMetadata;
  isVisible: boolean;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export const BLOCK_PROPERTIES: Record<BlockType, Partial<BlockMetadata>> = {
  [BlockType.AIR]: {
    breakable: false,
    hardness: 0,
    transparent: true
  },
  [BlockType.DIRT]: {
    breakable: true,
    requiredTool: ToolType.HAND,
    hardness: 2,
    transparent: false
  },
  [BlockType.STONE]: {
    breakable: true,
    requiredTool: ToolType.PICKAXE,
    hardness: 5,
    transparent: false
  },
  [BlockType.SAND]: {
    breakable: true,
    requiredTool: ToolType.HAND,
    hardness: 1,
    transparent: false
  },
  [BlockType.WATER]: {
    breakable: false,
    hardness: 0,
    transparent: true
  },
  [BlockType.WOOD]: {
    breakable: true,
    requiredTool: ToolType.AXE,
    hardness: 3,
    transparent: false
  },
  [BlockType.LEAVES]: {
    breakable: true,
    requiredTool: ToolType.HAND,
    hardness: 1,
    transparent: false
  }
};
