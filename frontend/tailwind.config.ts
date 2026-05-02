import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#F3F7FB",
        calm: "#101720",
        sage: "#4FD1C5",
        clay: "#F87171",
        tide: "#60A5FA"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(31, 41, 51, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

