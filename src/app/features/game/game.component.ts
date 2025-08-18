import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs';
import { BabylonService } from '../../core/services/babylon.service';
import { TerrainGenerationService } from '../../core/services/terrain-generation.service';
import { GameMechanicsService } from '../../core/services/game-mechanics.service';
import { selectVisibleBlocks, selectPlayerPosition, selectBlockAtPosition } from '../../store/world/world.selectors';
import { selectGameMode, selectTargetBlock, selectIsBreaking, selectBreakingProgress } from '../../store/ui/ui.selectors';
import { selectSelectedItem, selectEquippedTool, selectToolbarItems } from '../../store/player/player.selectors';
import { generateWorld, worldGenerated, updatePlayerPosition } from '../../store/world/world.actions';
import { setTargetBlock, setGameMode } from '../../store/ui/ui.actions';
import { selectInventorySlot } from '../../store/player/player.actions';
import { Block, Vector3, BlockType } from '../../shared/models/block.model';
import { InventoryItem } from '../../shared/models/player.model';
import { GENERATION_LIMIT } from '../../shared/models/game.model';
import { InventoryComponent } from '../inventory/inventory.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, InventoryComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss']
})
export class GameComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private subscriptions = new Subscription();
  private gameLoop?: number;
  private lastFrameTime = 0;
  
  visibleBlocks$: Observable<Map<string, Block>>;
  playerPosition$: Observable<Vector3>;
  gameMode$: Observable<any>;
  targetBlock$: Observable<Vector3 | undefined>;
  isBreaking$: Observable<boolean>;
  breakingProgress$: Observable<number>;
  selectedItem$: Observable<InventoryItem | null>;
  equippedTool$: Observable<any>;
  toolbarItems$: Observable<InventoryItem[]>;
  
  showInventory = false;
  selectedSlot = 0;
  debugInfo = {
    position: '(0, 0, 0)',
    fps: 60,
    blocks: 0
  };

  constructor(
    private store: Store,
    private babylonService: BabylonService,
    private terrainService: TerrainGenerationService,
    private gameMechanics: GameMechanicsService,
    private router: Router
  ) {
    this.visibleBlocks$ = this.store.select(selectVisibleBlocks);
    this.playerPosition$ = this.store.select(selectPlayerPosition);
    this.gameMode$ = this.store.select(selectGameMode);
    this.targetBlock$ = this.store.select(selectTargetBlock);
    this.isBreaking$ = this.store.select(selectIsBreaking);
    this.breakingProgress$ = this.store.select(selectBreakingProgress);
    this.selectedItem$ = this.store.select(selectSelectedItem);
    this.equippedTool$ = this.store.select(selectEquippedTool);
    this.toolbarItems$ = this.store.select(selectToolbarItems);
  }

  ngOnInit(): void {
    // Subscribe to store changes
    this.subscriptions.add(
      this.visibleBlocks$.subscribe(blocks => {
        this.babylonService.updateWorldBlocks(blocks);
        this.debugInfo.blocks = blocks.size;
      })
    );

    this.subscriptions.add(
      this.playerPosition$.subscribe(position => {
        this.babylonService.updatePlayerPosition(position);
        this.debugInfo.position = `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`;
      })
    );

    this.subscriptions.add(
      this.toolbarItems$.subscribe(items => {
        // Update UI with toolbar items
      })
    );
  }

  async ngAfterViewInit(): Promise<void> {
    // Initialize BabylonJS
    await this.babylonService.initializeEngine(this.canvasRef);
    
    // Generate initial world
    this.generateInitialWorld();
    
    // Start game loop
    this.startGameLoop();
    
    // Setup input handlers
    this.setupInputHandlers();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.gameLoop) {
      cancelAnimationFrame(this.gameLoop);
    }
    this.babylonService.dispose();
  }

  private generateInitialWorld(): void {
    const startPosition: Vector3 = { x: 0, y: 0, z: 0 };
    this.store.dispatch(generateWorld({ startPosition, generationLimit: GENERATION_LIMIT }));
    
    // Generate blocks using terrain service
    const blocks = this.terrainService.generateWorld(startPosition, GENERATION_LIMIT);
    this.store.dispatch(worldGenerated({ blocks }));
  }

  private startGameLoop(): void {
    const gameLoop = (currentTime: number) => {
      const deltaTime = currentTime - this.lastFrameTime;
      this.lastFrameTime = currentTime;
      
      // Calculate FPS
      this.debugInfo.fps = Math.round(1000 / deltaTime) || 60;
      
      // Update camera position in store
      const cameraPosition = this.babylonService.getCameraPosition();
      this.store.dispatch(updatePlayerPosition({ position: cameraPosition }));
      
      // Update target block
      const targetBlock = this.babylonService.getTargetedBlock();
      this.store.dispatch(setTargetBlock({ position: targetBlock || undefined }));
      
      // Highlight targeted block
      this.babylonService.highlightBlock(targetBlock);
      
      this.gameLoop = requestAnimationFrame(gameLoop);
    };
    
    this.gameLoop = requestAnimationFrame(gameLoop);
  }

  private setupInputHandlers(): void {
    const canvas = this.canvasRef.nativeElement;
    
    // Mouse click for block breaking
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) { // Left click
        const targetBlock = this.babylonService.getTargetedBlock();
        if (targetBlock) {
          // Get block type from world state
          this.store.select(selectBlockAtPosition).subscribe(getBlock => {
            const block = getBlock(targetBlock.x, targetBlock.y, targetBlock.z);
            if (block) {
              this.store.select(selectEquippedTool).subscribe(tool => {
                this.gameMechanics.startBlockBreaking(targetBlock, block.metadata.blockType, tool || 'hand' as any);
              }).unsubscribe();
            }
          }).unsubscribe();
        }
      }
    });
    
    // Mouse release to stop breaking
    canvas.addEventListener('mouseup', (event) => {
      if (event.button === 0) { // Left click release
        this.gameMechanics.stopBlockBreaking();
      }
    });
    
    // Right click for block placement
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const targetBlock = this.babylonService.getTargetedBlock();
      if (targetBlock) {
        this.store.select(selectSelectedItem).subscribe(selectedItem => {
          if (selectedItem && Object.values(BlockType).includes(selectedItem.type as BlockType)) {
            // Calculate placement position (adjacent to targeted block)
            const placementPos = this.calculatePlacementPosition(targetBlock);
            this.gameMechanics.placeBlockFromInventory(placementPos, selectedItem);
          }
        }).unsubscribe();
      }
    });
    
    // ESC key for menu
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.store.dispatch(setGameMode({ mode: 'menu' }));
        this.router.navigate(['/']);
      }
    });
    
    // Number keys for hotbar selection
    document.addEventListener('keydown', (event) => {
      const key = parseInt(event.key);
      if (key >= 1 && key <= 9) {
        const slotIndex = key - 1;
        this.selectedSlot = slotIndex;
        this.gameMechanics.selectHotbarSlot(slotIndex);
      }
    });
    
    // Tab key for inventory
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        this.showInventory = !this.showInventory;
      }
    });
  }

  private calculatePlacementPosition(targetBlock: Vector3): Vector3 {
    // For simplicity, place above the targeted block
    return {
      x: targetBlock.x,
      y: targetBlock.y,
      z: targetBlock.z + 1
    };
  }

  onInventorySlotSelected(slotIndex: number): void {
    this.selectedSlot = slotIndex;
    this.gameMechanics.selectHotbarSlot(slotIndex);
  }

  onItemUsed(item: InventoryItem): void {
    console.log('Item used:', item);
  }

  getItemIcon(type: any): string {
    const icons: Record<string, string> = {
      'dirt': '🟫',
      'stone': '🪨',
      'sand': '🟨',
      'water': '💧',
      'wood': '🪵',
      'leaves': '🍃',
      'air': '💨',
      'hand': '✋',
      'pickaxe': '⛏️',
      'spade': '🪃',
      'axe': '🪓'
    };
    return icons[type] || '❓';
  }

  getItemName(type: any): string {
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
  }

  getEmptySlots(items: InventoryItem[]): number[] {
    const emptyCount = Math.max(0, 9 - items.length);
    return Array(emptyCount).fill(0).map((_, i) => i);
  }
}
