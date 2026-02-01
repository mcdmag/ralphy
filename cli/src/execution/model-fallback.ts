import { logInfo, logWarn } from "../ui/logger.ts";

/**
 * Model configuration for fallback behavior
 */
export interface ModelConfig {
	/** Primary model to use (default: Opus) */
	primary: string;
	/** Fallback model when primary is rate-limited */
	fallback: string;
	/** Time in milliseconds to wait before retrying primary model (default: 5 minutes) */
	retryInterval: number;
}

/**
 * Default model configurations for different engines
 */
export const DEFAULT_MODEL_CONFIG: Record<string, ModelConfig> = {
	opencode: {
		primary: "anthropic/claude-opus-4-20250514",
		fallback: "google/gemini-2.5-pro-preview-05-06",
		retryInterval: 5 * 60 * 1000, // 5 minutes
	},
	claude: {
		primary: "claude-opus-4-20250514",
		fallback: "claude-sonnet-4-20250514", // Claude CLI fallback
		retryInterval: 5 * 60 * 1000,
	},
};

/**
 * State for model fallback tracking
 */
interface FallbackState {
	/** Whether we're currently in fallback mode */
	inFallback: boolean;
	/** Timestamp when fallback started */
	fallbackStartTime: number | null;
	/** Timestamp of last rate limit error */
	lastRateLimitTime: number | null;
	/** Number of consecutive rate limit errors */
	rateLimitCount: number;
}

/**
 * Model Fallback Manager
 *
 * Handles automatic model switching when rate limits are encountered:
 * - Defaults to primary model (Opus)
 * - Falls back to secondary model (Gemini) on rate limit errors
 * - Retries primary model after configured interval (5 minutes)
 */
export class ModelFallbackManager {
	private state: FallbackState = {
		inFallback: false,
		fallbackStartTime: null,
		lastRateLimitTime: null,
		rateLimitCount: 0,
	};
	private config: ModelConfig;
	private engineName: string;

	constructor(engineName: string, customConfig?: Partial<ModelConfig>) {
		this.engineName = engineName;
		const defaultConfig = DEFAULT_MODEL_CONFIG[engineName] || DEFAULT_MODEL_CONFIG.opencode;
		this.config = {
			...defaultConfig,
			...customConfig,
		};
	}

	/**
	 * Get the current model to use
	 *
	 * Returns primary model unless in fallback mode and within retry interval.
	 * Automatically switches back to primary if retry interval has passed.
	 */
	getCurrentModel(): string {
		// If not in fallback, use primary
		if (!this.state.inFallback) {
			return this.config.primary;
		}

		// Check if retry interval has passed
		if (this.state.fallbackStartTime) {
			const elapsed = Date.now() - this.state.fallbackStartTime;
			if (elapsed >= this.config.retryInterval) {
				logInfo(
					`⏰ Retry interval passed (${Math.round(elapsed / 1000 / 60)}min). Retrying primary model: ${this.config.primary}`,
				);
				this.resetTorimary();
				return this.config.primary;
			}

			// Still in fallback period
			const remaining = Math.ceil((this.config.retryInterval - elapsed) / 1000 / 60);
			return this.config.fallback;
		}

		return this.config.fallback;
	}

	/**
	 * Check if a given error indicates a rate limit
	 */
	isRateLimitError(error: string): boolean {
		const rateLimitPatterns = [
			/rate limit/i,
			/too many requests/i,
			/429/,
			/quota exceeded/i,
			/overloaded/i,
			/capacity/i,
			/temporarily unavailable/i,
			/resource exhausted/i,
			/api_error.*overloaded/i,
		];

		return rateLimitPatterns.some((pattern) => pattern.test(error));
	}

	/**
	 * Handle an error from execution
	 *
	 * If it's a rate limit error, switches to fallback model.
	 * Returns true if we should retry with a different model.
	 */
	handleError(error: string): { shouldRetry: boolean; newModel: string | null } {
		if (!this.isRateLimitError(error)) {
			return { shouldRetry: false, newModel: null };
		}

		this.state.rateLimitCount++;
		this.state.lastRateLimitTime = Date.now();

		// If not yet in fallback, switch to fallback
		if (!this.state.inFallback) {
			this.state.inFallback = true;
			this.state.fallbackStartTime = Date.now();

			logWarn(
				`⚠️ Rate limit detected on ${this.config.primary}. Switching to fallback: ${this.config.fallback}`,
			);
			logInfo(`   Will retry primary model in ${this.config.retryInterval / 1000 / 60} minutes`);

			return { shouldRetry: true, newModel: this.config.fallback };
		}

		// Already in fallback, just report
		logWarn(`⚠️ Rate limit error while using fallback model`);
		return { shouldRetry: false, newModel: null };
	}

	/**
	 * Record a successful execution
	 *
	 * If using primary model, confirms it's working again.
	 */
	recordSuccess(model: string): void {
		if (model === this.config.primary && this.state.inFallback) {
			logInfo(`✅ Primary model ${this.config.primary} is working again!`);
			this.resetTorimary();
		}
		// Reset consecutive error count on success
		this.state.rateLimitCount = 0;
	}

	/**
	 * Reset to primary model
	 */
	private resetTorimary(): void {
		this.state.inFallback = false;
		this.state.fallbackStartTime = null;
		this.state.rateLimitCount = 0;
	}

	/**
	 * Get current status for display
	 */
	getStatus(): {
		currentModel: string;
		inFallback: boolean;
		minutesUntilRetry: number | null;
	} {
		const currentModel = this.getCurrentModel();
		let minutesUntilRetry: number | null = null;

		if (this.state.inFallback && this.state.fallbackStartTime) {
			const elapsed = Date.now() - this.state.fallbackStartTime;
			const remaining = this.config.retryInterval - elapsed;
			if (remaining > 0) {
				minutesUntilRetry = Math.ceil(remaining / 1000 / 60);
			}
		}

		return {
			currentModel,
			inFallback: this.state.inFallback,
			minutesUntilRetry,
		};
	}

	/**
	 * Get the primary model name
	 */
	getPrimaryModel(): string {
		return this.config.primary;
	}

	/**
	 * Get the fallback model name
	 */
	getFallbackModel(): string {
		return this.config.fallback;
	}
}

/**
 * Create a model fallback manager for a given engine
 */
export function createModelFallbackManager(
	engineName: string,
	customConfig?: Partial<ModelConfig>,
): ModelFallbackManager {
	return new ModelFallbackManager(engineName, customConfig);
}
