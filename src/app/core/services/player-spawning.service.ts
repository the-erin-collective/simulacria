import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Vector3, BlockType } from '../../shared/models/block.model';
import { selectBlockAtPosition } from '../../store/world/world.selectors';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PlayerSpawningService {
  constructor(private store: Store) {}

  async findSafeSpawnPosition(): Promise<Vector3> {
    const searchRadius = 10; // Increased from 5 to cover more area
    const maxHeight = 100;
    const minHeight = -50;

    console.log('Finding safe spawn position...');

    // Start searching from origin in a spiral pattern
    for (let radius = 0; radius <= searchRadius; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          // Only check the perimeter of the current radius
          if (Math.abs(x) !== radius && Math.abs(y) !== radius && radius > 0) continue;

          const spawnPos = await this.findSurfaceAt(x, y, maxHeight, minHeight);
          if (spawnPos) {
            console.log(`Found safe spawn at: (${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z})`);
            return spawnPos;
          }
        }
      }
    }

    console.warn('No safe spawn found, using fallback position high in the air');
    // Fallback: spawn high in the air and let player fall
    return { x: 0, y: 0, z: maxHeight };
  }

  private async findSurfaceAt(x: number, y: number, maxZ: number, minZ: number): Promise<Vector3 | null> {
    console.log(`Checking surface at (${x}, ${y})...`);
    
    return new Promise((resolve) => {
      // Start from the top and scan downward
      let currentZ = maxZ;
      let consecutiveAirBlocks = 0;
      let foundSurface = false;

      const checkNextBlock = () => {
        if (currentZ < minZ) {
          console.log(`No valid surface found at (${x}, ${y})`);
          resolve(null);
          return;
        }

        this.store.select(selectBlockAtPosition).pipe(take(1)).subscribe(getBlock => {
          const currentBlock = getBlock(x, y, currentZ);
          
          // If this is an air block, increment our counter
          if (!currentBlock || currentBlock.metadata.blockType === BlockType.AIR) {
            consecutiveAirBlocks++;
          } else {
            // Not an air block, reset our counter
            consecutiveAirBlocks = 0;
          }

          // If we have 2 consecutive air blocks and the block below is solid,
          // we've found a valid surface (player is 2 blocks tall)
          if (consecutiveAirBlocks >= 2) {
            const blockBelow = getBlock(x, y, currentZ - 2);
            
            if (blockBelow && 
                blockBelow.metadata.blockType !== BlockType.AIR && 
                blockBelow.metadata.blockType !== BlockType.WATER) {
              
              foundSurface = true;
              // Spawn player at the lower of the two air blocks
              const spawnZ = currentZ - 1 + 0.5; // +0.5 to spawn at the middle of the block
              console.log(`Found valid surface at (${x}, ${y}, ${spawnZ})`);
              resolve({ x, y, z: spawnZ });
              return;
            }
          }

          // Move down and check the next block
          currentZ--;
          setTimeout(checkNextBlock, 0); // Use setTimeout to avoid stack overflow
        });
      };

      checkNextBlock();
    });
  }

  // Check if a position is safe for spawning (not inside blocks, has space above)
  async isPositionSafe(position: Vector3): Promise<boolean> {
    return new Promise((resolve) => {
      this.store.select(selectBlockAtPosition).pipe(take(1)).subscribe(getBlock => {
        const { x, y, z } = position;
        
        // Check player collision space (2 blocks high)
        const blockAtFeet = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        const blockAtHead = getBlock(Math.floor(x), Math.floor(y), Math.floor(z + 1));
        const blockBelow = getBlock(Math.floor(x), Math.floor(y), Math.floor(z - 1));

        // Position is safe if:
        // 1. Feet and head positions are air
        // 2. Block below is solid (not falling)
        const feetClear = !blockAtFeet || blockAtFeet.metadata.blockType === BlockType.AIR;
        const headClear = !blockAtHead || blockAtHead.metadata.blockType === BlockType.AIR;
        const groundBelow = blockBelow && 
                           blockBelow.metadata.blockType !== BlockType.AIR &&
                           blockBelow.metadata.blockType !== BlockType.WATER;

        resolve(feetClear && headClear && groundBelow);
      });
    });
  }

  // Get a random spawn position within a radius
  getRandomSpawnInRadius(center: Vector3, radius: number): Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    return {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
      z: center.z
    };
  }

  // Emergency spawn position if all else fails
  getEmergencySpawn(): Vector3 {
    return { x: 0, y: 0, z: 100 }; // High in the sky
  }
}
