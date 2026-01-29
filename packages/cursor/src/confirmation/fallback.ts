/**
 * Confirmation fallback - manages the "Did you do it?" prompt
 *
 * Shows when automatic step detection doesn't trigger within the timeout.
 */
export class ConfirmationFallback {
  private timer: ReturnType<typeof setTimeout> | null = null
  private onTimeout: (() => void) | null = null

  /**
   * Start the confirmation timer
   *
   * @param timeout Time in ms before showing confirmation
   * @param callback Function to call when timeout is reached
   */
  start(timeout: number, callback: () => void): void {
    this.stop()
    this.onTimeout = callback

    if (timeout > 0) {
      this.timer = setTimeout(() => {
        this.onTimeout?.()
      }, timeout)
    }
  }

  /**
   * Stop the confirmation timer
   */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.onTimeout = null
  }

  /**
   * Check if timer is running
   */
  isRunning(): boolean {
    return this.timer !== null
  }

  /**
   * Destroy the fallback manager
   */
  destroy(): void {
    this.stop()
  }
}
