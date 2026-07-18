// Example of merging multiple Metro configs
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Get the base config
const config = getDefaultConfig(__dirname);
const  { resolver } = config;

// Merge additional config options
const additionalConfig = {
  // Add your additional config options here
  resolver: {
    // Example resolver options
    assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...resolver.sourceExts, "svg"],
    // Evita que Metro escanee carpetas de tooling/agentes (OpenCode, skills, etc.)
    blockList: [
      ...(Array.isArray(resolver.blockList)
        ? resolver.blockList
        : resolver.blockList
        ? [resolver.blockList]
        : []),
      /.*\.opencode[/\\].*/,
      /.*\.agents[/\\].*/,
      /.*\.claude[/\\].*/,
    ],
  },
  transformer: {
    // Example transformer options
    babelTransformerPath: require.resolve("react-native-svg-transformer/expo")
  }
};

// Merge configs
const mergedConfig = {
  ...config,
  ...additionalConfig,
  // Deep merge specific nested options
  resolver: {
    ...config.resolver,
    ...additionalConfig.resolver
  },
  transformer: {
    ...config.transformer, // Preserve original transformer settings
    ...additionalConfig.transformer // Add additional transformer settings
  }
};

module.exports = withNativeWind(mergedConfig, { input: "./global.css" });