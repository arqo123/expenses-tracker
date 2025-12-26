export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastOpenedAt: Date | null;
  lastSuccessAt: Date | null;
}

interface CircuitBreakerConfig {
  threshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failureCount = 0;
  private lastOpenedAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  isAllowed(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const now = Date.now();
      const elapsed = this.lastOpenedAt
        ? now - this.lastOpenedAt.getTime()
        : Infinity;

      if (elapsed > this.config.cooldownMs) {
        this.state = 'half_open';
        this.failureCount = 0;
        console.log('[CircuitBreaker] Transitioning to half_open');
        return true;
      }

      return false;
    }

    // half_open - allow one request
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.lastSuccessAt = new Date();

    if (this.state === 'half_open') {
      this.state = 'closed';
      console.log('[CircuitBreaker] Recovered, transitioning to closed');
    }
  }

  recordFailure(): void {
    this.failureCount++;
    console.log(`[CircuitBreaker] Failure recorded (${this.failureCount}/${this.config.threshold})`);

    if (this.failureCount >= this.config.threshold) {
      this.state = 'open';
      this.lastOpenedAt = new Date();
      console.log('[CircuitBreaker] Circuit opened, will retry after cooldown');
    }
  }

  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastOpenedAt: this.lastOpenedAt,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastOpenedAt = null;
    console.log('[CircuitBreaker] Reset to closed');
  }
}
