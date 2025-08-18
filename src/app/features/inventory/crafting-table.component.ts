import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryItem, CraftingRecipe, CRAFTING_RECIPES } from '../../shared/models/player.model';
import { BlockType, ToolType } from '../../shared/models/block.model';

@Component({
  selector: 'app-crafting-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './crafting-table.component.html',
  styleUrls: ['./crafting-table.component.scss']
})
export class CraftingTableComponent implements OnInit {
  @Input() inventory: InventoryItem[] = [];
  @Input() selectedSlots: (string | null)[][] = [];
  @Output() slotSelected = new EventEmitter<{row: number, col: number, itemId: string | null}>();
  @Output() craftItem = new EventEmitter<{recipe: CraftingRecipe, materials: InventoryItem[]}>();
  @Output() close = new EventEmitter<void>();

  craftingGrid: (InventoryItem | null)[][] = [];
  availableRecipes: CraftingRecipe[] = CRAFTING_RECIPES;
  currentRecipe: CraftingRecipe | null = null;

  ngOnInit(): void {
    this.initializeCraftingGrid();
  }

  initializeCraftingGrid(): void {
    this.craftingGrid = Array(3).fill(null).map(() => Array(3).fill(null));
  }

  selectCraftingSlot(row: number, col: number): void {
    // For simplicity, we'll cycle through available items
    const availableItems = this.inventory.filter(item => item.quantity > 0);
    if (availableItems.length === 0) return;

    const currentItem = this.craftingGrid[row][col];
    let nextIndex = 0;
    
    if (currentItem) {
      const currentIndex = availableItems.findIndex(item => item.id === currentItem.id);
      nextIndex = (currentIndex + 1) % (availableItems.length + 1);
    }

    if (nextIndex === availableItems.length) {
      this.craftingGrid[row][col] = null;
      this.slotSelected.emit({ row, col, itemId: null });
    } else {
      this.craftingGrid[row][col] = availableItems[nextIndex];
      this.slotSelected.emit({ row, col, itemId: availableItems[nextIndex].id });
    }

    this.checkForRecipe();
  }

  checkForRecipe(): void {
    this.currentRecipe = null;
    
    for (const recipe of this.availableRecipes) {
      if (this.matchesPattern(recipe.pattern)) {
        this.currentRecipe = recipe;
        break;
      }
    }
  }

  matchesPattern(pattern: (BlockType | ToolType | null)[][]): boolean {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const patternItem = pattern[row][col];
        const gridItem = this.craftingGrid[row][col];
        
        if (patternItem === null && gridItem !== null) return false;
        if (patternItem !== null && (gridItem === null || gridItem.type !== patternItem)) return false;
      }
    }
    return true;
  }

  craft(): void {
    if (!this.currentRecipe) return;

    const materials: InventoryItem[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const item = this.craftingGrid[row][col];
        if (item) {
          materials.push({ ...item, quantity: 1 });
        }
      }
    }

    this.craftItem.emit({ recipe: this.currentRecipe, materials });
    this.initializeCraftingGrid();
    this.currentRecipe = null;
  }

  closeCraftingTable(): void {
    this.close.emit();
  }

  getItemIcon(type: BlockType | ToolType): string {
    const icons: Record<BlockType | ToolType, string> = {
      [BlockType.DIRT]: '🟫',
      [BlockType.STONE]: '🪨',
      [BlockType.SAND]: '🟨',
      [BlockType.WATER]: '💧',
      [BlockType.WOOD]: '🪵',
      [BlockType.LEAVES]: '🍃',
      [BlockType.AIR]: '💨',
      [ToolType.HAND]: '✋',
      [ToolType.PICKAXE]: '⛏️',
      [ToolType.SPADE]: '🪃',
      [ToolType.AXE]: '🪓'
    };
    return icons[type] || '❓';
  }

  getItemName(type: BlockType | ToolType): string {
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
  }
}
