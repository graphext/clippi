import { isActionable, scrollIntoViewIfNeeded } from "@clippi/core";
import { GhostCursor } from "./cursor/ghost-cursor.js";
import { Tooltip } from "./tooltip/tooltip.js";
import { Highlight } from "./highlight/highlight.js";
import { ConfirmationFallback } from "./confirmation/fallback.js";
import {
  applyTheme,
  resolveTheme,
  watchSystemTheme,
  type ThemeOption,
} from "./themes/apply.js";
import { themes } from "./themes/presets.js";

/**
 * Cursor configuration
 */
export interface CursorConfig {
  /** Theme: 'light', 'dark', 'auto', or custom theme object */
  theme?: ThemeOption;
  /** Timeout before showing "Did you do it?" confirmation (ms) */
  confirmationTimeout?: number;
  /** Whether to show pulsing highlight */
  pulseHighlight?: boolean;
  /** Padding around highlighted elements */
  highlightPadding?: number;
}

/**
 * Point-to options
 */
export interface PointToOptions {
  /** Instruction to display in tooltip */
  instruction: string;
  /** Current step index (0-based) */
  stepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Callback when user closes the guide */
  onCancel?: () => void;
  /** Callback when user confirms step manually */
  onConfirm?: () => void;
}

/**
 * Cursor - Main orchestrator for visual guidance components
 *
 * Combines ghost cursor, tooltip, highlight, and confirmation fallback
 * into a cohesive visual guidance system.
 */
export class Cursor {
  private ghostCursor: GhostCursor;
  private tooltip: Tooltip;
  private highlight: Highlight;
  private confirmationFallback: ConfirmationFallback;
  private config: CursorConfig;
  private currentTarget: Element | null = null;
  private cleanupSystemTheme: (() => void) | null = null;
  private cleanupEventListeners: (() => void) | null = null;

  constructor(config: CursorConfig = {}) {
    this.config = {
      confirmationTimeout: 10000,
      pulseHighlight: true,
      highlightPadding: 4,
      ...config,
    };

    this.ghostCursor = new GhostCursor();
    this.tooltip = new Tooltip();
    this.highlight = new Highlight();
    this.confirmationFallback = new ConfirmationFallback();

    // Apply theme
    if (this.config.theme) {
      const theme = resolveTheme(this.config.theme);
      applyTheme(theme);

      // Watch for system theme changes if 'auto'
      if (this.config.theme === "auto") {
        this.cleanupSystemTheme = watchSystemTheme((isDark) => {
          applyTheme(isDark ? themes.dark : themes.light);
        });
      }
    }

    // Set up scroll/resize handlers
    this.setupEventListeners();
  }

  /**
   * Set up global event listeners
   */
  private setupEventListeners(): void {
    if (typeof window === "undefined") return;

    // Reposition all visuals (highlight, tooltip, and ghost cursor) on scroll and resize
    const handleReposition = () => {
      if (this.currentTarget) {
        this.highlight.reposition(this.config.highlightPadding);
        this.tooltip.reposition(this.currentTarget);

        // Also reposition ghost cursor to updated element center
        const rect = this.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this.ghostCursor.moveTo(centerX, centerY);
      }
    };

    window.addEventListener("scroll", handleReposition, { passive: true });
    window.addEventListener("resize", handleReposition, { passive: true });

    this.cleanupEventListeners = () => {
      window.removeEventListener("scroll", handleReposition);
      window.removeEventListener("resize", handleReposition);
    };
  }

