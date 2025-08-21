import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
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
import { selectGameMode, selectTargetBlock, selectIsBreaking, selectBreakingProgress, selectIsLoading, selectLoadingMessage, selectLoadingDetails, selectLoadingProgress, selectShowLoadingProgress, selectLoadingCancellable } from '../../store/ui/ui.selectors';
import { selectSelectedItem, selectEquippedTool, selectToolbarItems } from '../../store/player/player.selectors';
import { generateWorld, worldGenerated, updatePlayerPosition } from '../../store/world/world.actions';
import { setTargetBlock, setGameMode, startLoading, updateLoadingProgress, stopLoading } from '../../store/ui/ui.actions';
import { selectInventorySlot } from '../../store/player/player.actions';
import { Block, Vector3, BlockType } from '../../shared/models/block.model';
import { InventoryItem } from '../../shared/models/player.model';
import { GENERATION_LIMIT, GameSettings, DEFAULT_SETTINGS } from '../../shared/models/game.model';
import { InventoryComponent } from '../inventory/inventory.component';
import { SettingsModalComponent } from '../settings/settings-modal.component';
import { LoadingOverlayComponent } from '../ui/loading-overlay.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, InventoryComponent, SettingsModalComponent, LoadingOverlayComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss']
})
export class GameComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private subscriptions = new Subscription();
  private gameLoop?: number;
  private lastFrameTime = 0;
  private boundKeyDownHandler?: (event: KeyboardEvent) => void;
  private isBrowser: boolean;
  private isInitialSpawn = true; // Track if this is the first spawn
  
  visibleBlocks$: Observable<Map<string, Block>>;
  playerPosition$: Observable<Vector3>;
  gameMode$: Observable<any>;
  targetBlock$: Observable<Vector3 | undefined>;
  isBreaking$: Observable<boolean>;
  breakingProgress$: Observable<number>;
  selectedItem$: Observable<InventoryItem | null>;
  equippedTool$: Observable<any>;
  toolbarItems$: Observable<InventoryItem[]>;
  
  // Loading state observables
  isLoading$: Observable<boolean>;
  loadingMessage$: Observable<string | null>;
  loadingDetails$: Observable<string | null>;
  loadingProgress$: Observable<number>;
  showLoadingProgress$: Observable<boolean>;
  loadingCancellable$: Observable<boolean>;
  
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
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.visibleBlocks$ = this.store.select(selectVisibleBlocks);
    this.playerPosition$ = this.store.select(selectPlayerPosition);
    this.gameMode$ = this.store.select(selectGameMode);
    this.targetBlock$ = this.store.select(selectTargetBlock);
    this.isBreaking$ = this.store.select(selectIsBreaking);
    this.breakingProgress$ = this.store.select(selectBreakingProgress);
    this.selectedItem$ = this.store.select(selectSelectedItem);
    this.equippedTool$ = this.store.select(selectEquippedTool);
    this.toolbarItems$ = this.store.select(selectToolbarItems);
    
    // Initialize loading observables
    this.isLoading$ = this.store.select(selectIsLoading);
    this.loadingMessage$ = this.store.select(selectLoadingMessage);
    this.loadingDetails$ = this.store.select(selectLoadingDetails);
    this.loadingProgress$ = this.store.select(selectLoadingProgress);
    this.showLoadingProgress$ = this.store.select(selectShowLoadingProgress);
    this.loadingCancellable$ = this.store.select(selectLoadingCancellable);
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
        if (this.isInitialSpawn) {
          // For initial spawn, use force spawn to properly position player and reset physics
          this.babylonService.forceSpawnPlayer(position);
          this.isInitialSpawn = false;
          console.log(`Initial spawn completed at: (${position.x}, ${position.y}, ${position.z})`);
        } else {
          // For regular updates, use normal position update
          this.babylonService.updatePlayerPosition(position);
        }
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
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      console.warn('Game initialization skipped in server environment');
      return;
    }
    
    try {
      // Start loading if not already loading
      this.store.select(selectIsLoading).pipe(take(1)).subscribe(isLoading => {
        if (!isLoading) {
          this.store.dispatch(startLoading({ 
            operation: 'game_initialization', 
            message: 'Initializing game...', 
            showProgress: true 
          }));
        }
      });
      
      // Initialize BabylonJS (wrapped in setTimeout to avoid change detection error)
      setTimeout(() => {
        this.store.dispatch(updateLoadingProgress({ progress: 10, details: 'Starting 3D engine...' }));
      });
      await this.babylonService.initializeEngine(this.canvasRef);
      
      // Generate initial world with surface spawn
      this.store.dispatch(updateLoadingProgress({ progress: 30, details: 'Generating world...' }));
      await this.generateInitialWorld();
      
      // Setup input handlers
      this.store.dispatch(updateLoadingProgress({ progress: 80, details: 'Setting up controls...' }));
      this.setupInputHandlers();
      
      // Start game loop
      this.store.dispatch(updateLoadingProgress({ progress: 90, details: 'Starting game...' }));
      this.startGameLoop();
      
      // Final initialization steps
      this.store.dispatch(updateLoadingProgress({ progress: 95, details: 'Finalizing...' }));
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Complete loading
      this.store.dispatch(updateLoadingProgress({ progress: 100, details: 'Game ready!' }));
      
      // Delay the stop loading to ensure change detection cycle completes
      await new Promise(resolve => setTimeout(resolve, 200));
      this.store.dispatch(stopLoading());
      
    } catch (error) {
      console.error('Game initialization failed:', error);
      this.store.dispatch(updateLoadingProgress({ progress: 100, details: 'Initialization failed' }));
      setTimeout(() => {
        this.store.dispatch(stopLoading());
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.gameLoop) {
      cancelAnimationFrame(this.gameLoop);
    }
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    
    // Clean up event listeners with the stored reference
    if (this.boundKeyDownHandler) {
      document.removeEventListener('keydown', this.boundKeyDownHandler, { capture: true });
    }
    
    this.mouseControlService.dispose();
    this.babylonService.dispose();
    
    // Save game state before exit
    this.chunkManagerService.saveAllChunks();
  }

  private async generateInitialWorld(): Promise<void> {
    console.log('Generating initial world...');
    
    // Try to load existing world first
    this.store.dispatch(updateLoadingProgress({ progress: 35, details: 'Checking for existing world...' }));
    const worldLoaded = await this.chunkManagerService.loadWorld();
    
    if (worldLoaded) {
      console.log('Found existing world, loading...');
      this.store.dispatch(updateLoadingProgress({ progress: 40, details: 'Loading existing world...' }));
      
      // Load player position from database
      const playerState = await this.dbService.loadPlayerState();
      let spawnPosition: Vector3;
      
      if (playerState && playerState.position) {
        console.log(`Loaded player position: (${playerState.position.x}, ${playerState.position.y}, ${playerState.position.z})`);
        spawnPosition = playerState.position;
      } else {
        // If no player position saved, find a new spawn position
        console.log('No saved player position, finding new spawn...');
        this.store.dispatch(updateLoadingProgress({ progress: 50, details: 'Finding spawn position...' }));
        spawnPosition = await this.findSpawnPositionForExistingWorld();
      }
      
      // Set player position
      this.store.dispatch(updatePlayerPosition({ position: spawnPosition }));
      
      // Load chunks around player and get visible blocks
      this.store.dispatch(updateLoadingProgress({ progress: 60, details: 'Loading world chunks...' }));
      await this.chunkManagerService.loadChunksAroundPlayer(spawnPosition.x, spawnPosition.y, spawnPosition.z);
      this.store.dispatch(updateLoadingProgress({ progress: 70, details: 'Rendering world...' }));
      const blocks = await this.chunkManagerService.getVisibleBlocks(spawnPosition.x, spawnPosition.y, spawnPosition.z);
      this.store.dispatch(worldGenerated({ blocks }));
    } else {
      console.log('No existing world found, generating new world...');
      await this.generateNewWorld();
    }
    
    // Setup auto-save interval
    this.store.dispatch(updateLoadingProgress({ progress: 75, details: 'Setting up auto-save...' }));
    this.setupAutoSave();
  }
  
  private async generateNewWorld(): Promise<void> {
    // Create a new world
    this.store.dispatch(updateLoadingProgress({ progress: 40, details: 'Creating new world...' }));
    await this.chunkManagerService.createNewWorld();
    
    // Generate terrain using terrain service
    this.store.dispatch(updateLoadingProgress({ progress: 45, details: 'Generating terrain...' }));
    const centerPosition = { x: 0, y: 0, z: 10 }; // Start generation at a reasonable height
    const generatedBlocks = this.terrainService.generateWorld(centerPosition, GENERATION_LIMIT);
    
    console.log(`Generated ${generatedBlocks.size} blocks`);
    
    // Import generated world into chunk-based storage
    this.store.dispatch(updateLoadingProgress({ progress: 55, details: 'Processing world data...' }));
    await this.chunkManagerService.importFromFlatWorld(generatedBlocks);
    
    // Dispatch the generated blocks to the store immediately
    this.store.dispatch(updateLoadingProgress({ progress: 60, details: 'Loading world into game...' }));
    this.store.dispatch(worldGenerated({ blocks: generatedBlocks }));
    
    // Wait for the store to update and ensure the blocks are available
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Now find a safe spawn position with the world data available
    console.log('Finding spawn position in generated world...');
    this.store.dispatch(updateLoadingProgress({ progress: 65, details: 'Finding spawn position...' }));
    const startPosition = await this.findSafeSpawnPosition(generatedBlocks);
    console.log(`Using spawn position: (${startPosition.x}, ${startPosition.y}, ${startPosition.z})`);
    
    // Set initial player position
    this.store.dispatch(updatePlayerPosition({ position: startPosition }));
    
    // Load chunks around the spawn position
    this.store.dispatch(updateLoadingProgress({ progress: 70, details: 'Loading spawn area...' }));
    await this.chunkManagerService.loadChunksAroundPlayer(startPosition.x, startPosition.y, startPosition.z);
  }
  
  private async findSpawnPositionForExistingWorld(): Promise<Vector3> {
    // For existing worlds, try to find a spawn near origin
    const testPosition = await this.playerSpawningService.findSafeSpawnPosition();
    return testPosition;
  }
  
  // Find a safe spawn position using the generated world blocks directly
  private async findSafeSpawnPosition(worldBlocks: Map<string, Block>): Promise<Vector3> {
    console.log('Finding safe spawn position from generated blocks...');
    
    // Search in a spiral pattern around origin for a safe spawn
    const searchRadius = 20;
    const maxHeight = 50;
    const minHeight = -10;

    for (let radius = 0; radius <= searchRadius; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          // Only check the perimeter of the current radius
          if (Math.abs(x) !== radius && Math.abs(y) !== radius && radius > 0) continue;

          const spawnPos = this.findSurfaceAtPosition(x, y, maxHeight, minHeight, worldBlocks);
          if (spawnPos) {
            console.log(`Found safe spawn at: (${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z})`);
            return spawnPos;
          }
        }
      }
    }

    console.warn('No safe spawn found using search, using fallback position');
    // Fallback: spawn high above ground with proper physics positioning
    return { x: 0, y: 0, z: 30 }; // High enough to ensure physics can find ground
  }
  
  // Find surface at a specific position using block data directly
  private findSurfaceAtPosition(x: number, y: number, maxZ: number, minZ: number, worldBlocks: Map<string, Block>): Vector3 | null {
    // Start from the top and scan downward
    for (let z = maxZ; z >= minZ; z--) {
      const currentKey = `${x},${y},${z}`;
      const aboveKey = `${x},${y},${z + 1}`;
      const aboveAboveKey = `${x},${y},${z + 2}`;
      
      const blockAtCurrentZ = worldBlocks.get(currentKey);
      const blockAboveCurrentZ = worldBlocks.get(aboveKey);
      const blockAboveAboveCurrentZ = worldBlocks.get(aboveAboveKey);
      
      // Check if we found a solid block with 2 air blocks above it
      const currentIsSolid = blockAtCurrentZ && 
                            blockAtCurrentZ.metadata.blockType !== BlockType.AIR && 
                            blockAtCurrentZ.metadata.blockType !== BlockType.WATER;
      const aboveIsAir = !blockAboveCurrentZ || blockAboveCurrentZ.metadata.blockType === BlockType.AIR;
      const aboveAboveIsAir = !blockAboveAboveCurrentZ || blockAboveAboveCurrentZ.metadata.blockType === BlockType.AIR;
      
      if (currentIsSolid && aboveIsAir && aboveAboveIsAir) {
        // Calculate spawn position accounting for physics body center
        // Physics body center needs to be positioned so player feet touch ground
        // Player height is 1.8, so center is 0.9 above feet
        // Place 1 block above surface + center offset
        const spawnZ = z + 1 + 0.9; // Surface + clearance + physics center offset
        console.log(`Found valid surface at (${x}, ${y}, ${spawnZ}) on solid block at z=${z}`);
        return { x, y, z: spawnZ };
      }
    }

    return null;
  }

  private startGameLoop(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
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
            rotation: { x: 0, y: 0, z: 0 }, // Default rotation
            inventory: toolbarItems || [],
            selectedSlot: this.selectedSlot,
            health: 10, // Default full health
            maxHealth: 10
          });
        });
      });
    }
  }

  private setupInputHandlers(): void {
    // Return early if not in browser (during SSR)
    if (!this.isBrowser) {
      return;
    }
    
    const canvas = this.canvasRef.nativeElement;
    
    // Set mouse sensitivity in babylon service (controls are now handled there)
    this.babylonService.setMouseSensitivity(this.settings.mouseSensitivity);
    
    // Also apply mouse settings to mouse control service
    this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
    this.mouseControlService.setMouseYInversion(this.settings.invertMouseY);
    
    // Remove any existing event listeners first
    document.removeEventListener('keydown', this.handleKeyDown);
    
    // Add global TAB key handler for UI (using capture phase to intercept early)
    const boundKeyDownHandler = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', boundKeyDownHandler, { capture: true });
    
    // Store reference for cleanup
    this.boundKeyDownHandler = boundKeyDownHandler;
    
    // Focus the canvas to ensure it can receive keyboard events
    canvas.setAttribute('tabindex', '0');
    canvas.focus();
    
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
  }

  private calculatePlacementPosition(targetBlock: Vector3): Vector3 {
    // For simplicity, place above the targeted block
    return {
      x: targetBlock.x,
      y: targetBlock.y,
      z: targetBlock.z + 1
    };
  }
  
  private handleKeyDown(event: KeyboardEvent): void {
    // Handle TAB key for settings modal (changed from ESC to avoid pointer lock conflicts)
    if (event.key === 'Tab' && !this.showInventory) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      console.log('TAB pressed, current showSettings:', this.showSettings);
      this.toggleSettings();
      return;
    }
    
    // Handle number keys for hotbar selection
    const key = parseInt(event.key);
    if (key >= 1 && key <= 9) {
      const slotIndex = key - 1;
      this.selectedSlot = slotIndex;
      this.gameMechanics.selectHotbarSlot(slotIndex);
      return;
    }
    
    // Handle I key for inventory (changed from Tab to avoid conflicts)
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      this.showInventory = !this.showInventory;
      return;
    }
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
      this.babylonService.setMouseSensitivity(this.settings.mouseSensitivity);
      this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
      this.mouseControlService.setMouseYInversion(this.settings.invertMouseY);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  setupAutoSave(): void {
    // Only run on browser, not during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    
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
    console.log('toggleSettings called, current state:', this.showSettings);
    this.showSettings = !this.showSettings;
    
    if (this.showSettings) {
      // Settings opened - release pointer lock and pause game
      console.log('Opening settings, releasing pointer lock');
      this.mouseControlService.exitPointerLock();
    } else {
      // Settings closed - request pointer lock and resume game
      console.log('Closing settings, requesting pointer lock');
      setTimeout(() => {
        this.mouseControlService.requestPointerLock();
      }, 100); // Small delay to ensure the modal is fully hidden
    }
    
    console.log('Settings toggled to:', this.showSettings);
  }
  
  closeSettings(): void {
    this.showSettings = false;
    // Resume game
  }
  
  applySettings(newSettings: GameSettings): void {
    this.settings = newSettings;
    
    // Apply settings to services
    this.babylonService.setMouseSensitivity(this.settings.mouseSensitivity);
    this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
    this.mouseControlService.setMouseYInversion(this.settings.invertMouseY);
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
}
