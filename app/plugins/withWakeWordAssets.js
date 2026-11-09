// P17: Porcupine on Android loads custom keyword files from the APK's assets folder, which only
// exists after prebuild. This copies app/assets/wake/*.ppn there on every prebuild / EAS build.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withWakeWordAssets(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'assets', 'wake');
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
      if (fs.existsSync(src)) {
        fs.mkdirSync(dest, { recursive: true });
        for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.ppn'))) {
          fs.copyFileSync(path.join(src, f), path.join(dest, f));
        }
      }
      return cfg;
    },
  ]);
};
