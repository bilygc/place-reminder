/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#00D87D", // Bright green - keeping your original
        secondary: "#00A560", // Darker green - keeping your original
        accent: "#FFB100", // Warm orange/gold for accent
        background: "#17705A", // Forest green - keeping your original
        gray: "#3C3C3C", // keeping your original

        // Status colors
        success: "#00F593", // Bright mint green
        error: "#EB4646", // keeping your original red
        warning: "#FFA500", // Orange
        info: "#00B4D8", // Light blue

        // Theme colors
        dark: "#1A2F25", // Very dark green-tinted
        light: "#E1FFF3", // keeping your original light mint
        muted: "#94A3A0", // Desaturated green-gray

        // Base colors - keeping your originals
        white: {
          DEFAULT: "#FFFFFF",
          50: "#F4FFFA",
        },
        black: {
          DEFAULT: "#000000",
          100: "#0D0D0D",
          200: "#1A1A1A",
        },

        // Extended green shades
        green: {
          50: "#E1FFF3", // Your light color
          100: "#B3FFE0",
          200: "#85FFD1",
          300: "#57FFBE",
          400: "#29FFAB",
          500: "#00D87D", // Your primary
          600: "#00A560", // Your secondary
          700: "#17705A", // Your background
          800: "#0F4D3D",
          900: "#1A2F25", // Your dark
        },

        // Utility colors - keeping your originals
        transparent: "transparent",
        current: "currentColor",
        inherit: "inherit",
      },
      boxShadow: {
        // Basic shadows
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        DEFAULT:
          "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
        lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
        xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",

        // Inner shadow
        inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)",

        // Colored shadows using your theme colors
        primary: "0 4px 14px 0 rgba(0, 216, 125, 0.39)",
        success: "0 4px 14px 0 rgba(0, 245, 147, 0.39)",
        error: "0 4px 14px 0 rgba(235, 70, 70, 0.39)",

        // Special effects
        float: "0 10px 35px -5px rgba(0, 0, 0, 0.15)",
        card: "0 0 0 1px rgba(0, 0, 0, 0.05), 0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        sharp: "-4px 4px 0 0 rgba(0, 0, 0, 0.2)",
        glow: "0 0 15px rgba(0, 216, 125, 0.5)", // Using your primary color
        "glow-light": "0 0 15px rgba(225, 255, 243, 0.5)", // Using your light color

        // Directional shadows
        top: "0 -4px 6px -1px rgba(0, 0, 0, 0.1)",
        right: "4px 0 6px -1px rgba(0, 0, 0, 0.1)",
        left: "-4px 0 6px -1px rgba(0, 0, 0, 0.1)",

        // Dark mode specific shadows
        "dark-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        "dark-md": "0 4px 6px -1px rgba(0, 0, 0, 0.4)",
        "dark-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
        "dark-glow": "0 0 15px rgba(0, 216, 125, 0.3)",

        // Remove shadow
        none: "none",
      },
      fontFamily: {
        inblack: ["Inter-Black", "sans-serif"],
        inblackItalic: ["Inter-BlackItalic", "sans-serif"],
        inbold: ["Inter-Bold", "sans-serif"],
        inboldItalic: ["Inter-BoldItalic", "sans-serif"],
        inextraBold: ["Inter-ExtraBold", "sans-serif"],
        inextraBoldItalic: ["Inter-ExtraBoldItalic", "sans-serif"],
        inextraLight: ["Inter-ExtraLight", "sans-serif"],
        inextraLightItalic: ["Inter-ExtraLightItalic", "sans-serif"],
        initalic: ["Inter-Italic", "sans-serif"],
        inlight: ["Inter-Light", "sans-serif"],
        inlightItalic: ["Inter-LightItalic", "sans-serif"],
        inmedium: ["Inter-Medium", "sans-serif"],
        inmediumItalic: ["Inter-MediumItalic", "sans-serif"],
        inregular: ["Inter-Regular", "sans-serif"],
        insemiBold: ["Inter-SemiBold", "sans-serif"],
        insemiBoldItalic: ["Inter-SemiBoldItalic", "sans-serif"],
        inthin: ["Inter-Thin", "sans-serif"],
        default: ["Inter-Regular", "sans-serif"],
      },
    },
  },
  plugins: [],
};
