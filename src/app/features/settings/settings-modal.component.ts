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
  @Output() close = new EventEmitter<void>();
  @Output() saveSettings = new EventEmitter<GameSettings>();
  @Output() returnToMainMenu = new EventEmitter<void>();
  
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  Math = Math; // Make Math available in template
  
  constructor(
    private mouseControlService: MouseControlService,
    private chunkManagerService: ChunkManagerService,
    private dbService: DBService
  ) {}
  
  ngOnInit(): void {
    this.loadSettings();
  }
  
  ngOnDestroy(): void {
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
        this.updateRenderDistance();
        this.updateAutoSaveInterval();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  updateMouseSensitivity(): void {
    this.mouseControlService.setMouseSensitivity(this.settings.mouseSensitivity);
  }
  
  updateRenderDistance(): void {
    this.chunkManagerService.setRenderDistance(this.settings.renderDistance);
  }
  
  updateAutoSaveInterval(): void {
    this.chunkManagerService.setSaveInterval(this.settings.autoSaveInterval);
  }
  
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.updateMouseSensitivity();
    this.updateRenderDistance();
    this.updateAutoSaveInterval();
  }
  
  async saveWorld(): Promise<void> {
    try {
      await this.chunkManagerService.saveAllChunks();
      await this.dbService.saveGameSettings(this.settings);
      console.log('World and settings saved successfully!');
    } catch (error) {
      console.error('Failed to save world:', error);
    }
  }
  
  async saveAndClose(): Promise<void> {
    await this.saveWorld();
    this.saveSettings.emit(this.settings);
    this.close.emit();
  }
  
  returnToMenu(): void {
    this.saveWorld();
    this.returnToMainMenu.emit();
  }
}
