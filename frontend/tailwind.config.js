/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ps: {
          dark: '#08090e',
          'dark-card': '#12141f',
          'dark-item': '#1b1e2e',
          blue: '#006fcd',
          'neon-blue': '#00f0ff',
          'neon-pink': '#ff007f',
          'neon-purple': '#9b30ff',
          green: '#00ff88',
          yellow: '#ffcc00',
        }
      },
      boxShadow: {
        'neon-blue': '0 0 10px rgba(0, 240, 255, 0.5)',
        'neon-pink': '0 0 10px rgba(255, 0, 127, 0.5)',
        'neon-purple': '0 0 10px rgba(155, 48, 255, 0.5)',
        'neon-green': '0 0 10px rgba(0, 255, 136, 0.5)',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
