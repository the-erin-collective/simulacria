import { createAction, props } from '@ngrx/store';
import { InventoryItem } from '../../shared/models/player.model';
import { ToolType, BlockType } from '../../shared/models/block.model';

export const addItemToInventory = createAction(
  '[Player] Add Item To Inventory',
  props<{ item: InventoryItem }>()
);

export const removeItemFromInventory = createAction(
  '[Player] Remove Item From Inventory',
  props<{ itemId: string; quantity: number }>()
);

export const selectInventorySlot = createAction(
  '[Player] Select Inventory Slot',
  props<{ slotIndex: number }>()
);

export const equipTool = createAction(
  '[Player] Equip Tool',
  props<{ tool: ToolType }>()
);

export const updateHealth = createAction(
  '[Player] Update Health',
  props<{ health: number }>()
);

export const craftItem = createAction(
  '[Player] Craft Item',
  props<{ recipeId: string; materials: InventoryItem[] }>()
);

export const itemCrafted = createAction(
  '[Player] Item Crafted',
  props<{ result: InventoryItem; usedMaterials: InventoryItem[] }>()
);
