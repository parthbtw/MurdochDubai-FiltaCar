import animate from 'tailwindcss-animate'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries([
        'background', 'foreground', 'ground', 'primary', 'primary-foreground',
        'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
        'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
        'popover', 'popover-foreground', 'border', 'input', 'ring',
        'ready', 'ready-soft', 'warning', 'warning-soft', 'danger', 'danger-soft',
      ].map(token => [token, `hsl(var(--${token}) / <alpha-value>)`])),
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) / 2)', sm: 'calc(var(--radius) / 2)' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        arabic: ['-apple-system', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        'large-title': ['34px', '41px'], title: ['28px', '34px'],
        'title-2': ['22px', '28px'], 'title-3': ['20px', '26px'],
        base: ['17px', '25px'], callout: ['16px', '23px'],
        sm: ['15px', '21px'], footnote: ['13px', '19px'], xs: ['12px', '18px'],
      },
    },
  },
  plugins: [animate],
}
