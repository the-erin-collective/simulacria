import { Component, OnInit, Output, EventEmitter, signal, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DBService } from '../../../core/services/db.service';

@Component({
  selector: 'app-database-splash',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './database-splash.component.html',
  styleUrls: ['./database-splash.component.scss']
})
export class DatabaseSplashComponent implements OnInit {
  @Output() initializationComplete = new EventEmitter<boolean>();
  
  // Use signals for better compatibility with zoneless change detection
  loading = signal(true);
  progress = signal(0);
  statusMessage = signal('Initializing game database...');
  error = signal<string | null>(null);
  
  private isBrowser: boolean;
  
  private progressSteps = [
    { progress: 20, message: 'Checking browser compatibility...' },
    { progress: 40, message: 'Opening IndexedDB connection...' },
    { progress: 60, message: 'Setting up database schema...' },
    { progress: 80, message: 'Optimizing for performance...' },
    { progress: 100, message: 'Database ready!' }
  ];
  
  constructor(
    private dbService: DBService, 
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  
  ngOnInit() {
    console.log('🎯 DatabaseSplashComponent initialized');
    
    if (!this.isBrowser) {
      console.log('🖥️ Running in server environment - skipping database initialization');
      // In server environment, immediately emit success to allow the app to render
      setTimeout(() => {
        console.log('🚀 Server-side: emitting initialization complete');
        this.initializationComplete.emit(true);
      }, 100);
      return;
    }
    
    console.log('🌐 Running in browser - starting database initialization');
    this.initializeDatabase();
  }
  
  private async initializeDatabase() {
    if (!this.isBrowser) {
      console.warn('⚠️ initializeDatabase called in non-browser environment');
      return;
    }
    
    try {
      console.log('🚀 Starting database initialization...');
      
      // Simulate progress steps for better UX
      this.simulateProgress();
      
      // Actually initialize the database
      console.log('📡 Calling dbService.ensureInitialized()...');
      await this.dbService.ensureInitialized();
      console.log('✅ Database initialization completed successfully');
      
      // Set final success state
      this.progress.set(100);
      this.statusMessage.set('✅ Database initialized successfully!');
      
      // Force change detection in zoneless mode
      this.cdr.detectChanges();
      
      // Brief delay to show success message
      setTimeout(() => {
        this.loading.set(false);
        this.cdr.detectChanges(); // Force change detection
        console.log('🎉 Emitting initialization complete = true');
        this.initializationComplete.emit(true);
      }, 800);
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      this.error.set(error instanceof Error ? error.message : 'Unknown database error');
      this.progress.set(0);
      this.statusMessage.set('❌ Database initialization failed');
      
      // Force change detection in zoneless mode
      this.cdr.detectChanges();
      
      // Database is required - emit failure to show error UI
      setTimeout(() => {
        this.loading.set(false);
        this.cdr.detectChanges(); // Force change detection
        console.log('💥 Emitting initialization complete = false (database required)');
        this.initializationComplete.emit(false);
      }, 1000);
    }
  }
  
  private simulateProgress() {
    if (!this.isBrowser) return;
    
    let stepIndex = 0;
    
    const updateProgress = () => {
      if (stepIndex < this.progressSteps.length) {
        const step = this.progressSteps[stepIndex];
        console.log(`📊 Progress: ${step.progress}% - ${step.message}`);
        this.progress.set(step.progress);
        this.statusMessage.set(step.message);
        stepIndex++;
        
        // Force change detection in zoneless mode
        this.cdr.detectChanges();
        
        // Shorter intervals for smoother progress
        setTimeout(updateProgress, 300);
      }
    };
    
    updateProgress();
  }
  
  retryInitialization() {
    if (!this.isBrowser) {
      console.warn('⚠️ Retry called in non-browser environment');
      return;
    }
    
    console.log('🔄 Retrying database initialization...');
    this.error.set(null);
    this.loading.set(true);
    this.progress.set(0);
    this.statusMessage.set('Retrying database initialization...');
    this.cdr.detectChanges(); // Force change detection
    this.initializeDatabase();
  }
}