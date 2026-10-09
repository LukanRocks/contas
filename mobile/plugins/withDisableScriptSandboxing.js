// Xcode's user script sandbox stops the "Bundle React Native code and images"
// phase from reading the project and writing main.jsbundle, which breaks Release builds.
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withDisableScriptSandboxing(config) {
  return withXcodeProject(config, (cfg) => {
    const configs = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const buildSettings = configs[key].buildSettings;
      if (buildSettings) buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
    return cfg;
  });
};
