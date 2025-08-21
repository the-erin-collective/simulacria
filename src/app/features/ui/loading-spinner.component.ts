import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-spinner" [class.large]="size === 'large'" [class.small]="size === 'small'">
      <div class="spinner-ring"></div>
      <div class="loading-text" *ngIf="text">
        {{ text }}
      </div>
    </div>
  `,
  styles: [`
    .loading-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .spinner-ring {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid #00d4ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-spinner.large .spinner-ring {
      width: 60px;
      height: 60px;
      border-width: 6px;
    }

    .loading-spinner.small .spinner-ring {
      width: 24px;
      height: 24px;
      border-width: 3px;
    }

    .loading-text {
      color: #ffffff;
      font-size: 14px;
      font-weight: 500;
      text-align: center;
      animation: pulse 2s ease-in-out infinite;
    }

    .loading-spinner.large .loading-text {
      font-size: 16px;
    }

    .loading-spinner.small .loading-text {
      font-size: 12px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  `]
})
export class LoadingSpinnerComponent {
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() text?: string;
}
