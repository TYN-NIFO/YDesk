/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Status badges are built as `status-${status}` in some pages
  safelist: ['status-submitted', 'status-approved', 'status-finance-approved', 'status-paid', 'status-done', 'status-rejected'],
  theme: {
    extend: {
      colors: {
        blue: { 50: "#f0f3f9", 100: "#e1e7f2", 200: "#c4cfe3", 300: "#a1b3d2", 400: "#718caf", 500: "#3f5e88", 600: "#1c365d", 700: "#14294c", 800: "#0f2347", 900: "#0b1b36" },
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

