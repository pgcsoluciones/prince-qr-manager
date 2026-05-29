/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Primary blue – #2563eb (blue-600) used throughout the app
        primary: {
          DEFAULT: "#2563eb",
          light:   "#dbeafe",
          dark:    "#1d4ed8",
          50:      "#eff6ff",
          100:     "#dbeafe",
          200:     "#bfdbfe",
          500:     "#3b82f6",
          600:     "#2563eb",
          700:     "#1d4ed8",
        },
        // Keep brand as an alias so existing pages don't break
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
};
