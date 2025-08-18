import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable, Subscription, take } from 'rxjs';
import { BabylonService } from '../../core/services/babylon.service';
import { TerrainGenerationService } from '../../core/services/terrain-generation.service';
import { GameMechanicsService } from '../../core/services/game-mechanics.service';
import { MouseControlService } from '../../core/services/mouse-control.service';
import { PlayerSpawningService } from '../../core/services/player-spawning.service';
import { ChunkManagerService } from '../../core/services/chunk-manager.service';
import { DBService } from '../../core/services/db.service';
import { selectVisibleBlocks, selectPlayerPosition, selectBlockAtPosition } from '../../store/world/world.selectors';
import { selectGameMode, selectTargetBlock, selectIsBreaking, selectBreakingProgress } from '../../store/ui/ui.selectors';
import { selectSelectedItem, selectEquippedTool, selectToolbarItems } from '../../store/player/player.selectors';
import { generateWorld, worldGenerated, updatePlayerPosition } from '../../store/world/world.actions';
import { setTargetBlock, setGameMode } from '../../store/ui/ui.actions';
import { selectInventorySlot } from '../../store/player/player.actions';
import { Block, Vector3, BlockType } from '../../shared/models/block.model';
import { InventoryItem } from '../../shared/models/player.model';
import { GENERATION_LIMIT, GameSettings, DEFAULT_SETTINGS } from '../../shared/models/game.model';
import { InventoryComponent } from '../inventory/inventory.component';
import { SettingsModalComponent } from '../settings/settings-modal.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, InventoryComponent, SettingsModalComponent],
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
  showSettings = false;
  selectedSlot = 0;
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  debugInfo = {
    position: '(0, 0, 0)',
    fps: 60,
    blocks: 0
  };
  private saveInterval?: number; // For auto-save
  private lastPlayerSaveTime = 0; // For debouncing player position saves

  constructor(
    private store: Store,
    private babylonService: BabylonService,
    private terrainService: TerrainGenerationService,
    private gameMechanics: GameMechanicsService,
    private mouseControlService: MouseControlService,
    private playerSpawningService: PlayerSpawningService,
    private chunkManagerService: ChunkManagerService,
    private dbService: DBService,
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
    // Load settings
    this.loadSettings();
    
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
    
    // Generate initial world with surface spawn
    await this.generateInitialWorld();
    
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
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.mouseControlService.dispose();
    this.babylonService.dispose();
    
    // Save game state before exit
    this.chunkManagerService.saveAllChunks();
  }

  private async generateInitialWorld(): Promise<void> {
    console.log('Generating initial world...');
    
    // Try to load existing world first
    const worldLoaded = await this.chunkManagerService.loadWorld();
    
    if (worldLoaded) {
      console.log('Found existing world, loading...');
      // If a world exists, load player position from database
      const playerState = await this.dbService.loadPlayerState();
      
      if (playerState && playerState.position) {
        console.log(`Loaded player position: (${playerState.position.x}, ${playerState.position.y}, ${playerState.position.z})`);
        this.store.dispatch(updatePlayerPosition({ position: playerState.position }));
      } else {
        // If no player position, find a safe spawn
        const startPosition = await this.playerSpawningService.findSafeSpawnPosition();
        this.store.dispatch(updatePlayerPosition({ position: startPosition }));
      }
      
      // Load chunks around player
      const playerPosition = this.babylonService.getCameraPosition();
      await this.chunkManagerService.loadChunksAroundPlayer(playerPosition.x, playerPosition.y, playerPosition.z);
      
      // Get all blocks in render distance
      const blocks = await this.chunkManagerService.getVisibleBlocks(
        playerPosition.x, playerPosition.y, playerPosition.z
      );
      
      this.store.dispatch(worldGenerated({ blocks }));
    } else {
      console.log('No existing world found, generating new world...');
      // Create a new world
      await this.chunkManagerService.createNewWorld();
      
      // Find a safe spawn position on the surface
      const startPosition = await this.playerSpawningService.findSafeSpawnPosition();
      
      this.store.dispatch(generateWorld({ startPosition, generationLimit: GENERATION_LIMIT }));
      
      // Generate blocks using terrain service
      const blocks = this.terrainService.generateWorld(startPosition, GENERATION_LIMIT);
      this.store.dispatch(worldGenerated({ blocks }));
      
      // Set initial player position at the spawn point
      this.store.dispatch(updatePlayerPosition({ position: startPosition }));
      
      // Import generated world into chunk-based storage
      await this.chunkManagerService.importFromFlatWorld(blocks);
    }
    
    // Setup auto-save interval
    this.setupAutoSave();
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
      
      // Save player position to database for persistence
      this.savePlayerPosition(cameraPosition);
      
      this.gameLoop = requestAnimationFrame(gameLoop);
    };
    
    this.gameLoop = requestAnimationFrame(gameLoop);
  }
  
  // Save player position to database
  private savePlayerPosition(position: Vector3): void {
    // Don't save too frequently - use a debounce
    const now = Date.now();
    if (now - this.lastPlayerSaveTime > 5000) { // Save every 5 seconds
      this.lastPlayerSaveTime = now;
      
      // Get current player state
      this.store.select(selectSelectedItem).pipe(take(1)).subscribe(selectedItem => {
        this.store.select(selectToolbarItems).pipe(take(1)).subscribe(toolbarItems => {
          // Save player state to database
          this.dbService.savePlayerState({
            position,
            inventory: toolbarItems || [],
            selectedSlot: this.selectedSlot,
            health: 10, // Default full health
            lastSaved: now
          });
        });
      });
    }
  }

  private setupInputHandlers(): void {
    const canvas = this.canvasRef.nativeElement;
    
    // Initialize mouse control service with camera and canvas
    if (this.babylonService.getCamera()) {
      this.mouseControlService.initialize(this.babylonService.getCamera(), canvas);
      this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
    }
    
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
    
    // ESC key for settings
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        // Toggle settings modal instead of navigating back
        event.preventDefault();
        this.toggleSettings();
        console.log('ESC pressed, toggling settings:', this.showSettings);
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
  
  async loadSettings(): Promise<void> {
    try {
      const savedSettings = await this.dbService.loadGameSettings();
      if (savedSettings) {
        this.settings = savedSettings;
      }
      
      // Setup auto-save interval
      this.setupAutoSave();
      
      // Apply settings to services
      this.chunkManagerService.setRenderDistance(this.settings.renderDistance);
      this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  setupAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    
    // Set auto-save interval
    this.saveInterval = window.setInterval(() => {
      this.chunkManagerService.saveAllChunks();
    }, this.settings.autoSaveInterval * 1000);
    
    // Set the same interval in chunk manager
    this.chunkManagerService.setSaveInterval(this.settings.autoSaveInterval);
  }
  
  toggleSettings(): void {
    this.showSettings = !this.showSettings;
    
    // Pause game when settings are open
    if (this.showSettings) {
      // Release pointer lock when settings open
      this.mouseControlService.exitPointerLock();
    } else {
      // Re-request pointer lock when settings close
      this.mouseControlService.requestPointerLock();
    }
  }
  
  closeSettings(): void {
    this.showSettings = false;
    // Resume game
  }
  
  applySettings(newSettings: GameSettings): void {
    this.settings = newSettings;
    
    // Apply settings to services
    this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
    this.chunkManagerService.setRenderDistance(this.settings.renderDistance);
    
    // Update auto-save interval
    this.setupAutoSave();
    
    // Save settings
    this.dbService.saveGameSettings(this.settings);
  }
  
  returnToMenu(): void {
    // Save game state before returning to menu
    this.chunkManagerService.saveAllChunks().then(() => {
      this.store.dispatch(setGameMode({ mode: 'menu' }));
      this.router.navigate(['/']);
    });
  }