  /**
   * Point cursor to an element with tooltip and highlight
   *
   * @param element Target element
   * @param options Point-to options
   */
  async pointTo(
    element: Element | null,
    options: PointToOptions,
  ): Promise<void> {
    // Hide any existing visuals first
    this.hide();

    if (!element) {
      // No element - show tooltip only at a default position
      this.showTooltipOnly(options);
      return;
    }

    // Check actionability for visual guidance purposes
    // We use the full check but treat "disabled" and "covered" as pointable:
    // - disabled: element is still visible, we're guiding not clicking
    // - covered: element may be behind a modal overlay but still the right target
    const actionability = isActionable(element);

    if (
      actionability.reason === "hidden" ||
      actionability.reason === "no_size" ||
      actionability.reason === "not_attached"
    ) {
      // Element is truly invisible - show tooltip only
      this.showTooltipOnly(options);
      return;
    }

    this.currentTarget = element;

    if (actionability.reason === "out_of_viewport") {
      scrollIntoViewIfNeeded(element);
      // Wait for scroll to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Get element position (refresh after potential scroll)
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Animate cursor to element, then snap to final position
    // (viewport may shift during the 500ms animation)
    this.ghostCursor.show();
    await this.ghostCursor.animateTo(centerX, centerY);

    const postAnimRect = element.getBoundingClientRect();
    this.ghostCursor.moveTo(
      postAnimRect.left + postAnimRect.width / 2,
      postAnimRect.top + postAnimRect.height / 2,
    );

    // Show highlight
    this.highlight.show(element, {
      pulse: this.config.pulseHighlight,
      padding: this.config.highlightPadding,
    });

    // Show tooltip
    this.tooltip.show(element, {
      instruction: options.instruction,
      stepIndex: options.stepIndex,
      totalSteps: options.totalSteps,
      onClose: options.onCancel,
      onConfirm: options.onConfirm,
    });

    // Start confirmation timer
    if (
      this.config.confirmationTimeout &&
      this.config.confirmationTimeout > 0
    ) {
      this.confirmationFallback.start(this.config.confirmationTimeout, () => {
        this.tooltip.showConfirmation();
      });
    }
  }

  /**
   * Show tooltip without targeting an element
   */
  private showTooltipOnly(options: PointToOptions): void {
    // Create a temporary position at screen center
    if (typeof document === "undefined") return;

    const tempElement = document.createElement("div");
    tempElement.style.cssText = `
      position: fixed;
      left: 50%;
      top: 50%;
      width: 1px;
      height: 1px;
      pointer-events: none;
    `;
    document.body.appendChild(tempElement);

    this.tooltip.show(tempElement, {
      instruction: options.instruction,
      stepIndex: options.stepIndex,
      totalSteps: options.totalSteps,
      onClose: options.onCancel,
      onConfirm: options.onConfirm,
    });

    // Clean up temp element
    tempElement.remove();
  }

  /**
   * Show the confirmation prompt manually
   */
  showConfirmation(): void {
    this.tooltip.showConfirmation();
  }

  /**
   * Hide the confirmation prompt
   */
  hideConfirmation(): void {
    this.tooltip.hideConfirmation();
  }

  /**
   * Hide all visual elements
   */
  hide(): void {
    this.ghostCursor.hide();
    this.tooltip.hide();
    this.highlight.hide();
    this.confirmationFallback.stop();
    this.currentTarget = null;
  }

  /**
   * Update the tooltip instruction
   *
   * @param instruction New instruction text
   */
  updateInstruction(instruction: string): void {
    this.tooltip.update({ instruction });
  }

  /**
   * Check if cursor is currently visible
   */
  isVisible(): boolean {
    return this.ghostCursor.getState() !== "hidden";
  }

  /**
   * Get the current target element
   */
  getCurrentTarget(): Element | null {
    return this.currentTarget;
  }

  /**
   * Apply a new theme
   *
   * @param theme Theme option
   */
  setTheme(theme: ThemeOption): void {
    this.config.theme = theme;
    const resolved = resolveTheme(theme);
    applyTheme(resolved);

    // Update system theme watcher
    if (this.cleanupSystemTheme) {
      this.cleanupSystemTheme();
      this.cleanupSystemTheme = null;
    }

    if (theme === "auto") {
      this.cleanupSystemTheme = watchSystemTheme((isDark) => {
        applyTheme(isDark ? themes.dark : themes.light);
      });
    }
  }

  /**
   * Destroy the cursor and clean up resources
   */
  destroy(): void {
    this.hide();
    this.ghostCursor.destroy();
    this.tooltip.destroy();
    this.highlight.destroy();
    this.confirmationFallback.destroy();

    if (this.cleanupSystemTheme) {
      this.cleanupSystemTheme();
      this.cleanupSystemTheme = null;
    }

    if (this.cleanupEventListeners) {
      this.cleanupEventListeners();
      this.cleanupEventListeners = null;
    }
  }

  /**
   * Static factory method
   *
   * @param config Cursor configuration
   * @returns Cursor instance
   */
  static init(config: CursorConfig = {}): Cursor {
    return new Cursor(config);
  }
}
