<script>
  let { children } = $props();
</script>

<nav>
  <a href="/">Home</a>
  <a href="/docs">Docs</a>
</nav>

<main>
  {@render children()}
</main>
