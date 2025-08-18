import { createReducer, on } from '@ngrx/store';
import { PlayerState } from '../../shared/models/player.model';
import { ToolType } from '../../shared/models/block.model';
import * as PlayerActions from './player.actions';

export const initialPlayerState: PlayerState = {
  position: { x: 0, y: 0, z: 5 },
  rotation: { x: 0, y: 0, z: 0 },
  inventory: [],
  selectedSlot: 0,
  equippedTool: ToolType.HAND,
  health: 100,
  maxHealth: 100
};

export const playerReducer = createReducer(
  initialPlayerState,

  on(PlayerActions.addItemToInventory, (state, { item }) => {
    const newInventory = [...state.inventory];
    
    // Try to stack with existing item
    const existingItemIndex = newInventory.findIndex(
      (existing) => existing.type === item.type && existing.quantity < existing.maxStack
    );
    
    if (existingItemIndex !== -1) {
      const existingItem = newInventory[existingItemIndex];
      const canAdd = Math.min(item.quantity, existingItem.maxStack - existingItem.quantity);
      
      newInventory[existingItemIndex] = {
        ...existingItem,
        quantity: existingItem.quantity + canAdd
      };
      
      // If we couldn't add all items, create a new stack
      const remaining = item.quantity - canAdd;
      if (remaining > 0) {
        newInventory.push({ ...item, quantity: remaining });
      }
    } else {
      newInventory.push(item);
    }
    
    return {
      ...state,
      inventory: newInventory
    };
  }),

  on(PlayerActions.removeItemFromInventory, (state, { itemId, quantity }) => {
    const newInventory = state.inventory
      .map((item) => {
        if (item.id === itemId) {
          const newQuantity = item.quantity - quantity;
          return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
        }
        return item;
      })
      .filter((item) => item !== null) as typeof state.inventory;
    
    return {
      ...state,
      inventory: newInventory
    };
  }),

  on(PlayerActions.selectInventorySlot, (state, { slotIndex }) => {
    const selectedItem = state.inventory[slotIndex];
    const equippedTool = selectedItem && Object.values(ToolType).includes(selectedItem.type as ToolType) 
      ? selectedItem.type as ToolType 
      : ToolType.HAND;
    
    return {
      ...state,
      selectedSlot: slotIndex,
      equippedTool
    };
  }),

  on(PlayerActions.equipTool, (state, { tool }) => ({
    ...state,
    equippedTool: tool
  })),

  on(PlayerActions.updateHealth, (state, { health }) => ({
    ...state,
    health: Math.max(0, Math.min(health, state.maxHealth))
  })),

  on(PlayerActions.itemCrafted, (state, { result, usedMaterials }) => {
    let newInventory = [...state.inventory];
    
    // Remove used materials
    for (const material of usedMaterials) {
      const materialIndex = newInventory.findIndex((item) => item.id === material.id);
      if (materialIndex !== -1) {
        const item = newInventory[materialIndex];
        const newQuantity = item.quantity - material.quantity;
        if (newQuantity <= 0) {
          newInventory.splice(materialIndex, 1);
        } else {
          newInventory[materialIndex] = { ...item, quantity: newQuantity };
        }
      }
    }
    
    // Add crafted item
    const existingResultIndex = newInventory.findIndex(
      (item) => item.type === result.type && item.quantity < item.maxStack
    );
    
    if (existingResultIndex !== -1) {
      const existingItem = newInventory[existingResultIndex];
      newInventory[existingResultIndex] = {
        ...existingItem,
        quantity: existingItem.quantity + result.quantity
      };
    } else {
      newInventory.push(result);
    }
    
    return {
      ...state,
      inventory: newInventory
    };
  })
);
