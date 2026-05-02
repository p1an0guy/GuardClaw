import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        calm: "#eef6f1",
        sage: "#78957a",
        clay: "#b08968",
        tide: "#497b8f"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(31, 41, 51, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

