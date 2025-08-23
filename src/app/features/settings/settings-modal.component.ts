import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameSettings, DEFAULT_SETTINGS } from '../../shared/models/game.model';
import { MouseControlService } from '../../core/services/mouse-control.service';
import { ChunkManagerService } from '../../core/services/chunk-manager.service';
import { DBService } from '../../core/services/db.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss']
})
export class SettingsModalComponent implements OnInit, OnDestroy {
  @Input() visible = false;
  @Input() showReturnToMenu = false; // Control whether "Return to Menu" button is shown
  @Output() close = new EventEmitter<void>();
  @Output() saveSettings = new EventEmitter<GameSettings>();
  @Output() returnToMainMenu = new EventEmitter<void>();
  
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  Math = Math; // Make Math available in template
  private autoSaveTimeout?: ReturnType<typeof setTimeout>;
  
  constructor(
    private mouseControlService: MouseControlService,
    private chunkManagerService: ChunkManagerService,
    private dbService: DBService
  ) {}
  
  ngOnInit(): void {
    this.loadSettings();
  }
  
  ngOnDestroy(): void {
    // Clear auto-save timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    // Ensure settings are saved when component is destroyed
    this.saveSettings.emit(this.settings);
  }
  
  async loadSettings(): Promise<void> {
    try {
      const savedSettings = await this.dbService.loadGameSettings();
      if (savedSettings) {
        this.settings = savedSettings;
        
        // Apply settings to services
        this.updateMouseSensitivity();
        this.updateMouseYInversion();
        this.updateRenderDistance();
        this.updateAutoSaveInterval();
        
        console.log('Settings loaded and applied:', this.settings);
      } else {
        // No saved settings found, use defaults and save them
        console.log('No saved settings found, using defaults');
        await this.dbService.saveGameSettings(this.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  updateMouseSensitivity(): void {
    this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
    // Auto-save settings when changed
    this.autoSaveSettings();
  }

  updateMouseYInversion(): void {
    this.mouseControlService.setMouseYInversion(this.settings.invertMouseY);
    // Auto-save settings when changed
    this.autoSaveSettings();
  }
  
  updateRenderDistance(): void {
    this.chunkManagerService.setRenderDistance(this.settings.renderDistance);
    // Auto-save settings when changed
    this.autoSaveSettings();
  }
  
  updateAutoSaveInterval(): void {
    this.chunkManagerService.setSaveInterval(this.settings.autoSaveInterval);
    // Auto-save settings when changed
    this.autoSaveSettings();
  }
  
  autoSaveSettings(): void {
    // Debounced auto-save to prevent too frequent saves
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    this.autoSaveTimeout = setTimeout(async () => {
      try {
        await this.dbService.saveGameSettings(this.settings);
        console.log('Settings auto-saved');
      } catch (error) {
        console.error('Failed to auto-save settings:', error);
      }
    }, 1000); // Auto-save after 1 second of no changes
  }
  
  async resetToDefaults(): Promise<void> {
    try {
      this.settings = { ...DEFAULT_SETTINGS };
      
      // Apply default settings immediately
      this.updateMouseSensitivity();
      this.updateMouseYInversion();
      this.updateRenderDistance();
      this.updateAutoSaveInterval();
      
      // Save default settings to database
      await this.dbService.saveGameSettings(this.settings);
      
      console.log('Settings reset to defaults and saved');
    } catch (error) {
      console.error('Failed to save default settings:', error);
    }
  }
  
  async saveWorld(): Promise<void> {
    try {
      await this.chunkManagerService.saveAllChunks();
      await this.dbService.saveGameSettings(this.settings);
      console.log('World and settings saved successfully!');
    } catch (error) {
      console.error('Failed to save world and settings:', error);
      throw error; // Re-throw to let calling methods handle it
    }
  }
  
  async saveAndClose(): Promise<void> {
    try {
      // Save settings to database
      await this.dbService.saveGameSettings(this.settings);
      
      // Apply settings immediately
      this.updateMouseSensitivity();
      this.updateRenderDistance();
      this.updateAutoSaveInterval();
      
      // Save world if needed
      await this.saveWorld();
      
      // Emit settings to parent component
      this.saveSettings.emit(this.settings);
      
      // Close modal
      this.close.emit();
      
      console.log('Settings saved and modal closed successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      // Still close the modal even if saving failed
      this.close.emit();
    }
  }
  
  closeModal(): void {
    console.log('Settings modal closeModal() called');
    // Close without saving changes (revert to saved settings)
    this.loadSettings().then(() => {
      this.close.emit();
      console.log('Settings modal close event emitted');
    }).catch(() => {
      // Even if loading settings fails, still close the modal
      this.close.emit();
      console.log('Settings modal close event emitted (fallback)');
    });
  }
  
  async returnToMenu(): Promise<void> {
    console.log('🔴 Settings modal returnToMenu() called');
    console.trace('Settings returnToMenu call stack:');
    try {
      // Save settings to database first
      await this.dbService.saveGameSettings(this.settings);
      
      // Apply settings immediately
      this.updateMouseSensitivity();
      this.updateRenderDistance();
      this.updateAutoSaveInterval();
      
      // Save world before returning to menu
      await this.saveWorld();
      
      // Emit settings to parent component
      this.saveSettings.emit(this.settings);
      
      // Emit return to main menu event
      console.log('🔴 Settings modal emitting returnToMainMenu event');
      this.returnToMainMenu.emit();
      
      console.log('Settings saved and returning to main menu');
    } catch (error) {
      console.error('Failed to save settings before returning to menu:', error);
      // Still return to menu even if saving failed
      console.log('🔴 Settings modal emitting returnToMainMenu event (error case)');
      this.returnToMainMenu.emit();
    }
  }
}
