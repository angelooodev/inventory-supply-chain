/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#2C2B30', // Charleston Green
        surface: '#4F4F51',    // Dark Liver
        textmain: '#D6D6D6',   // Light Gray
        primary: '#F2C4CE',    // Orchid Pink
        secondary: '#F58F7C',  // Tea Rose
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'], 
      }
    },
  },
  plugins: [],
}