const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: include workspace root in watch folders (merged with Expo defaults)
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

// Prioritize local node_modules, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force resolution of certain modules to avoid duplicates or missing modules
const mobileModules = path.resolve(projectRoot, "node_modules");
config.resolver.extraNodeModules = {
  react: path.resolve(mobileModules, "react"),
  "react-dom": path.resolve(mobileModules, "react-dom"),
  "react-native": path.resolve(mobileModules, "react-native"),
  "react/jsx-runtime": path.resolve(mobileModules, "react/jsx-runtime"),
  "react/jsx-dev-runtime": path.resolve(mobileModules, "react/jsx-dev-runtime"),
  punycode: path.resolve(workspaceRoot, "node_modules/punycode"),
};

// Block resolution of react from workspace root
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force react and react-native to resolve from mobile's node_modules
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return {
      filePath: require.resolve(moduleName, { paths: [mobileModules] }),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
