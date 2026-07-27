module.exports = {
  extends: "expo",
  rules: {
    indent: ["error", 2],
    semi: ["error", "always"],
    quotes: ["error", "single"],
  },
  overrides: [
    {
      files: ["**/*.tsx"],
      rules: {
        "react-hooks/immutability": "off",
      },
    },
  ],
};