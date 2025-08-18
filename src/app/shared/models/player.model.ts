import { ToolType, BlockType } from './block.model';

export interface InventoryItem {
  id: string;
  type: BlockType | ToolType;
  quantity: number;
  maxStack: number;
}

export interface PlayerState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  inventory: InventoryItem[];
  selectedSlot: number;
  equippedTool?: ToolType;
  health: number;
  maxHealth: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  pattern: (BlockType | ToolType | null)[][];
  result: {
    type: BlockType | ToolType;
    quantity: number;
  };
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'pickaxe',
    name: 'Stone Pickaxe',
    pattern: [
      [BlockType.STONE, BlockType.STONE, BlockType.STONE],
      [null, BlockType.WOOD, null],
      [null, BlockType.WOOD, null]
    ],
    result: {
      type: ToolType.PICKAXE,
      quantity: 1
    }
  },
  {
    id: 'spade',
    name: 'Stone Spade',
    pattern: [
      [null, BlockType.STONE, null],
      [null, BlockType.WOOD, null],
      [null, BlockType.WOOD, null]
    ],
    result: {
      type: ToolType.SPADE,
      quantity: 1
    }
  },
  {
    id: 'axe',
    name: 'Stone Axe',
    pattern: [
      [BlockType.STONE, BlockType.STONE, null],
      [BlockType.STONE, BlockType.WOOD, null],
      [null, BlockType.WOOD, null]
    ],
    result: {
      type: ToolType.AXE,
      quantity: 1
    }
  },
  {
    id: 'wood_pickaxe',
    name: 'Wood Pickaxe',
    pattern: [
      [BlockType.WOOD, BlockType.WOOD, BlockType.WOOD],
      [null, BlockType.WOOD, null],
      [null, BlockType.WOOD, null]
    ],
    result: {
      type: ToolType.PICKAXE,
      quantity: 1
    }
  }
];
