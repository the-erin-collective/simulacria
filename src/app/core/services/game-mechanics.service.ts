import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { BlockType, ToolType, Vector3, BLOCK_PROPERTIES } from '../../shared/models/block.model';
import { InventoryItem } from '../../shared/models/player.model';
import { 
  addItemToInventory, 
  removeItemFromInventory, 
  selectInventorySlot,
  itemCrafted 
} from '../../store/player/player.actions';
import { 
  breakBlock, 
  blockBroken, 
  placeBlock 
} from '../../store/world/world.actions';
import { 
  startBreaking, 
  stopBreaking, 
  updateBreakingProgress 
} from '../../store/ui/ui.actions';

@Injectable({
  providedIn: 'root'
})
export class GameMechanicsService {
  private breakingTimer?: number;
  private breakingStartTime = 0;
  private isBreaking = false;

  constructor(private store: Store) {}

  startBlockBreaking(
    position: Vector3, 
    blockType: BlockType, 
    equippedTool: ToolType
  ): void {
    if (this.isBreaking) return;

    const blockProperties = BLOCK_PROPERTIES[blockType];
    if (!blockProperties.breakable) return;

    // Check if player has required tool
    if (blockProperties.requiredTool && blockProperties.requiredTool !== equippedTool) {
      console.log(`Requires ${blockProperties.requiredTool} to break this block`);
      return;
    }

    this.isBreaking = true;
    this.breakingStartTime = Date.now();
    this.store.dispatch(startBreaking());

    // Calculate breaking time based on hardness and tool
    const baseTime = blockProperties.hardness! * 1000; // Convert to milliseconds
    const toolMultiplier = this.getToolEffectiveness(equippedTool, blockType);
    const breakingTime = baseTime / toolMultiplier;

    // Start breaking animation
    this.breakingTimer = window.setInterval(() => {
      const elapsed = Date.now() - this.breakingStartTime;
      const progress = Math.min((elapsed / breakingTime) * 100, 100);
      
      this.store.dispatch(updateBreakingProgress({ progress }));

      if (progress >= 100) {
        this.completeBlockBreaking(position, blockType);
      }
    }, 50);
  }

  stopBlockBreaking(): void {
    if (!this.isBreaking) return;

    this.isBreaking = false;
    if (this.breakingTimer) {
      clearInterval(this.breakingTimer);
      this.breakingTimer = undefined;
    }
    
    this.store.dispatch(stopBreaking());
  }

  private completeBlockBreaking(position: Vector3, blockType: BlockType): void {
    this.stopBlockBreaking();

    // Dispatch break block action
    this.store.dispatch(breakBlock({ position }));

    // Create dropped item
    const droppedItem: InventoryItem = {
      id: this.generateItemId(),
      type: blockType,
      quantity: 1,
      maxStack: this.getMaxStackSize(blockType)
    };

    // Add to inventory
    this.store.dispatch(addItemToInventory({ item: droppedItem }));

    // Dispatch block broken action for world state
    this.store.dispatch(blockBroken({ position, droppedItems: [droppedItem] }));
  }

  placeBlockFromInventory(
    position: Vector3, 
    selectedItem: InventoryItem | null
  ): void {
    if (!selectedItem || !Object.values(BlockType).includes(selectedItem.type as BlockType)) {
      return;
    }

    const blockType = selectedItem.type as BlockType;
    
    // Create block metadata
    const blockMetadata = this.createBlockMetadata(blockType);
    
    // Create new block
    const newBlock = {
      id: this.generateBlockId(),
      position: { ...position },
      metadata: blockMetadata,
      isVisible: blockType !== BlockType.AIR
    };

    // Place block in world
    this.store.dispatch(placeBlock({ position, block: newBlock }));

    // Remove item from inventory
    this.store.dispatch(removeItemFromInventory({ 
      itemId: selectedItem.id, 
      quantity: 1 
    }));
  }

  selectHotbarSlot(slotIndex: number): void {
    if (slotIndex >= 0 && slotIndex < 9) {
      this.store.dispatch(selectInventorySlot({ slotIndex }));
    }
  }

  craftItem(recipeId: string, materials: InventoryItem[]): void {
    // Find recipe and validate materials
    // For now, create a simple pickaxe craft
    if (recipeId === 'pickaxe') {
      const craftedItem: InventoryItem = {
        id: this.generateItemId(),
        type: ToolType.PICKAXE,
        quantity: 1,
        maxStack: 1
      };

      this.store.dispatch(itemCrafted({ 
        result: craftedItem, 
        usedMaterials: materials 
      }));
    }
  }

  private getToolEffectiveness(tool: ToolType, blockType: BlockType): number {
    const effectiveness: Record<ToolType, Record<BlockType, number>> = {
      [ToolType.HAND]: {
        [BlockType.DIRT]: 1.0,
        [BlockType.SAND]: 1.2,
        [BlockType.LEAVES]: 1.5,
        [BlockType.STONE]: 0.2,
        [BlockType.WOOD]: 0.3,
        [BlockType.WATER]: 0,
        [BlockType.AIR]: 0
      },
      [ToolType.PICKAXE]: {
        [BlockType.STONE]: 3.0,
        [BlockType.DIRT]: 1.2,
        [BlockType.SAND]: 1.2,
        [BlockType.WOOD]: 0.5,
        [BlockType.LEAVES]: 1.0,
        [BlockType.WATER]: 0,
        [BlockType.AIR]: 0
      },
      [ToolType.SPADE]: {
        [BlockType.DIRT]: 3.0,
        [BlockType.SAND]: 3.5,
        [BlockType.STONE]: 0.3,
        [BlockType.WOOD]: 0.5,
        [BlockType.LEAVES]: 1.0,
        [BlockType.WATER]: 0,
        [BlockType.AIR]: 0
      },
      [ToolType.AXE]: {
        [BlockType.WOOD]: 4.0,
        [BlockType.LEAVES]: 2.0,
        [BlockType.DIRT]: 0.8,
        [BlockType.SAND]: 0.8,
        [BlockType.STONE]: 0.2,
        [BlockType.WATER]: 0,
        [BlockType.AIR]: 0
      }
    };

    return effectiveness[tool]?.[blockType] || 1.0;
  }

  private createBlockMetadata(blockType: BlockType) {
    const properties = BLOCK_PROPERTIES[blockType];
    return {
      blockType,
      probabilityMappings: {
        horizontalNeighbors: this.getDefaultProbabilityMapping(),
        positiveZ: this.getDefaultProbabilityMapping(),
        negativeZ: this.getDefaultProbabilityMapping()
      },
      breakable: properties.breakable || false,
      requiredTool: properties.requiredTool,
      hardness: properties.hardness || 0,
      transparent: properties.transparent || false
    };
  }

  private getDefaultProbabilityMapping() {
    return {
      [BlockType.AIR]: 0,
      [BlockType.DIRT]: 100,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    };
  }

  private getMaxStackSize(blockType: BlockType): number {
    const stackSizes: Record<BlockType, number> = {
      [BlockType.DIRT]: 64,
      [BlockType.STONE]: 64,
      [BlockType.SAND]: 64,
      [BlockType.WOOD]: 64,
      [BlockType.LEAVES]: 64,
      [BlockType.WATER]: 1,
      [BlockType.AIR]: 1
    };
    return stackSizes[blockType] || 64;
  }

  private generateItemId(): string {
    return 'item_' + Math.random().toString(36).substr(2, 9);
  }

  private generateBlockId(): string {
    return 'block_' + Math.random().toString(36).substr(2, 9);
  }
}
