/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4A90E2',
        'primary-light': '#E8F4F8',
        'primary-dark': '#2C5F8D',
        'bg-main': '#FAFBFC',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'snowfall': 'snowfall linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        snowfall: {
          '0%': { transform: 'translateY(-10px)' },
          '100%': { transform: 'translateY(100vh)' },
        }
      }
    },
  },
  plugins: [],
}
