import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WorldChunk } from './chunk-manager.service';
import { PlayerState } from '../../shared/models/player.model';
import { GameSettings } from '../../shared/models/game.model';
import { Block } from '../../shared/models/block.model';
import { CompressedChunk } from '../../shared/models/optimized-block.model';

@Injectable({
  providedIn: 'root'
})
export class DBService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'minecraft_clone';
  private readonly DB_VERSION = 2;
  private isBrowser: boolean;
  private initPromise: Promise<IDBDatabase> | null = null;
  
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    // Database initialization is now handled explicitly via ensureInitialized()
    // Don't auto-initialize to prevent blocking the constructor
  }
  
  /**
   * Ensures the database is initialized. This should be called once at app startup.
   * Returns a promise that resolves when the database is ready.
   */
  async ensureInitialized(): Promise<IDBDatabase> {
    if (!this.isBrowser) {
      throw new Error('IndexedDB not available in server environment');
    }
    
    // If already initialized, return the existing database
    if (this.db) {
      console.log('✅ Database already initialized');
      return this.db;
    }
    
    // If initialization is in progress, wait for it
    if (this.initPromise) {
      console.log('⏳ Waiting for existing initialization to complete...');
      return this.initPromise;
    }
    
    // Check for private browsing mode first
    const isPrivateBrowsing = await this.detectPrivateBrowsing();
    if (isPrivateBrowsing) {
      throw new Error('IndexedDB is not available in Firefox private browsing mode. Please use normal browsing mode to play this game.');
    }
    
    // Start new initialization
    console.log('🚀 Starting database initialization for app startup...');
    return this.initDatabase();
  }
  
  /**
   * Detect if the browser is in private browsing mode (specifically for Firefox)
   */
  private async detectPrivateBrowsing(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Firefox private browsing detection method
        // Try to create a temporary IndexedDB to test if it's available
        const testDbName = 'test_private_browsing_' + Math.random();
        const testRequest = indexedDB.open(testDbName, 1);
        
        let timeoutId = setTimeout(() => {
          console.warn('⚠️ Private browsing detection timed out - assuming private browsing');
          resolve(true);
        }, 2000);
        
        testRequest.onerror = () => {
          clearTimeout(timeoutId);
          console.log('📜 Private browsing detected (IndexedDB error)');
          resolve(true);
        };
        
        testRequest.onblocked = () => {
          clearTimeout(timeoutId);
          console.log('📜 Private browsing detected (IndexedDB blocked)');
          resolve(true);
        };
        
        testRequest.onsuccess = () => {
          clearTimeout(timeoutId);
          // Clean up test database
          testRequest.result.close();
          indexedDB.deleteDatabase(testDbName);
          console.log('✅ Normal browsing mode detected');
          resolve(false);
        };
        
        testRequest.onupgradeneeded = (event) => {
          // This means IndexedDB is working, continue to onsuccess
          console.log('📝 Test database upgrade needed - IndexedDB working');
        };
        
      } catch (error) {
        console.log('📜 Private browsing detected (Exception):', error);
        resolve(true);
      }
    });
  }

  private initDatabase(): Promise<IDBDatabase> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      // Return early if not in browser
      if (!this.isBrowser) {
        reject(new Error('IndexedDB not available in server environment'));
        return;
      }
      
      if (this.db) {
        resolve(this.db);
        return;
      }
      
      console.log('Initializing IndexedDB for DVE optimization...');
      
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        console.error('IndexedDB not supported in this browser');
        this.initPromise = null;
        reject(new Error('IndexedDB not supported'));
        return;
      }
      
      // Add timeout to prevent hanging (reduced to 5 seconds for faster feedback)
      const timeoutId = setTimeout(() => {
        console.error('❌ Database initialization timed out after 5 seconds');
        console.log('🔍 Possible causes: Firefox private browsing, storage quota exceeded, or database corruption');
        console.log('🛠️ Trying to delete existing database and retry...');
        
        // Try to delete the database and retry once
        this.deleteAndRetryDatabase()
          .then((db) => {
            console.log('✅ Database retry successful!');
            resolve(db);
          })
          .catch((retryError) => {
            this.initPromise = null;
            reject(new Error(`Database initialization timed out. If using Firefox, please disable private browsing mode. Retry failed: ${retryError.message}`));
          });
      }, 5000); // Reduced from 10 seconds
      
      try {
        // Add comprehensive diagnostic information
        console.log('🔎 Pre-flight checks:');
        console.log('- IndexedDB available:', !!window.indexedDB);
        console.log('- Browser:', navigator.userAgent);
        console.log('- Storage quota check starting...');
        
        // Check storage quota if available
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          navigator.storage.estimate().then(estimate => {
            console.log('- Storage quota:', estimate.quota, 'bytes');
            console.log('- Storage usage:', estimate.usage, 'bytes');
            console.log('- Storage available:', estimate.quota ? estimate.quota - (estimate.usage || 0) : 'unknown', 'bytes');
          }).catch(() => console.log('- Storage quota check failed'));
        }
        
        // Firefox-specific error handling
        let request: IDBOpenDBRequest;
        try {
          request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        } catch (error) {
          // This catches InvalidStateError in Firefox private browsing
          if (error instanceof DOMException && error.name === 'InvalidStateError') {
            clearTimeout(timeoutId);
            this.initPromise = null;
            reject(new Error('Firefox private browsing detected. IndexedDB is disabled in private browsing mode. Please use normal browsing mode.'));
            return;
          }
          throw error; // Re-throw other errors
        }
        
        console.log('Opening IndexedDB directly...');
        console.log('- Database name:', this.DB_NAME);
        console.log('- Database version:', this.DB_VERSION);
        console.log('- Request object created, waiting for events...');
        
        // Clear timeout on any completion
        const clearTimeoutAndComplete = (callback: () => void) => {
          clearTimeout(timeoutId);
          callback();
        };
        
        request.onblocked = (event) => {
          console.warn('🚫 Database blocked by other tabs - please close other instances');
          console.log('Blocked event:', event);
          clearTimeoutAndComplete(() => {
            this.initPromise = null;
            reject(new Error('Database blocked - close other browser tabs and refresh'));
          });
        };
      
        request.onupgradeneeded = (event) => {
          console.log('📈 Database upgrade needed for DVE optimization');
          const db = request.result;
          const oldVersion = event.oldVersion;
          
          console.log(`Upgrading database from version ${oldVersion} to ${this.DB_VERSION}`);
          
          try {
            // Create object stores optimized for compressed chunks
            if (!db.objectStoreNames.contains('worlds')) {
              const worldStore = db.createObjectStore('worlds', { keyPath: 'id' });
              worldStore.createIndex('name', 'name', { unique: false });
              worldStore.createIndex('created', 'created', { unique: false });
              worldStore.createIndex('lastPlayed', 'lastPlayed', { unique: false });
              console.log('✅ Created worlds store');
            }
            
            // Optimized chunk storage for compressed data
            if (!db.objectStoreNames.contains('chunks')) {
              const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
              chunkStore.createIndex('worldId', 'worldId', { unique: false });
              // Removed complex compound index that was causing hangs
              console.log('✅ Created optimized chunks store');
            }
            
            if (!db.objectStoreNames.contains('players')) {
              const playerStore = db.createObjectStore('players', { keyPath: 'id' });
              playerStore.createIndex('worldId', 'worldId', { unique: false });
              console.log('✅ Created players store');
            }
            
            if (!db.objectStoreNames.contains('settings')) {
              db.createObjectStore('settings', { keyPath: 'id' });
              console.log('✅ Created settings store');
            }
            
            // Add compressed chunks store for DVE optimization
            if (!db.objectStoreNames.contains('compressed_chunks')) {
              const compressedStore = db.createObjectStore('compressed_chunks', { keyPath: 'id' });
              compressedStore.createIndex('worldId', 'worldId', { unique: false });
              console.log('✅ Created compressed chunks store for DVE optimization');
            }
            
            console.log('✅ Database upgrade completed successfully');
          } catch (error) {
            console.error('❌ Error during database upgrade:', error);
            // Don't throw here - let the error handler deal with it
          }
        };
        
        request.onsuccess = () => {
          console.log('🎉 IndexedDB open request succeeded!');
          clearTimeoutAndComplete(() => {
            this.db = request.result;
            console.log('✅ Database initialized successfully for DVE optimization');
            
            // Add error handler to the database
            this.db.onerror = (event) => {
              console.error('Database error:', event);
            };
            
            resolve(this.db);
          });
        };
        
        request.onerror = (event) => {
          console.error('❌ Error opening database:', request.error);
          console.log('Error event:', event);
          clearTimeoutAndComplete(() => {
            this.initPromise = null;
            
            // Provide more specific error messages
            let errorMessage = request.error?.message || 'Unknown database error';
            if (errorMessage.includes('InvalidState') || errorMessage.includes('private')) {
              errorMessage = 'Firefox private browsing mode detected. Please disable private browsing to play this game.';
            } else if (errorMessage.includes('quota') || errorMessage.includes('storage')) {
              errorMessage = 'Insufficient browser storage space. Please clear browser data or free up disk space.';
            }
            
            reject(new Error(errorMessage));
          });
        };
        
      } catch (error) {
        console.error('❌ Exception while setting up IndexedDB request:', error);
        clearTimeout(timeoutId);
        this.initPromise = null;
        reject(error);
      }
    });

    return this.initPromise;
  }

  private async deleteAndRetryDatabase(): Promise<IDBDatabase> {
    console.log('🗑️ Attempting to delete existing database...');
    
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(this.DB_NAME);
      
      deleteRequest.onsuccess = () => {
        console.log('✅ Database deleted successfully, retrying initialization...');
        // Reset state and retry
        this.db = null;
        this.initPromise = null;
        
        // Retry with original database name
        this.initDatabase().then(resolve).catch(reject);
      };
      
      deleteRequest.onerror = () => {
        console.error('❌ Failed to delete database:', deleteRequest.error);
        reject(deleteRequest.error || new Error('Failed to delete database'));
      };
      
      deleteRequest.onblocked = () => {
        console.warn('🚫 Database deletion blocked - close other tabs and refresh');
        reject(new Error('Database deletion blocked - close other browser tabs and refresh the page'));
      };
    });
  }



  
  async saveChunk(chunk: WorldChunk, worldId?: string): Promise<void> {
    // Return early if not in browser
    if (!this.isBrowser) {
      console.warn('Database operations not available in server environment');
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      try {
        // Convert blocks Map to array for storage
        const blocks = Array.from(chunk.blocks.entries()).map(([key, block]) => ({
          key,
          block
        }));
        
        const chunkData = {
          id: `${worldId || 'current'}_${chunk.chunkX}_${chunk.chunkY}_${chunk.chunkZ || 0}`,
          worldId: worldId || 'current',
          chunkX: chunk.chunkX,
          chunkY: chunk.chunkY,
          chunkZ: chunk.chunkZ || 0,
          blocks,
          lastSaved: Date.now(),
          blockCount: chunk.blocks.size
        };
        
        const transaction = this.db.transaction(['chunks'], 'readwrite');
        const store = transaction.objectStore('chunks');
        
        const request = store.put(chunkData);
        
        request.onsuccess = () => {
          console.log(`Saved chunk ${chunkData.id} with ${blocks.length} blocks`);
          resolve();
        };
        request.onerror = () => {
          console.error(`Failed to save chunk ${chunkData.id}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Error preparing chunk data for save:', error);
        reject(error);
      }
    });
  }
  
  async loadChunk(chunkX: number, chunkY: number, chunkZ: number = 0, worldId?: string): Promise<WorldChunk | null> {
    // Return null if not in browser
    if (!this.isBrowser) {
      return null;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      try {
        const chunkId = `${worldId || 'current'}_${chunkX}_${chunkY}_${chunkZ}`;
        const transaction = this.db.transaction(['chunks'], 'readonly');
        const store = transaction.objectStore('chunks');
        
        const request = store.get(chunkId);
        
        request.onsuccess = () => {
          if (!request.result) {
            resolve(null);
            return;
          }
          
          try {
            // Convert blocks array back to Map
            const blocks = new Map<string, Block>();
            if (request.result.blocks && Array.isArray(request.result.blocks)) {
              for (const { key, block } of request.result.blocks) {
                blocks.set(key as string, block as Block);
              }
            }
            
            const chunk: WorldChunk = {
              chunkX: request.result.chunkX,
              chunkY: request.result.chunkY,
              chunkZ: request.result.chunkZ,
              blocks,
              lastAccessed: Date.now(),
              isDirty: false
            };
            
            console.log(`Loaded chunk ${chunkId} with ${blocks.size} blocks`);
            resolve(chunk);
          } catch (error) {
            console.error('Error parsing chunk data:', error);
            reject(error);
          }
        };
        
        request.onerror = () => {
          console.error(`Failed to load chunk ${chunkId}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Error loading chunk:', error);
        reject(error);
      }
    });
  }
  
  async savePlayerState(player: PlayerState, worldId: string): Promise<void> {
    // Return early if not in browser
    if (!this.isBrowser) {
      console.warn('Database operations not available in server environment');
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const playerId = `${worldId}_player`;
      const playerData = {
        id: playerId,
        worldId,
        ...player,
        lastSaved: Date.now()
      };
      
      const transaction = this.db.transaction(['players'], 'readwrite');
      const store = transaction.objectStore('players');
      
      const request = store.put(playerData);
      
      request.onsuccess = () => {
        console.log(`Saved player state for world ${worldId}`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`Failed to save player state for world ${worldId}:`, request.error);
        reject(request.error);
      };
    });
  }
  
  async loadPlayerState(worldId: string): Promise<PlayerState | null> {
    // Return null if not in browser
    if (!this.isBrowser) {
      return null;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const playerId = `${worldId}_player`;
      const transaction = this.db.transaction(['players'], 'readonly');
      const store = transaction.objectStore('players');
      
      const request = store.get(playerId);
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        const { id, worldId: wId, lastSaved, ...playerState } = request.result;
        console.log(`Loaded player state for world ${worldId}`);
        resolve(playerState as PlayerState);
      };
      
      request.onerror = () => {
        console.error(`Failed to load player state for world ${worldId}:`, request.error);
        reject(request.error);
      };
    });
  }
  
  async saveGameSettings(settings: GameSettings): Promise<void> {
    // Return early if not in browser
    if (!this.isBrowser) {
      console.warn('Database operations not available in server environment');
      return;
    }
    
    await this.ensureInitialized();
    
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
    // Return null if not in browser
    if (!this.isBrowser) {
      return null;
    }
    
    await this.ensureInitialized();
    
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
  
  // World management methods
  async createWorld(worldData: {
    id?: string;
    name: string;
    settings?: any;
    metadata?: any;
  }): Promise<string> {
    if (!this.isBrowser) {
      throw new Error('Database operations not available in server environment');
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const worldId = worldData.id || `world_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const world = {
        id: worldId,
        name: worldData.name,
        created: Date.now(),
        lastPlayed: Date.now(),
        settings: worldData.settings || {},
        metadata: {
          version: this.DB_VERSION,
          blockCount: 0,
          chunkCount: 0,
          ...worldData.metadata
        }
      };
      
      const transaction = this.db.transaction(['worlds'], 'readwrite');
      const store = transaction.objectStore('worlds');
      
      const request = store.add(world);
      
      request.onsuccess = () => {
        console.log(`Created world: ${world.name} (${worldId})`);
        resolve(worldId);
      };
      
      request.onerror = () => {
        console.error('Failed to create world:', request.error);
        reject(request.error);
      };
    });
  }

  async loadAllWorlds(): Promise<any[]> {
    if (!this.isBrowser) {
      return [];
    }
    
    try {
      await this.initDatabase();
    } catch (error) {
      console.error('Failed to initialize database for loading worlds:', error);
      return [];
    }
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        console.error('Database not initialized after successful init call');
        resolve([]);
        return;
      }
      
      try {
        const transaction = this.db.transaction(['worlds'], 'readonly');
        const store = transaction.objectStore('worlds');
        const index = store.index('lastPlayed');
        
        const request = index.getAll();
        
        // Let the operation complete naturally without artificial timeout
        console.log('Loading worlds without timeout restriction...');
        
        request.onsuccess = () => {
          try {
            const worlds = request.result.sort((a, b) => b.lastPlayed - a.lastPlayed);
            console.log(`Loaded ${worlds.length} worlds from database`);
            resolve(worlds);
          } catch (error) {
            console.error('Error processing loaded worlds:', error);
            resolve([]);
          }
        };
        
        request.onerror = () => {
          console.error('Failed to load worlds:', request.error);
          resolve([]); // Resolve with empty array instead of rejecting
        };
        
        transaction.onerror = () => {
          console.error('Transaction failed while loading worlds:', transaction.error);
          resolve([]);
        };
        
        transaction.onabort = () => {
          console.error('Transaction aborted while loading worlds');
          resolve([]);
        };
        
      } catch (error) {
        console.error('Error creating transaction for loading worlds:', error);
        resolve([]);
      }
    });
  }

  async loadWorld(worldId: string): Promise<any | null> {
    if (!this.isBrowser) {
      return null;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['worlds'], 'readonly');
      const store = transaction.objectStore('worlds');
      
      const request = store.get(worldId);
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        console.log(`Loaded world: ${request.result.name} (${worldId})`);
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error(`Failed to load world ${worldId}:`, request.error);
        reject(request.error);
      };
    });
  }

  async updateWorldLastPlayed(worldId: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['worlds'], 'readwrite');
      const store = transaction.objectStore('worlds');
      
      const getRequest = store.get(worldId);
      
      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          reject(new Error(`World ${worldId} not found`));
          return;
        }
        
        const world = getRequest.result;
        world.lastPlayed = Date.now();
        
        const putRequest = store.put(world);
        
        putRequest.onsuccess = () => {
          console.log(`Updated last played time for world ${worldId}`);
          resolve();
        };
        
        putRequest.onerror = () => {
          console.error(`Failed to update world ${worldId}:`, putRequest.error);
          reject(putRequest.error);
        };
      };
      
      getRequest.onerror = () => {
        console.error(`Failed to get world ${worldId}:`, getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  async deleteWorld(worldId: string): Promise<void> {
    if (!this.isBrowser) {
      throw new Error('Database operations not available in server environment');
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['worlds', 'chunks', 'players'], 'readwrite');
      
      let completedOperations = 0;
      let hasError = false;
      const totalOperations = 3;
      
      const onOperationComplete = () => {
        completedOperations++;
        if (completedOperations === totalOperations && !hasError) {
          console.log(`Successfully deleted world ${worldId} and all associated data`);
          resolve();
        }
      };
      
      const onError = (error: any, operation: string) => {
        if (!hasError) {
          hasError = true;
          console.error(`Failed to ${operation} for world ${worldId}:`, error);
          reject(error);
        }
      };
      
      // Delete world record
      const worldStore = transaction.objectStore('worlds');
      const deleteWorldRequest = worldStore.delete(worldId);
      
      deleteWorldRequest.onsuccess = onOperationComplete;
      deleteWorldRequest.onerror = () => onError(deleteWorldRequest.error, 'delete world');
      
      // Delete all chunks for this world
      const chunkStore = transaction.objectStore('chunks');
      const chunkIndex = chunkStore.index('worldId');
      const chunkCursor = chunkIndex.openCursor(worldId);
      
      const chunksToDelete: string[] = [];
      
      chunkCursor.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          chunksToDelete.push(cursor.primaryKey as string);
          cursor.continue();
        } else {
          // Delete all collected chunks
          if (chunksToDelete.length === 0) {
            onOperationComplete();
          } else {
            let deletedChunks = 0;
            chunksToDelete.forEach(chunkId => {
              const deleteChunkRequest = chunkStore.delete(chunkId);
              deleteChunkRequest.onsuccess = () => {
                deletedChunks++;
                if (deletedChunks === chunksToDelete.length) {
                  console.log(`Deleted ${chunksToDelete.length} chunks for world ${worldId}`);
                  onOperationComplete();
                }
              };
              deleteChunkRequest.onerror = () => onError(deleteChunkRequest.error, 'delete chunks');
            });
          }
        }
      };
      
      chunkCursor.onerror = () => onError(chunkCursor.error, 'find chunks');
      
      // Delete all players for this world
      const playerStore = transaction.objectStore('players');
      const playerIndex = playerStore.index('worldId');
      const playerCursor = playerIndex.openCursor(worldId);
      
      const playersToDelete: string[] = [];
      
      playerCursor.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          playersToDelete.push(cursor.primaryKey as string);
          cursor.continue();
        } else {
          // Delete all collected players
          if (playersToDelete.length === 0) {
            onOperationComplete();
          } else {
            let deletedPlayers = 0;
            playersToDelete.forEach(playerId => {
              const deletePlayerRequest = playerStore.delete(playerId);
              deletePlayerRequest.onsuccess = () => {
                deletedPlayers++;
                if (deletedPlayers === playersToDelete.length) {
                  console.log(`Deleted ${playersToDelete.length} players for world ${worldId}`);
                  onOperationComplete();
                }
              };
              deletePlayerRequest.onerror = () => onError(deletePlayerRequest.error, 'delete players');
            });
          }
        }
      };
      
      playerCursor.onerror = () => onError(playerCursor.error, 'find players');
    });
  }

  // Batch operations for efficiency
  async saveBulkChunks(chunks: WorldChunk[], worldId: string): Promise<void> {
    if (!this.isBrowser) {
      console.warn('Database operations not available in server environment');
      return;
    }
    
    if (chunks.length === 0) {
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      
      let savedCount = 0;
      let hasError = false;
      
      const onChunkSaved = () => {
        savedCount++;
        if (savedCount === chunks.length && !hasError) {
          console.log(`Bulk saved ${savedCount} chunks for world ${worldId}`);
          resolve();
        }
      };
      
      const onError = (error: any) => {
        if (!hasError) {
          hasError = true;
          console.error('Bulk chunk save failed:', error);
          reject(error);
        }
      };
      
      chunks.forEach(chunk => {
        try {
          const blocks = Array.from(chunk.blocks.entries()).map(([key, block]) => ({
            key,
            block
          }));
          
          const chunkData = {
            id: `${worldId}_${chunk.chunkX}_${chunk.chunkY}_${chunk.chunkZ || 0}`,
            worldId,
            chunkX: chunk.chunkX,
            chunkY: chunk.chunkY,
            chunkZ: chunk.chunkZ || 0,
            blocks,
            lastSaved: Date.now(),
            blockCount: chunk.blocks.size
          };
          
          const request = store.put(chunkData);
          request.onsuccess = onChunkSaved;
          request.onerror = () => onError(request.error);
        } catch (error) {
          onError(error);
        }
      });
    });
  }
  
  async clearAllData(worldId?: string): Promise<void> {
    // Return early if not in browser
    if (!this.isBrowser) {
      console.warn('Database operations not available in server environment');
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      if (worldId) {
        // Clear data for specific world
        this.deleteWorld(worldId).then(resolve).catch(reject);
      } else {
        // Clear all data (nuclear option)
        const storeNames = ['chunks', 'players', 'settings', 'worlds'];
        const transaction = this.db.transaction(storeNames, 'readwrite');
        
        let completedStores = 0;
        let hasError = false;
        
        const onStoreComplete = () => {
          completedStores++;
          if (completedStores === storeNames.length && !hasError) {
            console.log('All data cleared from database');
            resolve();
          }
        };
        
        const onError = (error: any) => {
          if (!hasError) {
            hasError = true;
            console.error('Failed to clear all data:', error);
            reject(error);
          }
        };
        
        storeNames.forEach(storeName => {
          const store = transaction.objectStore(storeName);
          const request = store.clear();
          
          request.onsuccess = onStoreComplete;
          request.onerror = () => onError(request.error);
        });
      }
    });
  }
  
  async getChunkIds(worldId?: string): Promise<string[]> {
    // Return empty array if not in browser
    if (!this.isBrowser) {
      return [];
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      
      if (worldId) {
        // Get chunks for specific world
        const index = store.index('worldId');
        const request = index.getAllKeys(worldId);
        
        request.onsuccess = () => {
          const chunkIds = request.result as string[];
          console.log(`Found ${chunkIds.length} chunks for world ${worldId}`);
          resolve(chunkIds);
        };
        
        request.onerror = () => {
          console.error(`Failed to get chunk IDs for world ${worldId}:`, request.error);
          reject(request.error);
        };
      } else {
        // Get all chunks
        const request = store.getAllKeys();
        
        request.onsuccess = () => {
          const chunkIds = request.result as string[];
          console.log(`Found ${chunkIds.length} total chunks`);
          resolve(chunkIds);
        };
        
        request.onerror = () => {
          console.error('Failed to get all chunk IDs:', request.error);
          reject(request.error);
        };
      }
    });
  }

  // Database maintenance and diagnostics
  async getDatabaseInfo(): Promise<{
    worlds: number;
    chunks: number;
    totalSize: number;
  }> {
    if (!this.isBrowser) {
      return { worlds: 0, chunks: 0, totalSize: 0 };
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['worlds', 'chunks'], 'readonly');
      
      let worldCount = 0;
      let chunkCount = 0;
      let completedCounts = 0;
      
      const onCountComplete = () => {
        completedCounts++;
        if (completedCounts === 2) {
          resolve({
            worlds: worldCount,
            chunks: chunkCount,
            totalSize: 0 // Size calculation would require more complex logic
          });
        }
      };
      
      // Count worlds
      const worldStore = transaction.objectStore('worlds');
      const worldCountRequest = worldStore.count();
      
      worldCountRequest.onsuccess = () => {
        worldCount = worldCountRequest.result;
        onCountComplete();
      };
      
      worldCountRequest.onerror = () => reject(worldCountRequest.error);
      
      // Count chunks
      const chunkStore = transaction.objectStore('chunks');
      const chunkCountRequest = chunkStore.count();
      
      chunkCountRequest.onsuccess = () => {
        chunkCount = chunkCountRequest.result;
        onCountComplete();
      };
      
      chunkCountRequest.onerror = () => reject(chunkCountRequest.error);
    });
  }
  
  // Compressed chunk storage methods for optimized memory usage
  
  async saveCompressedChunk(serializedChunk: ArrayBuffer, chunkX: number, chunkY: number, chunkZ: number, worldId: string): Promise<void> {
    if (!this.isBrowser) {
      throw new Error('IndexedDB not available in server environment');
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      
      const chunkData = {
        id: `${worldId}_${chunkX}_${chunkY}_${chunkZ}`,
        worldId,
        chunkX,
        chunkY,
        chunkZ,
        compressedData: serializedChunk,
        compressed: true, // Flag to identify compressed chunks
        savedAt: Date.now()
      };
      
      const request = store.put(chunkData);
      
      request.onsuccess = () => {
        console.log(`💾 Saved compressed chunk ${chunkX},${chunkY},${chunkZ} (${serializedChunk.byteLength} bytes)`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`Failed to save compressed chunk ${chunkX},${chunkY},${chunkZ}:`, request.error);
        reject(request.error);
      };
    });
  }
  
  async loadCompressedChunk(chunkX: number, chunkY: number, chunkZ: number, worldId: string): Promise<ArrayBuffer | null> {
    if (!this.isBrowser) {
      throw new Error('IndexedDB not available in server environment');
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const request = store.get(`${worldId}_${chunkX}_${chunkY}_${chunkZ}`);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.compressed && result.compressedData) {
          console.log(`📦 Loaded compressed chunk ${chunkX},${chunkY},${chunkZ} (${result.compressedData.byteLength} bytes)`);
          resolve(result.compressedData);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error(`Failed to load compressed chunk ${chunkX},${chunkY},${chunkZ}:`, request.error);
        reject(request.error);
      };
    });
  }
  
  async saveBulkCompressedChunks(chunks: CompressedChunk[], worldId: string): Promise<void> {
    if (!this.isBrowser || chunks.length === 0) {
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      
      let completedCount = 0;
      let hasError = false;
      
      const checkCompletion = () => {
        completedCount++;
        if (completedCount === chunks.length) {
          if (hasError) {
            reject(new Error('Some chunks failed to save'));
          } else {
            console.log(`💾 Bulk saved ${chunks.length} compressed chunks for world ${worldId}`);
            resolve();
          }
        }
      };
      
      for (const chunk of chunks) {
        const serialized = chunk.serialize();
        const chunkData = {
          id: `${worldId}_${chunk.chunkX}_${chunk.chunkY}_${chunk.chunkZ}`,
          worldId,
          chunkX: chunk.chunkX,
          chunkY: chunk.chunkY,
          chunkZ: chunk.chunkZ,
          compressedData: serialized,
          compressed: true,
          savedAt: Date.now()
        };
        
        const request = store.put(chunkData);
        
        request.onsuccess = () => {
          checkCompletion();
        };
        
        request.onerror = () => {
          console.error(`Failed to save compressed chunk ${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ}:`, request.error);
          hasError = true;
          checkCompletion();
        };
      }
    });
  }
  
  async getCompressedChunkIds(worldId: string): Promise<string[]> {
    if (!this.isBrowser) {
      return [];
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const index = store.index('worldId');
      const request = index.getAll(worldId);
      
      request.onsuccess = () => {
        const compressedChunkIds = request.result
          .filter(chunk => chunk.compressed)
          .map(chunk => `${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ}`);
        
        console.log(`Found ${compressedChunkIds.length} compressed chunks for world ${worldId}`);
        resolve(compressedChunkIds);
      };
      
      request.onerror = () => {
        console.error('Failed to get compressed chunk IDs:', request.error);
        reject(request.error);
      };
    });
  }
  
  async clearCompressedChunks(worldId: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      const index = store.index('worldId');
      const request = index.openCursor(worldId);
      
      let deletedCount = 0;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (cursor.value.compressed) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          console.log(`🗑️ Cleared ${deletedCount} compressed chunks for world ${worldId}`);
          resolve();
        }
      };
      
      request.onerror = () => {
        console.error('Failed to clear compressed chunks:', request.error);
        reject(request.error);
      };
    });
  }
  
  // Get storage efficiency stats
  async getStorageEfficiencyStats(): Promise<{
    legacyChunks: number;
    compressedChunks: number;
    legacySize: number;
    compressedSize: number;
    compressionRatio: string;
  }> {
    if (!this.isBrowser) {
      return { legacyChunks: 0, compressedChunks: 0, legacySize: 0, compressedSize: 0, compressionRatio: 'N/A' };
    }
    
    await this.initDatabase();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      const transaction = this.db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const request = store.getAll();
      
      request.onsuccess = () => {
        let legacyChunks = 0;
        let compressedChunks = 0;
        let legacySize = 0;
        let compressedSize = 0;
        
        for (const chunk of request.result) {
          if (chunk.compressed && chunk.compressedData) {
            compressedChunks++;
            compressedSize += chunk.compressedData.byteLength;
          } else if (chunk.blocks) {
            legacyChunks++;
            // Estimate legacy chunk size
            legacySize += JSON.stringify(chunk).length;
          }
        }
        
        const compressionRatio = legacySize > 0 ? 
          `${(compressedSize / (legacySize + compressedSize) * 100).toFixed(1)}%` : 
          'N/A';
        
        resolve({
          legacyChunks,
          compressedChunks,
          legacySize,
          compressedSize,
          compressionRatio
        });
      };
      
      request.onerror = () => {
        console.error('Failed to get storage efficiency stats:', request.error);
        reject(request.error);
      };
    });
  }
}
