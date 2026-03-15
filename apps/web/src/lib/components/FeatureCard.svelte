<script lang="ts">
	let { icon, title, description }: {
		icon: string;
		title: string;
		description: string;
	} = $props();
</script>

<div class="group rounded-xl border border-border bg-bg-surface p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-deep hover:shadow-lg hover:shadow-accent-deep/5">
	<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-bg-elevated text-accent">
		{@html icon}
	</div>
	<h3 class="font-display text-lg font-semibold text-text-primary">{title}</h3>
	<p class="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
</div>
