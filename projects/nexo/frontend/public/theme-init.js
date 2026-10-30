// Apply the theme before rendering to avoid a flash of the wrong background.
try {
  var savedTheme = localStorage.getItem('nexo:theme')
  var initialTheme =
    savedTheme === 'dark' || savedTheme === 'light'
      ? savedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.dataset.theme = initialTheme
  document.documentElement.style.colorScheme = initialTheme
} catch {
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.style.colorScheme = 'dark'
}
