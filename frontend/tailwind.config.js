/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1220',
        panel: '#111b2d',
        line: '#24334c',
        accent: '#35c6c0',
        electric: '#69a8ff',
      },
      boxShadow: {
        soft: '0 16px 40px rgba(2, 8, 23, 0.28)',
      },
    },
  },
  plugins: [],
}
