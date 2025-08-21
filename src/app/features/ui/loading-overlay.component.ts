import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingSpinnerComponent } from './loading-spinner.component';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent],
  template: `
    <div class="loading-overlay" *ngIf="isVisible" [class.full-screen]="fullScreen">
      <div class="loading-content">
        <app-loading-spinner 
          [size]="spinnerSize" 
          [text]="loadingText">
        </app-loading-spinner>
        
        <div class="progress-bar" *ngIf="showProgress && progress >= 0">
          <div class="progress-fill" [style.width.%]="progress"></div>
        </div>
        
        <div class="loading-details" *ngIf="details">
          <p>{{ details }}</p>
        </div>
        
        <button class="cancel-btn" *ngIf="cancellable" (click)="onCancel()">
          Cancel
        </button>
      </div>
    </div>
  `,
  styles: [`
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.3s ease-out;
    }

    .loading-overlay.full-screen {
      position: fixed;
    }

    .loading-content {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      padding: 32px;
      border-radius: 16px;
      border: 2px solid rgba(0, 212, 255, 0.3);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      text-align: center;
      min-width: 300px;
      max-width: 500px;
      animation: slideIn 0.4s ease-out;
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      margin: 20px 0;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00d4ff, #0095cc);
      border-radius: 4px;
      transition: width 0.3s ease;
      animation: shimmer 2s infinite;
    }

    .loading-details {
      margin-top: 16px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      line-height: 1.4;
    }

    .cancel-btn {
      margin-top: 24px;
      padding: 8px 24px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .cancel-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideIn {
      from { 
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to { 
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `]
})
export class LoadingOverlayComponent {
  @Input() isVisible = false;
  @Input() loadingText = 'Loading...';
  @Input() details?: string;
  @Input() progress = -1; // -1 means no progress bar
  @Input() showProgress = false;
  @Input() cancellable = false;
  @Input() fullScreen = true;
  @Input() spinnerSize: 'small' | 'medium' | 'large' = 'large';

  onCancel(): void {
    // Emit cancel event - parent component should handle this
    console.log('Loading cancelled');
  }
}
