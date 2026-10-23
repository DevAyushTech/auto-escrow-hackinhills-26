/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#f7fbff',
        forest: '#0b2545',
        sage: '#a8c5dc',
        ink: '#0b2545',
        panel: '#ffffff',
        line: '#dce6f0',
        accent: '#0b2545',
        electric: '#2167c5',
        'blue-dark': '#2167c5',
      },
      boxShadow: {
        soft: '0 18px 48px rgba(11, 37, 69, 0.10)',
      },
    },
  },
  plugins: [],
}
