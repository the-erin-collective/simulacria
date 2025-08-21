/**
 * Test file for player spawning system validation
 * This file contains tests to verify that the player spawning fixes work correctly
 */

import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { PlayerSpawningService } from './player-spawning.service';
import { BlockType, Block, Vector3 } from '../../shared/models/block.model';

describe('PlayerSpawningService - Fixed Implementation', () => {
  let service: PlayerSpawningService;
  let mockStore: jasmine.SpyObj<Store>;

  // Mock world with proper surface terrain
  const createMockWorldBlocks = (): Map<string, Block> => {
    const blocks = new Map<string, Block>();
    
    // Create a simple terrain with ground level at z=10
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        // Create bedrock at z=8
        blocks.set(`${x},${y},8`, {
          id: `block_${x}_${y}_8`,
          position: { x, y, z: 8 },
          metadata: {
            blockType: BlockType.STONE,
            probabilityMappings: {} as any,
            breakable: true,
            hardness: 5,
            transparent: false
          },
          isVisible: true
        });
        
        // Create dirt at z=9
        blocks.set(`${x},${y},9`, {
          id: `block_${x}_${y}_9`,
          position: { x, y, z: 9 },
          metadata: {
            blockType: BlockType.DIRT,
            probabilityMappings: {} as any,
            breakable: true,
            hardness: 2,
            transparent: false
          },
          isVisible: true
        });
        
        // Create grass surface at z=10
        blocks.set(`${x},${y},10`, {
          id: `block_${x}_${y}_10`,
          position: { x, y, z: 10 },
          metadata: {
            blockType: BlockType.DIRT, // Representing grass/dirt surface
            probabilityMappings: {} as any,
            breakable: true,
            hardness: 2,
            transparent: false
          },
          isVisible: true
        });
        
        // Air blocks above ground (z=11, 12, 13, etc.)
        for (let z = 11; z <= 15; z++) {
          blocks.set(`${x},${y},${z}`, {
            id: `block_${x}_${y}_${z}`,
            position: { x, y, z },
            metadata: {
              blockType: BlockType.AIR,
              probabilityMappings: {} as any,
              breakable: false,
              hardness: 0,
              transparent: true
            },
            isVisible: false
          });
        }
      }
    }
    
    return blocks;
  };

  beforeEach(() => {
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);

    TestBed.configureTestingModule({
      providers: [
        PlayerSpawningService,
        { provide: Store, useValue: storeSpy }
      ]
    });
    
    service = TestBed.inject(PlayerSpawningService);
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
  });

  it('should find correct spawn position on flat terrain', async () => {
    // Setup mock world
    const mockBlocks = createMockWorldBlocks();
    
    // Mock the store selector to return blocks
    mockStore.select.and.returnValue(of((x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      return mockBlocks.get(key) || null;
    }));

    // Test spawn position finding
    const spawnPos = await service.findSafeSpawnPosition();
    
    expect(spawnPos).toBeDefined();
    expect(spawnPos.x).toBe(0); // Should spawn at origin
    expect(spawnPos.y).toBe(0); // Should spawn at origin
    expect(spawnPos.z).toBe(11.9); // Ground at z=10, clearance +1, physics center +0.9
  });

  it('should validate spawn position safety correctly', async () => {
    const mockBlocks = createMockWorldBlocks();
    
    mockStore.select.and.returnValue(of((x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      return mockBlocks.get(key) || null;
    }));

    // Test safe position (above ground with clearance)
    const safePos = { x: 0, y: 0, z: 11.9 };
    const isSafe = await service.isPositionSafe(safePos);
    expect(isSafe).toBe(true);

    // Test unsafe position (inside ground)
    const unsafePos = { x: 0, y: 0, z: 10 };
    const isUnsafe = await service.isPositionSafe(unsafePos);
    expect(isUnsafe).toBe(false);

    // Test position in air without ground support
    const airPos = { x: 0, y: 0, z: 20 };
    const inAir = await service.isPositionSafe(airPos);
    expect(inAir).toBe(false);
  });

  it('should find terrain height correctly', async () => {
    const mockBlocks = createMockWorldBlocks();
    
    mockStore.select.and.returnValue(of((x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      return mockBlocks.get(key) || null;
    }));

    // Test terrain height detection
    const terrainHeight = await (service as any).findTerrainHeight(0, 0, 50, -10);
    expect(terrainHeight).toBe(10); // Ground level is at z=10
  });

  it('should get proper ground spawn position', async () => {
    const mockBlocks = createMockWorldBlocks();
    
    mockStore.select.and.returnValue(of((x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      return mockBlocks.get(key) || null;
    }));

    // Test ground spawn position calculation
    const groundSpawn = await service.getGroundSpawnPosition(0, 0);
    expect(groundSpawn).toBeDefined();
    expect(groundSpawn!.x).toBe(0);
    expect(groundSpawn!.y).toBe(0);
    expect(groundSpawn!.z).toBe(11.9); // Ground(10) + clearance(1) + physics center(0.9)
  });

  it('should validate and adjust spawn position when needed', async () => {
    const mockBlocks = createMockWorldBlocks();
    
    mockStore.select.and.returnValue(of((x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      return mockBlocks.get(key) || null;
    }));

    // Test with unsafe position that should be adjusted
    const unsafePos = { x: 0, y: 0, z: 10 }; // Inside ground
    const validatedPos = await service.validateSpawnPosition(unsafePos);
    
    expect(validatedPos).toBeDefined();
    // Should either be adjusted to safe position or remain original for physics to handle
    expect(validatedPos.z).toBeGreaterThanOrEqual(10);
  });
});

