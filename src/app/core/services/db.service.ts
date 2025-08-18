import { Injectable } from '@angular/core';
import { WorldChunk } from './chunk-manager.service';
import { PlayerState } from '../../shared/models/player.model';
import { GameSettings } from '../../shared/models/game.model';

@Injectable({
  providedIn: 'root'
})
export class DBService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'minecraft_clone';
  private readonly DB_VERSION = 1;
  
  constructor() {
    this.initDatabase();
  }
  
  private initDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }
      
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('chunks')) {
          db.createObjectStore('chunks', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('player')) {
          db.createObjectStore('player', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('worldInfo')) {
          db.createObjectStore('worldInfo', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onerror = () => {
        console.error('Error opening database:', request.error);
        reject(request.error);
      };
    });
  }
  
  async saveChunk(chunk: WorldChunk): Promise<void> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      // Convert blocks Map to array for storage
      const blocks = Array.from(chunk.blocks.entries()).map(([key, block]) => ({
        key,
        block
      }));
      
      const chunkData = {
        id: `${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ || 0}`,
        chunkX: chunk.chunkX,
        chunkY: chunk.chunkY,
        chunkZ: chunk.chunkZ || 0,
        blocks,
        lastSaved: Date.now()
      };
      
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      
      const request = store.put(chunkData);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async loadChunk(chunkX: number, chunkY: number, chunkZ: number = 0): Promise<WorldChunk | null> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      
      const request = store.get(`${chunkX},${chunkY},${chunkZ}`);
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        // Convert blocks array back to Map
        const blocks = new Map(
          request.result.blocks.map(({ key, block }: any) => [key, block])
        );
        
        const chunk: WorldChunk = {
          chunkX: request.result.chunkX,
          chunkY: request.result.chunkY,
          chunkZ: request.result.chunkZ,
          blocks,
          lastAccessed: Date.now(),
          isDirty: false
        };
        
        resolve(chunk);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async savePlayerState(player: PlayerState): Promise<void> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const playerData = {
        id: 'current',
        ...player,
        lastSaved: Date.now()
      };
      
      const transaction = this.db.transaction(['player'], 'readwrite');
      const store = transaction.objectStore('player');
      
      const request = store.put(playerData);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async loadPlayerState(): Promise<PlayerState | null> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['player'], 'readonly');
      const store = transaction.objectStore('player');
      
      const request = store.get('current');
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        const { id, lastSaved, ...playerState } = request.result;
        resolve(playerState as PlayerState);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async saveGameSettings(settings: GameSettings): Promise<void> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const settingsData = {
        id: 'current',
        ...settings,
        lastSaved: Date.now()
      };
      
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      
      const request = store.put(settingsData);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async loadGameSettings(): Promise<GameSettings | null> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      
      const request = store.get('current');
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        const { id, lastSaved, ...settings } = request.result;
        resolve(settings as GameSettings);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async saveWorldInfo(info: any): Promise<void> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const worldData = {
        id: 'current',
        ...info,
        lastSaved: Date.now()
      };
      
      const transaction = this.db.transaction(['worldInfo'], 'readwrite');
      const store = transaction.objectStore('worldInfo');
      
      const request = store.put(worldData);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async loadWorldInfo(): Promise<any> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['worldInfo'], 'readonly');
      const store = transaction.objectStore('worldInfo');
      
      const request = store.get('current');
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        const { id, lastSaved, ...worldInfo } = request.result;
        resolve(worldInfo);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async clearAllData(): Promise<void> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks', 'player', 'settings', 'worldInfo'], 'readwrite');
      
      let completedStores = 0;
      let hasError = false;
      
      const onStoreComplete = () => {
        completedStores++;
        if (completedStores === 4 && !hasError) {
          resolve();
        }
      };
      
      const onError = (error: any) => {
        if (!hasError) {
          hasError = true;
          reject(error);
        }
      };
      
      const chunksStore = transaction.objectStore('chunks');
      const playerStore = transaction.objectStore('player');
      const settingsStore = transaction.objectStore('settings');
      const worldInfoStore = transaction.objectStore('worldInfo');
      
      const chunksRequest = chunksStore.clear();
      const playerRequest = playerStore.clear();
      const settingsRequest = settingsStore.clear();
      const worldInfoRequest = worldInfoStore.clear();
      
      chunksRequest.onsuccess = onStoreComplete;
      playerRequest.onsuccess = onStoreComplete;
      settingsRequest.onsuccess = onStoreComplete;
      worldInfoRequest.onsuccess = onStoreComplete;
      
      chunksRequest.onerror = onError;
      playerRequest.onerror = onError;
      settingsRequest.onerror = onError;
      worldInfoRequest.onerror = onError;
    });
  }
  
  async getChunkIds(): Promise<string[]> {
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const request = store.getAllKeys();
      
      request.onsuccess = () => {
        resolve(request.result as string[]);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}
