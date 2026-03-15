<div class="mosaic" aria-hidden="true"></div>

<style>
	.mosaic {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 0;
	}

	.mosaic::before {
		content: "";
		position: absolute;
		inset: -20%;
		background:
			/* Diagonal grid lines */
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 60px,
				rgba(232, 93, 42, 0.03) 60px,
				rgba(232, 93, 42, 0.03) 61px
			),
			repeating-linear-gradient(
				-45deg,
				transparent,
				transparent 60px,
				rgba(201, 168, 76, 0.025) 60px,
				rgba(201, 168, 76, 0.025) 61px
			),
			/* Larger diamond grid */
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 120px,
				rgba(232, 93, 42, 0.04) 120px,
				rgba(232, 93, 42, 0.04) 122px
			),
			repeating-linear-gradient(
				-45deg,
				transparent,
				transparent 120px,
				rgba(201, 168, 76, 0.03) 120px,
				rgba(201, 168, 76, 0.03) 122px
			),
			/* Subtle dot grid */
			radial-gradient(
				circle,
				rgba(232, 93, 42, 0.06) 1px,
				transparent 1px
			);
		background-size:
			auto,
			auto,
			auto,
			auto,
			30px 30px;
		animation: mosaic-drift 60s linear infinite;
	}

	.mosaic::after {
		content: "";
		position: absolute;
		inset: 0;
		background:
			/* Radial fade from center */
			radial-gradient(
				ellipse 80% 70% at 50% 40%,
				transparent 0%,
				var(--color-bg-base) 100%
			),
			/* Bottom fade */
			linear-gradient(
				to bottom,
				transparent 50%,
				var(--color-bg-base) 100%
			);
	}

	@keyframes mosaic-drift {
		from {
			transform: translate(0, 0);
		}
		to {
			transform: translate(30px, 30px);
		}
	}
</style>
