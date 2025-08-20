import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Vector3, BlockType, Block } from '../../shared/models/block.model';
import { selectBlockAtPosition } from '../../store/world/world.selectors';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PlayerSpawningService {
  constructor(private store: Store) {}

  async findSafeSpawnPosition(): Promise<Vector3> {
    console.log('Finding safe spawn position...');
    
    // For new worlds, find a surface position based on generated terrain
    // Search in a spiral pattern around origin
    const searchRadius = 20;
    const maxHeight = 50;
    const minHeight = -10;

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

    console.warn('No safe spawn found using search, trying fallback approaches...');
    
    // Fallback 1: Try origin area with higher spawn position
    for (let z = maxHeight; z >= minHeight; z--) {
      const testPos = { x: 0, y: 0, z };
      if (await this.isPositionSafe(testPos)) {
        console.log(`Using fallback spawn at origin: (0, 0, ${z})`);
        return testPos;
      }
    }
    
    // Fallback 2: Spawn high above ground
    console.warn('Using emergency high spawn position');
    return { x: 0, y: 0, z: 20 }; // Spawn 20 blocks above origin
  }

  private async findSurfaceAt(x: number, y: number, maxZ: number, minZ: number): Promise<Vector3 | null> {
    console.log(`Checking surface at (${x}, ${y})...`);
    
    // Start from the top and scan downward
    for (let z = maxZ; z >= minZ; z--) {
      try {
        const blockAtCurrentZ = await this.getBlockAtPosition(x, y, z);
        const blockAboveCurrentZ = await this.getBlockAtPosition(x, y, z + 1);
        const blockAboveAboveCurrentZ = await this.getBlockAtPosition(x, y, z + 2);
        
        // Check if we found a solid block with 2 air blocks above it
        const currentIsSolid = blockAtCurrentZ && blockAtCurrentZ.metadata.blockType !== BlockType.AIR && blockAtCurrentZ.metadata.blockType !== BlockType.WATER;
        const aboveIsAir = !blockAboveCurrentZ || blockAboveCurrentZ.metadata.blockType === BlockType.AIR;
        const aboveAboveIsAir = !blockAboveAboveCurrentZ || blockAboveAboveCurrentZ.metadata.blockType === BlockType.AIR;
        
        if (currentIsSolid && aboveIsAir && aboveAboveIsAir) {
          const spawnZ = z + 1.5; // Spawn 1.5 blocks above the solid surface
          console.log(`Found valid surface at (${x}, ${y}, ${spawnZ})`);
          return { x, y, z: spawnZ };
        }
      } catch (error) {
        // If we can't get block data, continue searching
        continue;
      }
    }

    console.log(`No valid surface found at (${x}, ${y})`);
    return null;
  }
  
  private async getBlockAtPosition(x: number, y: number, z: number): Promise<Block | null> {
    return new Promise((resolve) => {
      // Try to get block from store first
      this.store.select(selectBlockAtPosition).pipe(take(1)).subscribe(getBlock => {
        try {
          const block = getBlock(x, y, z);
          resolve(block);
        } catch (error) {
          resolve(null);
        }
      });
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

        resolve(Boolean(feetClear && headClear && groundBelow));
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
