/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Arial", "sans-serif"],
      },
      colors: {
        ink: "#161916",
        muted: "#777d76",
        canvas: "#f7f8f5",
        leaf: "#c9f36a",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(24, 32, 19, 0.07)",
      },
    },
  },
  plugins: [],
};