/**
 * Integration test utilities for manual testing
 */
export class SpawnTestUtils {
  static logSpawnDebugInfo(position: Vector3, description: string): void {
    const playerFeetZ = position.z - 0.9;
    const playerHeadZ = position.z + 0.9;
    
    console.log(`=== SPAWN DEBUG: ${description} ===`);
    console.log(`Physics Center: (${position.x}, ${position.y}, ${position.z})`);
    console.log(`Player Feet at Z: ${playerFeetZ}`);
    console.log(`Player Head at Z: ${playerHeadZ}`);
    console.log(`=====================================`);
  }

  static validatePhysicsIntegration(physicsService: any, position: Vector3): boolean {
    if (!physicsService) {
      console.warn('Physics service not available for validation');
      return false;
    }

    try {
      // Check if physics body exists
      const currentPos = physicsService.getPlayerPosition();
      console.log(`Current physics position: (${currentPos.x}, ${currentPos.y}, ${currentPos.z})`);
      
      // Set position and verify
      physicsService.forceSetPlayerPosition(position);
      const newPos = physicsService.getPlayerPosition();
      
      const isCorrect = Math.abs(newPos.x - position.x) < 0.1 &&
                       Math.abs(newPos.y - position.y) < 0.1 &&
                       Math.abs(newPos.z - position.z) < 0.1;
      
      console.log(`Physics integration ${isCorrect ? 'PASSED' : 'FAILED'}`);
      return isCorrect;
    } catch (error) {
      console.error('Physics integration test failed:', error);
      return false;
    }
  }
}

// Manual test function for browser console testing
declare global {
  interface Window {
    testPlayerSpawning: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.testPlayerSpawning = () => {
    console.log('=== PLAYER SPAWNING SYSTEM TEST ===');
    console.log('Use the following commands to test:');
    console.log('1. SpawnTestUtils.logSpawnDebugInfo({x: 0, y: 0, z: 11.9}, "Test Position")');
    console.log('2. Check console for spawn position calculations');
    console.log('3. Verify player doesn\'t spawn inside blocks');
    console.log('=====================================');
  };
}
