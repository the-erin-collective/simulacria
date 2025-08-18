import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryItem } from '../../shared/models/player.model';
import { BlockType, ToolType } from '../../shared/models/block.model';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss']
})
export class InventoryComponent {
  @Input() items: InventoryItem[] = [];
  @Input() selectedSlot: number = 0;
  @Output() slotSelected = new EventEmitter<number>();
  @Output() itemUsed = new EventEmitter<InventoryItem>();

  selectSlot(index: number): void {
    this.slotSelected.emit(index);
  }

  useItem(item: InventoryItem): void {
    this.itemUsed.emit(item);
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
